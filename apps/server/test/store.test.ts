import { describe, expect, it } from "vitest";
import { TenantIdSchema, type Dashboard } from "@pulse/shared";
import { buildTestServer } from "./helpers.js";

describe("memory store isolation", () => {
  it("only ever returns events for the requested tenant", async () => {
    const { store } = await buildTestServer();
    for (const tenant of store.tenants.list()) {
      const events = store.events.list(tenant.id, { limit: 10_000 });
      expect(events.length).toBe(200);
      expect(events.every((e) => e.tenantId === tenant.id)).toBe(true);
    }
  });

  it("returns events newest-first and honours since/limit/severity", async () => {
    const { store } = await buildTestServer();
    const id = TenantIdSchema.parse("tnt_acme");
    const all = store.events.list(id, { limit: 10_000 });
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1]!.timestamp).toBeGreaterThanOrEqual(all[i]!.timestamp);
    }
    expect(store.events.list(id, { limit: 5 })).toHaveLength(5);
    const cutoff = all[10]!.timestamp;
    expect(store.events.list(id, { since: cutoff, limit: 10_000 }).every((e) => e.timestamp >= cutoff)).toBe(true);
    expect(store.events.list(id, { severity: "warn", limit: 10_000 }).every((e) => e.severity === "warn")).toBe(true);
  });

  it("refuses cross-tenant user lookups and mutations by id", async () => {
    const { store } = await buildTestServer();
    const acme = TenantIdSchema.parse("tnt_acme");
    const novaAdmin = store.users.findByEmail("admin@nova.test")!;
    expect(store.users.findById(acme, novaAdmin.id)).toBeUndefined();
    expect(store.users.setRole(acme, novaAdmin.id, "viewer")).toBe(false);
    expect(store.users.remove(acme, novaAdmin.id)).toBe(false);
    expect(store.users.findById(novaAdmin.tenantId, novaAdmin.id)?.role).toBe("admin");
  });

  it("dashboard save is compare-and-swap on version", async () => {
    const { store } = await buildTestServer();
    const acme = TenantIdSchema.parse("tnt_acme");
    const [dash] = store.dashboards.list(acme);
    const rename = (name: string) => (d: Dashboard): Dashboard => ({ ...d, name });
    const first = store.dashboards.save(acme, dash!.id, 1, rename("A"));
    const stale = store.dashboards.save(acme, dash!.id, 1, rename("B"));
    expect(first).toMatchObject({ ok: true, dashboard: { name: "A", version: 2 } });
    expect(stale).toMatchObject({ ok: false, reason: "version_conflict" });
  });
});
