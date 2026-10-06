import { describe, expect, it } from "vitest";
import { ThresholdsSchema, UpdateDashboardRequestSchema, WidgetConfigSchema } from "../src/index.js";

const layout = { colSpan: 1, rowSpan: 1 };
const metric = { aggregate: "count", windowMinutes: 60 };

describe("WidgetConfigSchema", () => {
  it("accepts each widget type", () => {
    const widgets = [
      { id: "a", type: "kpi", title: "A", layout, metric, unit: "count" },
      { id: "b", type: "line", title: "B", layout, metric, bucketMinutes: 5 },
      { id: "c", type: "bar", title: "C", layout, metric, groupBy: "source" },
      { id: "d", type: "feed", title: "D", layout },
      { id: "e", type: "alertList", title: "E", layout },
    ];
    for (const w of widgets) expect(WidgetConfigSchema.safeParse(w).success).toBe(true);
  });

  it("rejects fields that belong to another widget type", () => {
    const res = WidgetConfigSchema.safeParse({ id: "f", type: "feed", title: "F", layout, groupBy: "source" });
    expect(res.success).toBe(false);
  });

  it("rejects duplicate widget ids", () => {
    const w = { id: "dup", type: "feed", title: "F", layout };
    expect(UpdateDashboardRequestSchema.safeParse({ widgets: [w, w], version: 1 }).success).toBe(false);
  });
});

describe("ThresholdsSchema", () => {
  it("requires warn or critical", () => {
    expect(ThresholdsSchema.safeParse({ direction: "above" }).success).toBe(false);
  });
  it("requires critical to be beyond warn", () => {
    expect(ThresholdsSchema.safeParse({ direction: "above", warn: 10, critical: 5 }).success).toBe(false);
    expect(ThresholdsSchema.safeParse({ direction: "below", warn: 10, critical: 5 }).success).toBe(true);
  });
});
