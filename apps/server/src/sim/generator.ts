import {
  EventIdSchema,
  type AnalyticsEvent,
  type RollupCell,
  type Severity,
  type TenantId,
} from "@pulse/shared";
import type { Rng } from "../lib/random.js";
import type { EventKind } from "../seed-data.js";

/**
 * Daily traffic rhythm in the server's local time: busiest ~15:00, quietest
 * ~03:00. Returns a multiplier between 0.6 and 1.0. The seed history and
 * the live simulator both use it, so live traffic continues the curve.
 */
export function trafficShape(timestamp: number): number {
  const d = new Date(timestamp);
  const hour = d.getHours() + d.getMinutes() / 60;
  return 0.8 + 0.2 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
}

const weightOf = (k: EventKind, incident: boolean) => k.weight * (incident ? (k.incident?.weight ?? 1) : 1);

/** Pick an event kind; during an incident, error kinds become far more likely. */
export function pickKind(rng: Rng, kinds: readonly EventKind[], incident: boolean): EventKind {
  const total = kinds.reduce((s, k) => s + weightOf(k, incident), 0);
  let r = rng.next() * total;
  for (const k of kinds) {
    r -= weightOf(k, incident);
    if (r <= 0) return k;
  }
  return kinds[kinds.length - 1]!;
}

/** Value + severity for one occurrence of a kind. */
export function sampleKind(rng: Rng, kind: EventKind, incident: boolean): { value: number; severity: Severity } {
  const raw = kind.value(rng) * (incident ? (kind.incident?.valueScale ?? 1) : 1);
  const value = Number.isInteger(raw) ? raw : Math.round(raw * 100) / 100;
  const severity = typeof kind.severity === "function" ? kind.severity(value) : kind.severity;
  return { value, severity };
}

/** Monotonic, collision-free ids without crypto: `evt_<slug>_<base36 counter>`. */
export function createIdFactory(slug: string, start = 0) {
  let n = start;
  return () => EventIdSchema.parse(`evt_${slug}_${(n++).toString(36)}`);
}

export function makeEvent(
  rng: Rng,
  tenantId: TenantId,
  kinds: readonly EventKind[],
  incident: boolean,
  timestamp: number,
  nextId: () => AnalyticsEvent["id"],
): AnalyticsEvent {
  const kind = pickKind(rng, kinds, incident);
  const { value, severity } = sampleKind(rng, kind, incident);
  return { id: nextId(), tenantId, type: kind.type, source: kind.source, severity, value, timestamp };
}

/**
 * One minute of history as rollup cells, WITHOUT generating every raw event.
 * For each kind: expected count from the rate, with ±15% noise; then a small
 * sample of values to estimate the sum and the severity split.
 */
export function syntheticMinute(
  rng: Rng,
  kinds: readonly EventKind[],
  eventsPerMinute: number,
  incident: boolean,
): RollupCell[] {
  const total = kinds.reduce((s, k) => s + weightOf(k, incident), 0);
  const out: RollupCell[] = [];

  for (const kind of kinds) {
    const expected = (eventsPerMinute * weightOf(kind, incident)) / total;
    const count = Math.round(expected * (0.85 + 0.3 * rng.next()));
    if (count === 0) continue;

    const samples = Math.min(count, 24);
    const bySeverity = new Map<Severity, { n: number; sum: number }>();
    for (let i = 0; i < samples; i++) {
      const { value, severity } = sampleKind(rng, kind, incident);
      const agg = bySeverity.get(severity) ?? { n: 0, sum: 0 };
      agg.n += 1;
      agg.sum += value;
      bySeverity.set(severity, agg);
    }
    // Scale the sample up to the full count, preserving severity proportions.
    for (const [severity, { n, sum }] of bySeverity) {
      const c = Math.round((count * n) / samples);
      if (c === 0) continue;
      out.push({ type: kind.type, source: kind.source, severity, count: c, sum: (sum / n) * c });
    }
  }
  return out;
}
