import { describe, expect, it } from "vitest";
import {
  ROLLUP_BUCKET_MS,
  addToRollups,
  computeMetric,
  fromWire,
  pruneRollups,
  toWire,
  withEvents,
  type AnalyticsEvent,
  type Rollups,
} from "../src/index.js";

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
let n = 0;
const ev = (over: Partial<AnalyticsEvent> & { timestamp: number }): AnalyticsEvent =>
  ({
    id: `e${n++}`,
    tenantId: "t",
    type: "order.placed",
    source: "checkout",
    severity: "info",
    value: 10,
    ...over,
  }) as AnalyticsEvent;

describe("rollups", () => {
  it("aggregates count and sum per minute and key", () => {
    const r: Rollups = new Map();
    addToRollups(r, ev({ timestamp: T0 + 1_000 }));
    addToRollups(r, ev({ timestamp: T0 + 2_000, value: 5 }));
    addToRollups(r, ev({ timestamp: T0 + 61_000 }));
    expect(r.size).toBe(2);
    expect([...r.get(T0)!.values()][0]).toMatchObject({ count: 2, sum: 15 });
  });

  it("computes count / sum / avg with filters", () => {
    const r: Rollups = new Map();
    addToRollups(r, ev({ timestamp: T0, value: 10 }));
    addToRollups(r, ev({ timestamp: T0, value: 30 }));
    addToRollups(r, ev({ timestamp: T0, type: "page.view", value: 1 }));
    const now = T0 + 30_000;
    const base = { windowMinutes: 5, eventTypes: ["order.placed"] };
    expect(computeMetric(r, { ...base, aggregate: "count" }, now)).toBe(2);
    expect(computeMetric(r, { ...base, aggregate: "sum" }, now)).toBe(40);
    expect(computeMetric(r, { ...base, aggregate: "avg" }, now)).toBe(20);
    expect(computeMetric(r, { aggregate: "count", windowMinutes: 5, severities: ["error"] }, now)).toBe(0);
    expect(computeMetric(r, { aggregate: "avg", windowMinutes: 5, severities: ["error"] }, now)).toBeNull();
  });

  it("weights the oldest bucket by its overlap so values slide instead of jumping", () => {
    const r: Rollups = new Map();
    for (let i = 0; i < 60; i++) addToRollups(r, ev({ timestamp: T0 + i * 1000 }));
    const m = { aggregate: "count", windowMinutes: 1 } as const;
    // Window [T0+15s, T0+75s] covers 3/4 of the first bucket.
    expect(computeMetric(r, m, T0 + 75_000)).toBeCloseTo(45);
    expect(computeMetric(r, m, T0 + 90_000)).toBeCloseTo(30);
  });

  it("withEvents never mutates the previous state", () => {
    const a: Rollups = new Map();
    addToRollups(a, ev({ timestamp: T0 }));
    const before = JSON.stringify(toWire(a, 0));
    const b = withEvents(a, [ev({ timestamp: T0 + 1 }), ev({ timestamp: T0 + ROLLUP_BUCKET_MS })]);
    expect(JSON.stringify(toWire(a, 0))).toBe(before);
    expect(computeMetric(b, { aggregate: "count", windowMinutes: 10 }, T0 + 90_000)).toBe(3);
  });

  it("round-trips through the wire format and prunes old buckets", () => {
    const r: Rollups = new Map();
    for (let m = 0; m < 5; m++) addToRollups(r, ev({ timestamp: T0 + m * ROLLUP_BUCKET_MS }));
    expect(toWire(fromWire(toWire(r, 0)), 0)).toEqual(toWire(r, 0));
    pruneRollups(r, T0 + 2 * ROLLUP_BUCKET_MS);
    expect([...r.keys()]).toEqual([2, 3, 4].map((m) => T0 + m * ROLLUP_BUCKET_MS));
  });
});

import { groupFromRollups, seriesFromRollups, thresholdLevel } from "../src/index.js";

describe("chart helpers", () => {
  it("builds clock-aligned series and marks the last bucket partial", () => {
    const r: Rollups = new Map();
    for (let m = 0; m < 30; m++) addToRollups(r, ev({ timestamp: T0 + m * ROLLUP_BUCKET_MS }));
    const now = T0 + 29 * ROLLUP_BUCKET_MS + 1000; // 12:29:01
    const s = seriesFromRollups(r, { aggregate: "count", windowMinutes: 30 }, 15, now);
    expect(s.map((p) => p.value)).toEqual([15, 15]);
    expect(s.map((p) => p.t)).toEqual([T0, T0 + 15 * ROLLUP_BUCKET_MS]);
    expect(s.map((p) => p.partial)).toEqual([false, true]);
  });

  it("groups by a dimension, largest first", () => {
    const r: Rollups = new Map();
    addToRollups(r, ev({ timestamp: T0, source: "a" }));
    addToRollups(r, ev({ timestamp: T0, source: "b" }));
    addToRollups(r, ev({ timestamp: T0, source: "b" }));
    expect(groupFromRollups(r, { aggregate: "count", windowMinutes: 5 }, "source", T0 + 1000)).toEqual([
      { key: "b", value: 2 },
      { key: "a", value: 1 },
    ]);
  });

  it("classifies values against above/below thresholds", () => {
    expect(thresholdLevel(5, { direction: "above", warn: 10, critical: 20 })).toBe("ok");
    expect(thresholdLevel(15, { direction: "above", warn: 10, critical: 20 })).toBe("warn");
    expect(thresholdLevel(25, { direction: "above", warn: 10, critical: 20 })).toBe("critical");
    expect(thresholdLevel(30, { direction: "below", warn: 48, critical: 40 })).toBe("critical");
    expect(thresholdLevel(null, { direction: "above", warn: 1 })).toBe("ok");
  });
});
