import { isNoMatch, seriesFromRollups, type WidgetConfig } from "@pulse/shared";
import { NoMatch } from "@/features/ai-filter/no-match";
import { lazy, Suspense, useMemo } from "react";
import { bucketFor, useFilteredMetric } from "@/features/ai-filter/use-filtered-metric";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveThrottled } from "@/hooks/use-live-throttled";
import { formatClock, formatValue } from "@/lib/format";
import type { ChartPoint } from "../charts/line-chart";
import { maybeMemo } from "@/perf/flags";

type LineConfig = Extract<WidgetConfig, { type: "line" }>;

// Code-split: Recharts is only downloaded when a line widget first renders.
const LiveLineChart = lazy(() => import("../charts/line-chart"));

const r = (n: number | null) => (n === null ? null : Math.round(n));
const sameSeries = (a: ChartPoint[] | null, b: ChartPoint[] | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.length === b.length &&
    a.every((p, i) => p.t === b[i]!.t && r(p.value) === r(b[i]!.value) && r(p.projected) === r(b[i]!.projected)));

/**
 * The bucket that contains "now" is only partly filled: 4 minutes into a
 * 15-minute bucket, a count is about a quarter of a normal one, and drawing
 * it as-is looks like a crash. For counts and sums we draw where it's ON PACE
 * to land (value / fraction elapsed), dashed, and the tooltip shows both.
 * Averages don't depend on elapsed time, so they're drawn as they are.
 * In the first 10% of a bucket the projection is too noisy, so it's hidden.
 */
function toChartPoints(widget: LineConfig, rollups: Parameters<typeof seriesFromRollups>[0], now: number): ChartPoint[] {
  const size = widget.bucketMinutes * 60_000;
  return seriesFromRollups(rollups, widget.metric, widget.bucketMinutes, now).map((p) => {
    if (!p.partial || p.value === null) return { ...p, projected: null };
    if (widget.metric.aggregate === "avg") return { ...p, projected: p.value };
    const fraction = (now - p.t) / size;
    return { ...p, projected: fraction >= 0.1 ? p.value / fraction : null };
  });
}

export const LineBody = maybeMemo(function LineBody({ widget: configured }: { widget: LineConfig }) {
  // With an AI filter active, the chart covers the filter's time range at a
  // step that keeps it readable; otherwise it's exactly as configured.
  const metric = useFilteredMetric(configured.metric);
  const widget = useMemo<LineConfig>(
    () =>
      metric === configured.metric
        ? configured
        : { ...configured, metric, bucketMinutes: bucketFor(metric.windowMinutes, configured.bucketMinutes) },
    [configured, metric],
  );
  // Redraw at most once a second, and only if a (rounded) point changed.
  const series = useLiveThrottled(
    (s) => (s.hydrated ? toChartPoints(widget, s.rollups, s.now) : null),
    1000,
    sameSeries,
  );
  const unit = widget.unit ?? "count";

  if (isNoMatch(metric)) return <NoMatch className="m-auto min-h-[180px] justify-center" />;
  if (!series) return <Skeleton className="min-h-[180px] flex-1" />;

  return (
    <div className="relative min-h-[180px] flex-1">
      <Suspense fallback={<Skeleton className="absolute inset-0" />}>
        <div className="absolute inset-0">
          <LiveLineChart series={series} bucketMinutes={widget.bucketMinutes} unit={unit} thresholds={widget === configured ? widget.thresholds : undefined} />
        </div>
      </Suspense>
      {/* Screen readers get the numbers as a table instead of an SVG. */}
      <table className="sr-only">
        <caption>{widget.title}</caption>
        <thead>
          <tr>
            <th>Time</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.t}>
              <td>{formatClock(p.t)}</td>
              <td>
                {p.value === null ? "No data" : formatValue(Math.round(p.value), unit)}
                {p.partial && p.projected !== null ? ` so far, on pace for ${formatValue(Math.round(p.projected), unit)}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
