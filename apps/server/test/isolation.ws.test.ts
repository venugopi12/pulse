import {
  DashboardSchema,
  EventIdSchema,
  TenantIdSchema,
  WS_PROTOCOL,
  WsCloseCode,
  wsProtocols,
  type AnalyticsEvent,
  type TenantId,
} from "@pulse/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTokenService } from "../src/auth/jwt.js";
import {
  TEST_SECRET,
  as,
  buildTestServer,
  connectWs,
  loginAs,
  rejectedStatus,
  type TestServer,
  type TestSocket,
} from "./helpers.js";

const ACME = TenantIdSchema.parse("tnt_acme");
const NOVA = TenantIdSchema.parse("tnt_nova");
const ORBIT = TenantIdSchema.parse("tnt_orbit");

let srv: TestServer;
let port: number;
const tokens: Record<string, string> = {};

beforeAll(async () => {
  srv = await buildTestServer();
  port = await srv.listen(0); // random free port
  for (const email of ["admin@acme.test", "viewer@acme.test", "viewer@nova.test", "admin@orbit.test"]) {
    tokens[email] = (await loginAs(srv, email)).token;
  }
});
afterAll(() => srv.close());

let seq = 0;
const makeEvent = (tenantId: TenantId): AnalyticsEvent => ({
  id: EventIdSchema.parse(`evt_test_${seq++}`),
  tenantId,
  type: "test.event",
  source: "test",
  severity: "info",
  value: seq,
  timestamp: Date.now(),
});

describe("WebSocket tenant isolation", () => {
  it("a client only ever receives its own tenant's events", async () => {
    const sockets: Record<string, TestSocket> = {
      acmeAdmin: await connectWs(port, tokens["admin@acme.test"]!),
      acmeViewer: await connectWs(port, tokens["viewer@acme.test"]!),
      novaViewer: await connectWs(port, tokens["viewer@nova.test"]!),
      orbitAdmin: await connectWs(port, tokens["admin@orbit.test"]!),
    };

    // 600 events, interleaved across all three tenants: A, N, O, A, N, O…
    const tenants = [ACME, NOVA, ORBIT];
    const sent = new Map<TenantId, number>();
    for (let i = 0; i < 600; i++) {
      const t = tenants[i % 3]!;
      srv.ingest(makeEvent(t));
      sent.set(t, (sent.get(t) ?? 0) + 1);
    }

    const expected: Record<string, TenantId> = {
      acmeAdmin: ACME,
      acmeViewer: ACME,
      novaViewer: NOVA,
      orbitAdmin: ORBIT,
    };

    for (const [name, sock] of Object.entries(sockets)) {
      const tenant = expected[name]!;
      await sock.waitFor(() => sock.events().length >= sent.get(tenant)!);
    }
    // Give any stray cross-tenant message time to arrive before asserting.
    await new Promise((r) => setTimeout(r, 100));

    for (const [name, sock] of Object.entries(sockets)) {
      const tenant = expected[name]!;
      const events = sock.events();
      expect(events, `${name} event count`).toHaveLength(sent.get(tenant)!);
      expect(events.every((e) => e.tenantId === tenant), `${name} saw a foreign event`).toBe(true);
    }

    // The `hello` frame confirms which tenant the server bound each socket to.
    const hello = sockets.novaViewer!.messages[0];
    expect(hello).toMatchObject({ type: "hello", tenantId: NOVA, role: "viewer" });

    for (const s of Object.values(sockets)) s.ws.close();
  });

  it("dashboard edits are pushed to the editor's tenant only", async () => {
    const acmeViewer = await connectWs(port, tokens["viewer@acme.test"]!);
    const novaViewer = await connectWs(port, tokens["viewer@nova.test"]!);

    const path = "/api/dashboards/dash_acme-health_overview";
    const admin = as(srv, tokens["admin@acme.test"]!);
    const d = DashboardSchema.parse((await admin.get(path)).body);
    expect((await admin.put(path, { name: "Ops overview", widgets: d.widgets, version: d.version })).status).toBe(200);

    await acmeViewer.waitFor(() => acmeViewer.messages.some((m) => m.type === "dashboard.updated"));
    await new Promise((r) => setTimeout(r, 100));
    expect(novaViewer.messages.some((m) => m.type === "dashboard.updated")).toBe(false);

    acmeViewer.ws.close();
    novaViewer.ws.close();
  });

  it("ignores client attempts to pick a tenant", async () => {
    const acme = await connectWs(port, tokens["viewer@acme.test"]!);
    acme.ws.send(JSON.stringify({ type: "subscribe", tenantId: NOVA }));
    await acme.waitFor(() => acme.messages.some((m) => m.type === "error"));

    srv.ingest(makeEvent(NOVA));
    await new Promise((r) => setTimeout(r, 100));
    expect(acme.events().some((e) => e.tenantId === NOVA)).toBe(false);
    acme.ws.close();
  });

  it("answers ping with pong", async () => {
    const s = await connectWs(port, tokens["viewer@acme.test"]!);
    s.ws.send(JSON.stringify({ type: "ping", t: 123 }));
    await s.waitFor(() => s.messages.some((m) => m.type === "pong" && m.t === 123));
    s.ws.close();
  });
});

describe("WebSocket handshake authentication", () => {
  it("rejects a connection with no token (401)", async () => {
    expect(await rejectedStatus(port, [WS_PROTOCOL])).toBe(401);
  });

  it("rejects a garbage token (401)", async () => {
    expect(await rejectedStatus(port, wsProtocols("garbage.token.here"))).toBe(401);
  });

  it("rejects a token signed with another secret (401)", async () => {
    const forger = createTokenService("attacker-secret-that-is-also-32-chars-long!!", "1h");
    const { token } = await forger.sign({
      sub: srv.store.users.findByEmail("admin@nova.test")!.id,
      tenantId: NOVA,
      role: "admin",
    });
    expect(await rejectedStatus(port, wsProtocols(token))).toBe(401);
  });

  it("rejects a disallowed Origin (403)", async () => {
    expect(await rejectedStatus(port, wsProtocols(tokens["viewer@acme.test"]!), "https://evil.example")).toBe(403);
  });

  it("rejects an unknown path (404)", async () => {
    expect(await rejectedStatus(port, wsProtocols(tokens["viewer@acme.test"]!), undefined, "/not-ws")).toBe(404);
  });

  it("negotiates the pulse.v1 protocol and never echoes the token", async () => {
    const s = await connectWs(port, tokens["viewer@acme.test"]!);
    expect(s.ws.protocol).toBe(WS_PROTOCOL);
    s.ws.close();
  });

  it("closes the socket with 4001 when the token expires", async () => {
    // jose's exp has 1-second resolution. 2s, not 1s: with 1s a busy machine
    // can take long enough to connect that the token has ALREADY expired at
    // the handshake (correctly rejected there), so the test would flake.
    const shortLived = createTokenService(TEST_SECRET, "2s");
    const user = srv.store.users.findByEmail("viewer@acme.test")!;
    const { token } = await shortLived.sign({ sub: user.id, tenantId: user.tenantId, role: user.role });
    const s = await connectWs(port, token);
    const { code } = await s.closed;
    expect(code).toBe(WsCloseCode.TokenExpired);
  }, 6000);
});
