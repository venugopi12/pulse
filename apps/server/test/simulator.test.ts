import { TenantIdSchema, type AnalyticsEvent } from "@pulse/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TENANT_PROFILES } from "../src/seed-data.js";
import { createSimulator } from "../src/sim/simulator.js";

const acme = TENANT_PROFILES[0]!;
const tenant = { tenantId: TenantIdSchema.parse(acme.id), slug: acme.slug, kinds: acme.events };

describe("simulator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 15:00 local = peak of the daily traffic curve (multiplier 1.0).
    const peak = new Date(2026, 0, 15, 15, 0, 0);
    vi.setSystemTime(peak);
  });
  afterEach(() => vi.useRealTimers());

  it("emits the configured rate without drift", () => {
    const events: AnalyticsEvent[] = [];
    const sim = createSimulator({
      tenants: [tenant],
      ratePerTenant: 23, // deliberately not a multiple of 10/sec
      ingest: (e) => events.push(e),
      incidentsPerMinute: 0,
      seed: 1,
    });
    for (let i = 0; i < 100; i++) sim.tick(); // 100 ticks x 100ms = 10s
    expect(events.length).toBeGreaterThanOrEqual(229);
    expect(events.length).toBeLessThanOrEqual(230);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it("raises the error share during an incident", () => {
    const errorShare = (incident: boolean) => {
      const events: AnalyticsEvent[] = [];
      const sim = createSimulator({ tenants: [tenant], ratePerTenant: 200, ingest: (e) => events.push(e), incidentsPerMinute: 0, seed: 2 });
      if (incident) sim.startIncident(tenant.tenantId, 60_000);
      for (let i = 0; i < 100; i++) sim.tick();
      return events.filter((e) => e.severity === "error").length / events.length;
    };
    expect(errorShare(true)).toBeGreaterThan(errorShare(false) * 3);
  });

  it("starts and stops on a timer", () => {
    let n = 0;
    const sim = createSimulator({ tenants: [tenant], ratePerTenant: 10, ingest: () => n++, incidentsPerMinute: 0 });
    sim.start();
    vi.advanceTimersByTime(1000);
    sim.stop();
    const after = n;
    vi.advanceTimersByTime(1000);
    expect(after).toBeGreaterThan(5);
    expect(n).toBe(after);
  });
});
