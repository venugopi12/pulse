import { z } from "zod";
import { AnalyticsEventSchema, SeveritySchema, type AnalyticsEvent, type Severity } from "./event.js";
import type { Metric } from "./widget.js";

/**
 * ROLLUPS: pre-aggregated per-minute totals.
 *
 * At 60 events/sec, six hours is ~1.3M raw events — too much to ship or keep.
 * Instead, both server and client keep one small record per
 * (minute, event type, source, severity): { count, sum }.
 * Six hours ≈ 360 buckets × ~8 rows. Every KPI and chart is computed from these.
 *
 * This file is shared so the server and the browser aggregate IDENTICALLY.
 */
export const ROLLUP_BUCKET_MS = 60_000;

export const bucketStart = (timestamp: number): number =>
  timestamp - (timestamp % ROLLUP_BUCKET_MS);

export interface RollupCell {
  type: string;
  source: string;
  severity: Severity;
  count: number;
  sum: number;
}

/** minute start (epoch ms) -> (cell key -> cell). */
export type Rollups = Map<number, Map<string, RollupCell>>;
export type ReadonlyRollups = ReadonlyMap<number, ReadonlyMap<string, Readonly<RollupCell>>>;

export const rollupKey = (e: Pick<AnalyticsEvent, "type" | "source" | "severity">): string =>
  `${e.type}|${e.source}|${e.severity}`;

/** Mutating add: used by the server's store (hot path, no copies). */
export function addToRollups(rollups: Rollups, e: AnalyticsEvent): void {
  const t = bucketStart(e.timestamp);
  let bucket = rollups.get(t);
  if (!bucket) {
    bucket = new Map();
    rollups.set(t, bucket);
  }
  const key = rollupKey(e);
  const cell = bucket.get(key);
  if (cell) {
    cell.count += 1;
    cell.sum += e.value;
  } else {
    bucket.set(key, { type: e.type, source: e.source, severity: e.severity, count: 1, sum: e.value });
  }
}

/**
 * Immutable add for React state: returns a NEW outer map and NEW bucket maps
 * for the minutes it touched; untouched buckets are shared by reference.
 * A 250ms batch usually touches one bucket, so this copies very little.
 */
export function withEvents(rollups: ReadonlyRollups, events: readonly AnalyticsEvent[]): Rollups {
  const next: Rollups = new Map(rollups as Rollups);
  const copied = new Set<number>();
  for (const e of events) {
    const t = bucketStart(e.timestamp);
    if (!copied.has(t)) {
      const old = next.get(t);
      const fresh = new Map<string, RollupCell>();
      if (old) for (const [k, c] of old) fresh.set(k, { ...c });
      next.set(t, fresh);
      copied.add(t);
    }
    addToRollups(next, e);
  }
  return next;
}

/** Drop buckets that ended before `cutoff` (mutating; keeps memory bounded). */
export function pruneRollups(rollups: Rollups, cutoff: number): void {
  for (const t of rollups.keys()) {
    if (t + ROLLUP_BUCKET_MS > cutoff) break; // Map iterates in insertion (time) order
    rollups.delete(t);
  }
}

function matches(cell: Readonly<RollupCell>, metric: Pick<Metric, "eventTypes" | "severities" | "sources">): boolean {
  if (metric.eventTypes && !metric.eventTypes.includes(cell.type)) return false;
  if (metric.sources && !metric.sources.includes(cell.source)) return false;
  if (metric.severities && !metric.severities.includes(cell.severity)) return false;
  return true;
}

/**
 * Value of a metric over [now - window, now].
 *
 * The oldest bucket usually straddles the window start. Counting it fully
 * (or not at all) makes the value jump every minute as buckets age out.
 * Instead we weight it by the fraction that overlaps the window, which
 * makes the number slide smoothly. (Assumes events are spread evenly
 * within a minute — fine for a dashboard.)
 *
 * Returns null for an average with no data (avoid showing a fake 0).
 */
export function computeMetric(rollups: ReadonlyRollups, metric: Metric, now: number): number | null {
  const from = now - metric.windowMinutes * 60_000;
  let count = 0;
  let sum = 0;
  for (const [t, bucket] of rollups) {
    const end = t + ROLLUP_BUCKET_MS;
    if (end <= from || t > now) continue;
    const weight = t < from ? (end - from) / ROLLUP_BUCKET_MS : 1;
    for (const cell of bucket.values()) {
      if (!matches(cell, metric)) continue;
      count += cell.count * weight;
      sum += cell.sum * weight;
    }
  }
  switch (metric.aggregate) {
    case "count":
      return count;
    case "sum":
      return sum;
    case "avg":
      return count > 0 ? sum / count : null;
  }
}

// --- Chart helpers ------------------------------------------------------------

