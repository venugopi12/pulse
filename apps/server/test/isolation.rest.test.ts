import {
  DashboardListResponseSchema,
  DashboardSchema,
  EventsResponseSchema,
  InviteListResponseSchema,
  InviteSchema,
  UserListResponseSchema,
} from "@pulse/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { as, buildTestServer, loginAs, type TestServer } from "./helpers.js";

/**
 * Attacker: Acme's ADMIN (highest privilege in their own tenant).
 * Target:   Nova Retail's data.
 * Every test tries a different way to reach across the tenant boundary.
 */
let srv: TestServer;
let acmeAdmin: string;
const NOVA_DASH = "/api/dashboards/dash_nova-retail_overview";

beforeAll(async () => {
  srv = await buildTestServer();
  acmeAdmin = (await loginAs(srv, "admin@acme.test")).token;
});

describe("REST tenant isolation", () => {
  it("GET /api/events returns only the caller's tenant", async () => {
    const res = await as(srv, acmeAdmin).get("/api/events?limit=1000");
    const { events } = EventsResponseSchema.parse(res.body);
    expect(events.length).toBe(200);
    expect(new Set(events.map((e) => e.tenantId))).toEqual(new Set(["tnt_acme"]));
  });

  it("rejects ?tenantId= in the query instead of honouring it", async () => {
    const res = await as(srv, acmeAdmin).get("/api/events?tenantId=tnt_nova");
    expect(res.status).toBe(400);
  });

  it("lists only the caller's dashboards", async () => {
    const { dashboards } = DashboardListResponseSchema.parse((await as(srv, acmeAdmin).get("/api/dashboards")).body);
    expect(dashboards.map((d) => d.id)).toEqual(["dash_acme-health_overview"]);
  });

  it("another tenant's dashboard is 404 (not 403) on read", async () => {
    const res = await as(srv, acmeAdmin).get(NOVA_DASH);
    expect(res.status).toBe(404);
  });

  it("another tenant's dashboard is 404 on write, and is left untouched", async () => {
    const before = srv.store.dashboards.list(srv.store.users.findByEmail("admin@nova.test")!.tenantId)[0]!;
    const res = await as(srv, acmeAdmin).put(NOVA_DASH, { name: "pwned", widgets: [], version: before.version });
    expect(res.status).toBe(404);
    const after = srv.store.dashboards.get(before.tenantId, before.id);
    expect(after).toEqual(before);
  });

  it("rejects a tenantId smuggled into a request body", async () => {
    const own = DashboardSchema.parse((await as(srv, acmeAdmin).get("/api/dashboards/dash_acme-health_overview")).body);
    const res = await as(srv, acmeAdmin).put("/api/dashboards/dash_acme-health_overview", {
      widgets: own.widgets,
      version: own.version,
      tenantId: "tnt_nova",
    });
    expect(res.status).toBe(400);

    const invite = await as(srv, acmeAdmin).post("/api/users/invites", {
      email: "x@nova.test",
      role: "viewer",
      tenantId: "tnt_nova",
    });
    expect(invite.status).toBe(400);
  });

  it("lists only the caller's users", async () => {
    const { users } = UserListResponseSchema.parse((await as(srv, acmeAdmin).get("/api/users")).body);
    expect(users.map((u) => u.email).sort()).toEqual(["admin@acme.test", "viewer@acme.test"]);
  });

  it("invites land in the caller's tenant, and never reveal other tenants' users", async () => {
    // admin@nova.test exists in ANOTHER tenant. Answering 409 here would leak that.
    const res = await as(srv, acmeAdmin).post("/api/users/invites", { email: "admin@nova.test", role: "viewer" });
    expect(res.status).toBe(201);
    expect(InviteSchema.parse(res.body).tenantId).toBe("tnt_acme");

    const novaAdmin = (await loginAs(srv, "admin@nova.test")).token;
    const { invites } = InviteListResponseSchema.parse((await as(srv, novaAdmin).get("/api/users/invites")).body);
    expect(invites).toEqual([]);
  });
});
