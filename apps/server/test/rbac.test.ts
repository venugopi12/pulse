import { DashboardSchema, type Role } from "@pulse/shared";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { as, buildTestServer, loginAs, type TestServer } from "./helpers.js";

let srv: TestServer;
const tokens: Record<Role, string> = { admin: "", viewer: "" };
const DASH = "/api/dashboards/dash_acme-health_overview";

beforeAll(async () => {
  // simulatorRate creates a simulator (not started: we never call listen()).
  srv = await buildTestServer({ simulatorRate: 1 });
  tokens.admin = (await loginAs(srv, "admin@acme.test")).token;
  tokens.viewer = (await loginAs(srv, "viewer@acme.test")).token;
});

/** Fetch the current dashboard so PUTs always send the latest version. */
async function currentDashboard() {
  const res = await as(srv, tokens.admin).get(DASH);
  return DashboardSchema.parse(res.body);
}

let inviteCounter = 0;

/**
 * The permission matrix as a table. Each row is one endpoint and the status
 * each role must get. Adding an endpoint = adding a row.
 */
const MATRIX: {
  name: string;
  call: (token: string) => Promise<request.Response>;
  expected: Record<Role, number>;
}[] = [
  { name: "GET /api/events", call: (t) => as(srv, t).get("/api/events"), expected: { admin: 200, viewer: 200 } },
  { name: "GET /api/dashboards", call: (t) => as(srv, t).get("/api/dashboards"), expected: { admin: 200, viewer: 200 } },
  { name: "GET /api/dashboards/:id", call: (t) => as(srv, t).get(DASH), expected: { admin: 200, viewer: 200 } },
  {
    name: "PUT /api/dashboards/:id",
    call: async (t) => {
      const d = await currentDashboard();
      return as(srv, t).put(DASH, { widgets: d.widgets, version: d.version });
    },
    expected: { admin: 200, viewer: 403 },
  },
  { name: "GET /api/users", call: (t) => as(srv, t).get("/api/users"), expected: { admin: 200, viewer: 200 } },
  { name: "GET /api/users/invites", call: (t) => as(srv, t).get("/api/users/invites"), expected: { admin: 200, viewer: 403 } },
  {
    name: "POST /api/live/incident",
    call: (t) => as(srv, t).post("/api/live/incident", { durationSeconds: 30 }),
    expected: { admin: 202, viewer: 403 },
  },
  {
    name: "POST /api/users/invites",
    call: (t) => as(srv, t).post("/api/users/invites", { email: `new${++inviteCounter}@acme.test`, role: "viewer" }),
    expected: { admin: 201, viewer: 403 },
  },
];

describe("RBAC matrix", () => {
  for (const row of MATRIX) {
    for (const role of ["admin", "viewer"] as const) {
      it(`${row.name} as ${role} → ${row.expected[role]}`, async () => {
        const res = await row.call(tokens[role]);
        expect(res.status).toBe(row.expected[role]);
      });
    }
    it(`${row.name} without a token → 401`, async () => {
      const res = await row.call("not-a-token");
      expect(res.status).toBe(401);
    });
  }
});

describe("forbidden requests have no side effects", () => {
  it("a viewer's PUT does not change the dashboard", async () => {
    const before = await currentDashboard();
    const res = await as(srv, tokens.viewer).put(DASH, { name: "Hacked", widgets: [], version: before.version });
    expect(res.status).toBe(403);
    expect(await currentDashboard()).toEqual(before);
  });

  it("a viewer's invite is not created", async () => {
    await as(srv, tokens.viewer).post("/api/users/invites", { email: "sneaky@acme.test", role: "admin" });
    const { body } = await as(srv, tokens.admin).get("/api/users/invites");
    expect(JSON.stringify(body)).not.toContain("sneaky@acme.test");
  });
});

describe("role comes from the store, not just the token", () => {
  it("a demoted admin loses write access with the SAME token", async () => {
    const fresh = await buildTestServer();
    const { token, user } = await loginAs(fresh, "admin@nova.test");
    const path = "/api/dashboards/dash_nova-retail_overview";
    const dash = DashboardSchema.parse((await as(fresh, token).get(path)).body);

    fresh.store.users.setRole(user.tenantId, user.id, "viewer");

    const res = await as(fresh, token).put(path, { widgets: dash.widgets, version: dash.version });
    expect(res.status).toBe(403);
  });

  it("a deleted user's token stops working immediately", async () => {
    const fresh = await buildTestServer();
    const { token, user } = await loginAs(fresh, "viewer@orbit.test");
    expect((await as(fresh, token).get("/api/events")).status).toBe(200);

    fresh.store.users.remove(user.tenantId, user.id);

    expect((await as(fresh, token).get("/api/events")).status).toBe(401);
  });
});

describe("validation and concurrency on writes", () => {
  it("rejects an invalid widget config with 400 and field paths", async () => {
    const d = await currentDashboard();
    const bad = [{ id: "x", type: "bar", title: "No groupBy", layout: { colSpan: 1, rowSpan: 1 }, metric: { aggregate: "count", windowMinutes: 60 } }];
    const res = await as(srv, tokens.admin).put(DASH, { widgets: bad, version: d.version });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("groupBy");
  });

  it("returns 409 when saving with a stale version", async () => {
    const d = await currentDashboard();
    const first = await as(srv, tokens.admin).put(DASH, { widgets: d.widgets, version: d.version });
    const second = await as(srv, tokens.admin).put(DASH, { widgets: d.widgets, version: d.version });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it("returns 409 when inviting an existing member of the same tenant", async () => {
    const res = await as(srv, tokens.admin).post("/api/users/invites", { email: "viewer@acme.test", role: "viewer" });
    expect(res.status).toBe(409);
  });
});