export interface SeriesPoint {
  /** Start of the bucket (epoch ms). */
  t: number;
  value: number | null;
  /** The bucket that contains `now` is still filling up. */
  partial: boolean;
}

/**
 * A metric over time, in `bucketMinutes` steps, ending with the bucket that
 * contains `now`. Buckets are aligned to the clock (e.g. :00, :15, :30, :45),
 * so points don't wobble as time passes. The last bucket is marked `partial`:
 * a count for a bucket that is 3 minutes into 15 is not comparable to a full one,
 * and the chart draws it differently instead of showing a fake drop.
 */
export function seriesFromRollups(
  rollups: ReadonlyRollups,
  metric: Metric,
  bucketMinutes: number,
  now: number,
): SeriesPoint[] {
  const size = bucketMinutes * 60_000;
  const lastStart = now - (now % size);
  const count = Math.ceil(metric.windowMinutes / bucketMinutes);
  const first = lastStart - (count - 1) * size;
  const acc = Array.from({ length: count }, () => ({ count: 0, sum: 0 }));

  for (const [t, bucket] of rollups) {
    if (t < first || t > now) continue;
    const i = Math.floor((t - first) / size);
    const slot = acc[i];
    if (!slot) continue;
    for (const cell of bucket.values()) {
      if (!matches(cell, metric)) continue;
      slot.count += cell.count;
      slot.sum += cell.sum;
    }
  }

  return acc.map(({ count: c, sum }, i) => ({
    t: first + i * size,
    value: metric.aggregate === "count" ? c : metric.aggregate === "sum" ? sum : c > 0 ? sum / c : null,
    partial: i === count - 1,
  }));
}

export type GroupBy = "type" | "source" | "severity";

/** A metric split by a dimension over its window, largest first. */
export function groupFromRollups(
  rollups: ReadonlyRollups,
  metric: Metric,
  groupBy: GroupBy,
  now: number,
): { key: string; value: number }[] {
  const from = now - metric.windowMinutes * 60_000;
  const groups = new Map<string, { count: number; sum: number }>();
  for (const [t, bucket] of rollups) {
    const end = t + ROLLUP_BUCKET_MS;
    if (end <= from || t > now) continue;
    const weight = t < from ? (end - from) / ROLLUP_BUCKET_MS : 1;
    for (const cell of bucket.values()) {
      if (!matches(cell, metric)) continue;
      const key = cell[groupBy];
      const g = groups.get(key) ?? { count: 0, sum: 0 };
      g.count += cell.count * weight;
      g.sum += cell.sum * weight;
      groups.set(key, g);
    }
  }
  return [...groups]
    .map(([key, g]) => ({
      key,
      value: metric.aggregate === "count" ? g.count : metric.aggregate === "sum" ? g.sum : g.count ? g.sum / g.count : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

// --- Wire format --------------------------------------------------------------

/** Compact tuple per cell: [type, source, severity, count, sum]. */
export const RollupRowSchema = z.tuple([z.string(), z.string(), SeveritySchema, z.number(), z.number()]);
export const RollupBucketSchema = z.object({ t: z.number().int(), rows: z.array(RollupRowSchema) });
export type RollupBucket = z.infer<typeof RollupBucketSchema>;

export function toWire(rollups: ReadonlyRollups, from: number): RollupBucket[] {
  const out: RollupBucket[] = [];
  for (const [t, bucket] of rollups) {
    if (t + ROLLUP_BUCKET_MS <= from) continue;
    out.push({ t, rows: [...bucket.values()].map((c) => [c.type, c.source, c.severity, c.count, c.sum]) });
  }
  return out;
}

export function fromWire(buckets: readonly RollupBucket[]): Rollups {
  const rollups: Rollups = new Map();
  for (const { t, rows } of [...buckets].sort((a, b) => a.t - b.t)) {
    const bucket = new Map<string, RollupCell>();
    for (const [type, source, severity, count, sum] of rows) {
      bucket.set(rollupKey({ type, source, severity }), { type, source, severity, count, sum });
    }
    rollups.set(t, bucket);
  }
  return rollups;
}

/**
 * GET /api/live/snapshot — everything a client needs before going live.
 * `seq` is the watermark: the snapshot includes the tenant's events up to and
 * including sequence number `seq`. Live frames carry `firstSeq`, so the
 * client skips exactly the events it already has — no double counting.
 */
export const LiveSnapshotSchema = z.object({
  asOf: z.number().int(),
  seq: z.number().int().nonnegative(),
  rollups: z.array(RollupBucketSchema),
  recent: z.array(AnalyticsEventSchema),
});
export type LiveSnapshot = z.infer<typeof LiveSnapshotSchema>;

export const LiveSnapshotQuerySchema = z
  .object({
    minutes: z.coerce.number().int().min(1).max(1440).default(360),
    recent: z.coerce.number().int().min(0).max(1000).default(200),
  })
  .strict();
