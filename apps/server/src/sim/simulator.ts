import type { AnalyticsEvent, TenantId } from "@pulse/shared";
import { createRng } from "../lib/random.js";
import type { EventKind } from "../seed-data.js";
import { createIdFactory, makeEvent, trafficShape } from "./generator.js";

export interface SimTenant {
  tenantId: TenantId;
  slug: string;
  kinds: readonly EventKind[];
}

export interface SimulatorOptions {
  tenants: SimTenant[];
  /** Average events per second per tenant at peak time of day. */
  ratePerTenant: number;
  ingest: (event: AnalyticsEvent) => void;
  tickMs?: number;
  /** Chance per tenant per minute that an incident starts. */
  incidentsPerMinute?: number;
  seed?: number;
}

export interface SimulatorState {
  running: boolean;
  ratePerTenant: number;
  incidents: { tenantId: TenantId; endsAt: number }[];
}

/**
 * Emits realistic event traffic for every tenant.
 *
 * - A fractional accumulator turns "20 events/sec" into whole events per
 *   tick without drift (e.g. 2 events one tick, 2 the next, 3 the next…).
 * - Every event gets `Date.now()` at the moment it is ingested, so its
 *   timestamp and its sequence number agree.
 * - Occasional incidents make errors and latency spike for 2–4 minutes, which
 *   gives Phase 5's threshold alerts something real to catch.
 */
export function createSimulator(opts: SimulatorOptions) {
  const { tenants, ingest, tickMs = 100, incidentsPerMinute = 0.08 } = opts;
  let ratePerTenant = opts.ratePerTenant;
  const rng = createRng(opts.seed ?? Date.now() % 2 ** 31);
  const carry = new Map<TenantId, number>();
  const incidentUntil = new Map<TenantId, number>();
  const nextIds = new Map(tenants.map((t) => [t.tenantId, createIdFactory(`${t.slug}-live-${Date.now().toString(36)}`)]));
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick() {
    const now = Date.now();
    for (const t of tenants) {
      // Maybe start an incident (converted from per-minute to per-tick odds).
      if (!isIncident(t.tenantId, now) && rng.next() < (incidentsPerMinute * tickMs) / 60_000) {
        startIncident(t.tenantId, 120_000 + rng.next() * 120_000);
      }
      const incident = isIncident(t.tenantId, now);

      const expected = (ratePerTenant * trafficShape(now) * tickMs) / 1000 + (carry.get(t.tenantId) ?? 0);
      const n = Math.floor(expected);
      carry.set(t.tenantId, expected - n);

      const nextId = nextIds.get(t.tenantId)!;
      for (let i = 0; i < n; i++) {
        ingest(makeEvent(rng, t.tenantId, t.kinds, incident, Date.now(), nextId));
      }
    }
  }

  function isIncident(tenantId: TenantId, now = Date.now()) {
    return (incidentUntil.get(tenantId) ?? 0) > now;
  }

  function startIncident(tenantId: TenantId, durationMs: number) {
    incidentUntil.set(tenantId, Date.now() + durationMs);
  }

  return {
    start() {
      if (!timer) timer = setInterval(tick, tickMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    setRate(rate: number) {
      ratePerTenant = rate;
    },
    startIncident,
    /** Exposed for tests: run one tick synchronously. */
    tick,
    state(): SimulatorState {
      const now = Date.now();
      return {
        running: timer !== null,
        ratePerTenant,
        incidents: [...incidentUntil]
          .filter(([, until]) => until > now)
          .map(([tenantId, endsAt]) => ({ tenantId, endsAt })),
      };
    },
  };
}
export type Simulator = ReturnType<typeof createSimulator>;
