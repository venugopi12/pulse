import {
  EventIdSchema,
  LiveSnapshotSchema,
  TenantIdSchema,
  type AnalyticsEvent,
  type TenantId,
} from "@pulse/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TENANT_PROFILES } from "../src/seed-data.js";
import { as, buildTestServer, connectWs, loginAs, type TestServer } from "./helpers.js";

const ACME = TenantIdSchema.parse("tnt_acme");
const NOVA = TenantIdSchema.parse("tnt_nova");

let srv: TestServer;
let port: number;
let acmeToken: string;

beforeAll(async () => {
  srv = await buildTestServer();
  port = await srv.listen(0);
  acmeToken = (await loginAs(srv, "viewer@acme.test")).token;
});
afterAll(() => srv.close());

let n = 0;
const ev = (tenantId: TenantId, type = "test.event"): AnalyticsEvent => ({
  id: EventIdSchema.parse(`evt_live_${n++}`),
  tenantId,
  type,
  source: "test",
  severity: "info",
  value: 1,
  timestamp: Date.now(),
});

describe("GET /api/live/snapshot", () => {
  it("returns only the caller's tenant: rollup types and recent events", async () => {
    const res = await as(srv, acmeToken).get("/api/live/snapshot?minutes=60");
    expect(res.status).toBe(200);
    const snap = LiveSnapshotSchema.parse(res.body);

    const acmeTypes = new Set(TENANT_PROFILES.find((p) => p.id === "tnt_acme")!.events.map((k) => k.type));
    const types = new Set(snap.rollups.flatMap((b) => b.rows.map((r) => r[0])));
    for (const t of types) expect(acmeTypes.has(t) || t === "test.event").toBe(true);
    expect(snap.recent.every((e) => e.tenantId === ACME)).toBe(true);
    expect(snap.seq).toBe(srv.store.events.seq(ACME));
  });

  it("rejects a tenantId in the query", async () => {
    expect((await as(srv, acmeToken).get("/api/live/snapshot?tenantId=tnt_nova")).status).toBe(400);
  });

  it("rollups agree exactly with the raw events behind them", () => {
    // The seed puts 200 raw events per tenant in the minutes before its fixed
    // "now"; everything earlier is rollup-only history.
    const seedNow = Date.UTC(2026, 0, 15, 12);
    const raw = srv.store.events.list(ACME, { limit: 10_000 }).filter((e) => e.timestamp <= seedNow);
    const firstRawBucket = raw[raw.length - 1]!.timestamp - (raw[raw.length - 1]!.timestamp % 60_000);
    let fromRollups = 0;
    for (const [t, bucket] of srv.store.rollups.get(ACME)) {
      if (t < firstRawBucket || t > seedNow) continue;
      for (const cell of bucket.values()) fromRollups += cell.count;
    }
    expect(raw).toHaveLength(200);
    expect(fromRollups).toBe(200);
  });
});

describe("POST /api/live/incident", () => {
  it("starts an incident for the caller's tenant only", async () => {
    const withSim = await buildTestServer({ simulatorRate: 1 });
    const admin = (await loginAs(withSim, "admin@nova.test")).token;
    const res = await as(withSim, admin).post("/api/live/incident", { durationSeconds: 60 });
    expect(res.status).toBe(202);
    const active = withSim.simulator!.state().incidents.map((i) => i.tenantId);
    expect(active).toEqual(["tnt_nova"]);
  });

  it("rejects a tenantId in the body", async () => {
    const withSim = await buildTestServer({ simulatorRate: 1 });
    const admin = (await loginAs(withSim, "admin@acme.test")).token;
    const res = await as(withSim, admin).post("/api/live/incident", { tenantId: "tnt_nova" });
    expect(res.status).toBe(400);
    expect(withSim.simulator!.state().incidents).toEqual([]);
  });

  it("answers 409 when the simulator is off", async () => {
    const admin = (await loginAs(srv, "admin@acme.test")).token;
    expect((await as(srv, admin).post("/api/live/incident", {})).status).toBe(409);
  });
});

describe("snapshot + live frames line up exactly (sequence numbers)", () => {
  it("frames carry consecutive firstSeq and the snapshot watermark splits them precisely", async () => {
    const sock = await connectWs(port, acmeToken);

    // 5 events, then a snapshot BEFORE the batch is flushed, then 5 more.
    for (let i = 0; i < 5; i++) srv.ingest(ev(ACME));
    srv.ingest(ev(NOVA)); // noise from another tenant: must not affect acme's sequence
    const snap = LiveSnapshotSchema.parse((await as(srv, acmeToken).get("/api/live/snapshot?minutes=5")).body);
    for (let i = 0; i < 5; i++) srv.ingest(ev(ACME));
    srv.flush();

    await sock.waitFor(() => sock.events().length >= 10);
    const frames = sock.messages.filter((m) => m.type === "events");

    // What a client does: number each event, keep only those after the watermark.
    const numbered = frames.flatMap((f) => f.events.map((e, i) => ({ e, seq: f.firstSeq + i })));
    const seqs = numbered.map((x) => x.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b)); // ordered
    expect(new Set(seqs).size).toBe(seqs.length); // no duplicates
    expect(seqs[seqs.length - 1]).toBe(srv.store.events.seq(ACME));

    const newAfterSnapshot = numbered.filter((x) => x.seq > snap.seq);
    expect(newAfterSnapshot).toHaveLength(5);
    sock.ws.close();
  });
});
