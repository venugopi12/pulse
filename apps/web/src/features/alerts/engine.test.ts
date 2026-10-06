import { describe, expect, it } from "vitest";
import { createAlertEngine } from "./engine";

const engine = () =>
  createAlertEngine([{ widgetId: "errors", thresholds: { direction: "above", warn: 100, critical: 200 } }], {
    fireAfterMs: 3000,
    clearAfterMs: 10000,
  });
const v = (n: number | null) => new Map([["errors", n]]);

describe("alert engine (hysteresis)", () => {
  it("fires only after the level holds for fireAfterMs", () => {
    const e = engine();
    expect(e.evaluate(v(150), 0)).toEqual([]);
    expect(e.evaluate(v(150), 2000)).toEqual([]);
    expect(e.evaluate(v(150), 3000)).toMatchObject([{ from: "ok", to: "warn" }]);
  });

  it("ignores a spike shorter than fireAfterMs", () => {
    const e = engine();
    e.evaluate(v(150), 0);
    e.evaluate(v(50), 2000); // back to normal before confirming
    expect(e.evaluate(v(50), 6000)).toEqual([]);
    expect(e.levels()).toEqual({ errors: "ok" });
  });

  it("escalates quickly but resolves slowly (no flapping)", () => {
    const e = engine();
    e.evaluate(v(250), 0);
    expect(e.evaluate(v(250), 3000)).toMatchObject([{ to: "critical" }]);
    e.evaluate(v(90), 4000);
    expect(e.evaluate(v(90), 9000)).toEqual([]); // dips don't resolve yet
    e.evaluate(v(250), 9500); // back up: the "better" candidate is cancelled
    e.evaluate(v(90), 10000);
    expect(e.evaluate(v(90), 19999)).toEqual([]);
    expect(e.evaluate(v(90), 20000)).toMatchObject([{ from: "critical", to: "ok" }]);
  });

  it("treats missing data as ok", () => {
    const e = engine();
    e.evaluate(v(null), 0);
    expect(e.evaluate(v(null), 5000)).toEqual([]);
  });
});
