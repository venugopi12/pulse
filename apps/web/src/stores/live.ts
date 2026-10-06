import {
  fromWire,
  withEvents,
  type AnalyticsEvent,
  type LiveSnapshot,
  type ReadonlyRollups,
  type TenantId,
} from "@pulse/shared";
import { create } from "zustand";
import { perf } from "@/perf/flags";

/** The live feed keeps this many newest events; the Events page virtualizes them. */
export const MAX_FEED = 20_000;
const RATE_WINDOW_MS = 5_000;

interface LiveState {
  tenantId: TenantId | null;
  hydrated: boolean;
  /** Per-minute aggregates; every KPI and chart is computed from these. */
  rollups: ReadonlyRollups;
  /** Newest first. */
  feed: readonly AnalyticsEvent[];
  /** Clock used by time-window metrics; advances on every flush. */
  now: number;
  /** Events/sec over the last few seconds, rounded (so it rarely re-renders). */
  ratePerSec: number;
  stats: { received: number; flushes: number; lastBatch: number };

  reset(tenantId: TenantId): void;
  hydrate(snapshot: LiveSnapshot): void;
  applyBatch(events: AnalyticsEvent[], now: number): void;
  /** Append OLDER events (from REST) behind the live feed, e.g. for the Events page. */
  backfill(older: AnalyticsEvent[]): void;
  tick(now: number): void;
}

// Recent flush sizes for the rate readout. Kept OUTSIDE state: it changes on
// every flush but nothing renders it directly.
let rateSamples: { at: number; n: number }[] = [];
let rateSince = Date.now();
function measureRate(now: number, n: number): number {
  rateSamples.push({ at: now, n });
  rateSamples = rateSamples.filter((s) => now - s.at <= RATE_WINDOW_MS);
  const total = rateSamples.reduce((sum, s) => sum + s.n, 0);
  // Right after a reset there's less than 5s of data: divide by what we have.
  const seconds = Math.min(RATE_WINDOW_MS, Math.max(now - rateSince, 1000)) / 1000;
  return Math.round((total / seconds) * 10) / 10;
}

const EMPTY: ReadonlyRollups = new Map();

/**
 * Live data for the ACTIVE tenant only. Components subscribe with narrow
 * selectors, e.g. `useLiveStore(s => computeMetric(s.rollups, m, s.now))`
 * returns a number, so a KPI re-renders only when ITS number changes,
 * not on every flush.
 */
export const useLiveStore = create<LiveState>()((set) => ({
  tenantId: null,
  hydrated: false,
  rollups: EMPTY,
  feed: [],
  now: Date.now(),
  ratePerSec: 0,
  stats: { received: 0, flushes: 0, lastBatch: 0 },

  reset: (tenantId) => {
    rateSamples = [];
    rateSince = Date.now();
    set({
      tenantId,
      hydrated: false,
      rollups: EMPTY,
      feed: [],
      now: Date.now(),
      ratePerSec: 0,
      stats: { received: 0, flushes: 0, lastBatch: 0 },
    });
  },

  hydrate: (snapshot) =>
    set({
      hydrated: true,
      rollups: fromWire(snapshot.rollups),
      feed: snapshot.recent,
      now: Date.now(),
    }),

  /** One state update for a whole buffered batch. */
  applyBatch: (events, now) =>
    set((s) => {
      // Newest first: reverse the (oldest-first) batch onto the front.
      const feed = events.slice().reverse().concat(s.feed);
      if (feed.length > MAX_FEED) feed.length = MAX_FEED;
      return {
        rollups: withEvents(s.rollups, events),
        feed,
        now,
        ratePerSec: measureRate(now, events.length),
        stats: { received: s.stats.received + events.length, flushes: s.stats.flushes + 1, lastBatch: events.length },
      };
    }),

  tick: (now) => set({ now, ratePerSec: measureRate(now, 0) }),

  backfill: (older) =>
    set((s) => {
      const oldest = s.feed[s.feed.length - 1];
      // Only events at or before our oldest one, minus any we already hold
      // (same-millisecond neighbours). Feed stays newest-first.
      const seen = new Set(s.feed.slice(-500).map((e) => e.id));
      const tail = older.filter((e) => (!oldest || e.timestamp <= oldest.timestamp) && !seen.has(e.id));
      if (tail.length === 0) return {};
      const feed = s.feed.concat(tail);
      if (feed.length > MAX_FEED) feed.length = MAX_FEED;
      return { feed };
    }),
}));

// Debug handle: `__pulse.live.getState()` in the console. Dev builds, or any
// build opened with ?perf=monitor (the load test reads it).
if ((import.meta.env.DEV || perf.monitor) && typeof window !== "undefined") {
  (window as unknown as { __pulse?: object }).__pulse = { live: useLiveStore };
}
