import { TenantIdSchema, type AnalyticsEvent, type LiveSnapshot } from "@pulse/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveStore } from "@/stores/live";
import { backoffDelay } from "./backoff";
import { createEventBuffer } from "./event-buffer";
import { acceptFrame } from "./sequencer";

let n = 0;
const ev = (over: Partial<AnalyticsEvent> = {}): AnalyticsEvent =>
  ({
    id: `e${n++}`,
    tenantId: "tnt_acme",
    type: "order.placed",
    source: "checkout",
    severity: "info",
    value: 1,
    timestamp: Date.UTC(2026, 0, 1, 12),
    ...over,
  }) as AnalyticsEvent;
const evs = (k: number) => Array.from({ length: k }, () => ev());

describe("backoffDelay", () => {
  it("grows exponentially up to the cap", () => {
    const max = (a: number) => backoffDelay(a, { random: () => 1 });
    expect([0, 1, 2, 3].map(max)).toEqual([500, 1000, 2000, 4000]);
    expect(max(20)).toBe(30_000);
  });

  it("is jittered between a small floor and the ceiling", () => {
    expect(backoffDelay(4, { random: () => 0 })).toBe(250);
    expect(backoffDelay(4, { random: () => 0.5 })).toBe(4000);
  });
});

describe("acceptFrame (sequence numbers)", () => {
  it("applies a frame that starts exactly where we are", () => {
    const r = acceptFrame(10, 10, evs(3));
    expect(r).toMatchObject({ kind: "apply", nextSeq: 13 });
  });

  it("drops a frame the snapshot already covered", () => {
    expect(acceptFrame(10, 5, evs(5)).kind).toBe("duplicate");
  });

  it("applies only the unseen tail of an overlapping frame", () => {
    const events = evs(5); // seq 8..12
    const r = acceptFrame(10, 8, events);
    expect(r.kind).toBe("apply");
    if (r.kind === "apply") {
      expect(r.events).toEqual(events.slice(2));
      expect(r.nextSeq).toBe(13);
    }
  });

  it("reports a gap when events were missed", () => {
    expect(acceptFrame(10, 12, evs(2))).toEqual({ kind: "gap", expected: 10, got: 12 });
  });
});

describe("event buffer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("turns many pushes into at most one flush per interval", () => {
    const flushes: number[] = [];
    const buffer = createEventBuffer({ flushMs: 250, onFlush: (batch) => flushes.push(batch.length) });
    buffer.start();
    // 60 frames over one second (like 60 events/sec)
    for (let i = 0; i < 60; i++) {
      buffer.push([ev()]);
      vi.advanceTimersByTime(1000 / 60);
    }
    vi.advanceTimersByTime(250);
    buffer.stop();
    expect(flushes.reduce((a, b) => a + b, 0)).toBe(60);
    expect(flushes.length).toBeLessThanOrEqual(5); // 60 messages -> ~4 state updates
  });

  it("ticks the clock when idle so time windows keep sliding", () => {
    const idle = vi.fn();
    const buffer = createEventBuffer({ flushMs: 250, onFlush: () => {}, onIdle: idle, idleEveryMs: 1000 });
    buffer.start();
    vi.advanceTimersByTime(3000);
    buffer.stop();
    expect(idle).toHaveBeenCalledTimes(3);
  });
});

describe("live store", () => {
  const snapshot: LiveSnapshot = { asOf: Date.UTC(2026, 0, 1, 12), seq: 2, rollups: [], recent: [ev(), ev()] };

  it("applies a batch as a single update, newest first, capped", () => {
    const store = useLiveStore.getState();
    store.reset(TenantIdSchema.parse("tnt_acme"));
    store.hydrate(snapshot);
    const listener = vi.fn();
    const unsub = useLiveStore.subscribe(listener);

    const batch = evs(3);
    useLiveStore.getState().applyBatch(batch, Date.UTC(2026, 0, 1, 12, 0, 30));
    unsub();

    const s = useLiveStore.getState();
    expect(listener).toHaveBeenCalledTimes(1); // ONE store update for 3 events
    expect(s.feed.slice(0, 3)).toEqual(batch.slice().reverse());
    expect(s.feed).toHaveLength(5);
    expect(s.stats).toMatchObject({ received: 3, flushes: 1, lastBatch: 3 });
  });
});

describe("live store backfill", () => {
  it("appends only older, unseen events behind the live feed", () => {
    const store = useLiveStore.getState();
    store.reset(TenantIdSchema.parse("tnt_acme"));
    const t = Date.UTC(2026, 0, 1, 12);
    const live = [ev({ timestamp: t + 2000 }), ev({ timestamp: t + 1000 })]; // newest first
    store.hydrate({ asOf: t + 2000, seq: 2, rollups: [], recent: live });

    const older = [live[1]!, ev({ timestamp: t + 500 }), ev({ timestamp: t })];
    useLiveStore.getState().backfill(older);

    const feed = useLiveStore.getState().feed;
    expect(feed.map((e) => e.timestamp)).toEqual([t + 2000, t + 1000, t + 500, t]);
    expect(new Set(feed.map((e) => e.id)).size).toBe(feed.length); // no duplicate
  });
});
