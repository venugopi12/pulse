import { TenantIdSchema, type AnalyticsEvent, type WidgetConfig } from "@pulse/shared";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAlertsStore } from "@/features/alerts/store";
import { useLiveStore } from "@/stores/live";
import { WidgetCard } from "../widget-frame";
import { KpiBody } from "./kpi-widget";

type Kpi = Extract<WidgetConfig, { type: "kpi" }>;

const widget: Kpi = {
  id: "revenue",
  type: "kpi",
  title: "Revenue (1h)",
  metric: { aggregate: "sum", eventTypes: ["order.placed"], windowMinutes: 60 },
  unit: "currency",
  layout: { colSpan: 1, rowSpan: 1 },
  thresholds: { direction: "below", warn: 100 },
};

let n = 0;
const order = (value: number): AnalyticsEvent =>
  ({
    id: `e${n++}`,
    tenantId: "tnt_acme",
    type: "order.placed",
    source: "checkout",
    severity: "info",
    value,
    timestamp: Date.now(),
  }) as AnalyticsEvent;

beforeEach(() => {
  useLiveStore.getState().reset(TenantIdSchema.parse("tnt_acme"));
  useAlertsStore.getState().reset();
});

describe("KPI widget", () => {
  it("shows a skeleton until live data has loaded", () => {
    render(<KpiBody widget={widget} />);
    expect(screen.queryByText(/^\$\d/)).not.toBeInTheDocument();
  });

  it("renders the metric from the live store and updates on the next batch", async () => {
    render(<KpiBody widget={widget} />);
    act(() => {
      useLiveStore.getState().hydrate({ asOf: Date.now(), seq: 0, rollups: [], recent: [] });
      useLiveStore.getState().applyBatch([order(40), order(60)], Date.now());
    });
    expect(screen.getByText("$100")).toBeInTheDocument();

    act(() => useLiveStore.getState().applyBatch([order(25)], Date.now()));
    // The number is written to the DOM by Motion on the next animation frame
    // (no React re-render), so wait for it rather than checking synchronously.
    expect(await screen.findByText("$125")).toBeInTheDocument();
  });

  it("describes its metric and thresholds in plain language", () => {
    render(<KpiBody widget={widget} />);
    expect(screen.getByText("Total of order.placed over the last hour")).toBeInTheDocument();
    expect(screen.getByText("Warn below $100")).toBeInTheDocument();
  });

  it("shows a Warning badge with an icon when its alert is active", () => {
    act(() =>
      useAlertsStore.getState().raise({
        widgetId: "revenue",
        title: widget.title,
        level: "warn",
        value: 80,
        unit: "currency",
        startedAt: Date.now(),
      }),
    );
    render(<WidgetCard widget={widget} />);
    const badge = screen.getByText("Warning");
    expect(badge).toBeInTheDocument();
    // Status is never colour alone: the badge carries an icon too.
    expect(badge.querySelector("svg")).not.toBeNull();
  });
});
