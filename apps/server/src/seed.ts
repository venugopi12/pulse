import {
  DashboardIdSchema,
  DashboardSchema,
  ROLLUP_BUCKET_MS,
  TenantSchema,
  UserIdSchema,
  bucketStart,
} from "@pulse/shared";
import { hashPassword } from "./auth/password.js";
import { createRng } from "./lib/random.js";
import { DEMO_PASSWORD, TENANT_PROFILES } from "./seed-data.js";
import { createIdFactory, makeEvent, syntheticMinute, trafficShape } from "./sim/generator.js";
import type { Store } from "./store/types.js";

export interface SeedOptions {
  /** "Now" for the generated history; injectable so tests are deterministic. */
  now?: number;
  /** Raw events per tenant, ending at `now` (feeds the live feed + /api/events). */
  eventsPerTenant?: number;
  /** Minutes of rollup-only history before the raw events. 0 = none. */
  historyMinutes?: number;
  /** Must match the simulator, so live traffic continues the same curve. */
  ratePerTenant?: number;
  seed?: number;
}

export interface SeedSummary {
  tenants: number;
  users: number;
  events: number;
  historyMinutes: number;
}

/**
 * Fills a store with 3 tenants, an admin + viewer each, a default dashboard,
 * a day of per-minute rollup history, and a tail of recent raw events.
 * Every value passes through the shared Zod schemas, so seed data is held to
 * the same contract as real API input.
 */
export async function seedStore(store: Store, opts: SeedOptions = {}): Promise<SeedSummary> {
  const { now = Date.now(), eventsPerTenant = 3000, historyMinutes = 1440, ratePerTenant = 30, seed = 42 } = opts;
  const rng = createRng(seed);
  // Hash once and reuse: bcrypt is deliberately slow.
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  let users = 0;
  let events = 0;

  for (const profile of TENANT_PROFILES) {
    const tenant = TenantSchema.parse({
      id: profile.id,
      slug: profile.slug,
      name: profile.name,
      accent: profile.accent,
    });
    store.tenants.insert(tenant);

    for (const u of profile.users) {
      store.users.insert({
        id: UserIdSchema.parse(`usr_${profile.slug}_${u.role}`),
        tenantId: tenant.id,
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
      });
      users++;
    }

    // Parse through the shared schema: seed widgets obey the same rules as an admin's edit.
    store.dashboards.insert(
      DashboardSchema.parse({
        id: DashboardIdSchema.parse(`dash_${profile.slug}_overview`),
        tenantId: tenant.id,
        name: "Overview",
        widgets: profile.widgets,
        version: 1,
        updatedAt: now,
        updatedBy: null,
      }),
    );

    // Raw events cover the most recent stretch, starting on a minute boundary
    // so no rollup minute is half synthetic, half raw.
    const rawSpanMs = (eventsPerTenant / (ratePerTenant * trafficShape(now))) * 1000;
    const rawStart = bucketStart(now - rawSpanMs);

    // 1) Rollup-only history, oldest first, with two past incidents.
    const incidents = [0.3, 0.75].map((f) => Math.floor(historyMinutes * f + rng.next() * 30));
    for (let m = historyMinutes; m >= 1; m--) {
      const t = rawStart - m * ROLLUP_BUCKET_MS;
      const minuteIndex = historyMinutes - m;
      const incident = incidents.some((start) => minuteIndex >= start && minuteIndex < start + 6);
      const perMinute = ratePerTenant * 60 * trafficShape(t);
      store.rollups.seedBucket(tenant.id, t, syntheticMinute(rng, profile.events, perMinute, incident));
    }

    // 2) Raw recent events, evenly spaced from rawStart to now.
    const nextId = createIdFactory(profile.slug);
    const step = (now - rawStart) / eventsPerTenant;
    for (let i = 0; i < eventsPerTenant; i++) {
      const ts = Math.floor(rawStart + (i + 1) * step);
      store.events.append(makeEvent(rng, tenant.id, profile.events, false, ts, nextId));
    }
    events += eventsPerTenant;
  }

  return { tenants: TENANT_PROFILES.length, users, events, historyMinutes };
}
