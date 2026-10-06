import type { SeriesPoint, Thresholds, Unit } from "@pulse/shared";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAxis, formatClock, formatValue } from "@/lib/format";

/**
 * Recharts lives ONLY in this file, and this file is only reached through
 * React.lazy (see line-widget.tsx). So the ~100 KB charting library is its
 * own chunk, downloaded the first time a dashboard shows a chart.
 */

/** A series point plus where the in-progress bucket is on pace to land. */
export interface ChartPoint extends SeriesPoint {
  projected: number | null;
}

interface Row {
  t: number;
  /** Completed buckets: the solid line. */
  value: number | null;
  /** Last complete bucket + projected in-progress bucket: the dashed tail. */
  partial: number | null;
  isPartial: boolean;
  soFar: number | null;
  bucketMs: number;
}

const DRAW_IN_MS = 900;

export interface LineChartProps {
  series: ChartPoint[];
  bucketMinutes: number;
  unit: Unit;
  thresholds?: Thresholds | undefined;
}

export default function LiveLineChart({ series, bucketMinutes, unit, thresholds }: LineChartProps) {
  const reduce = useReducedMotion();
  // Draw the line in once, on mount. During those 900ms the chart shows the
  // data it mounted with: a live update mid-animation would restart Recharts'
  // stroke animation and leave the line half drawn. Afterwards, updates are
  // applied without animation, so the entrance never replays.
  const [animate, setAnimate] = useState(!reduce);
  const [mountSeries] = useState(series);
  useEffect(() => {
    if (!animate) return;
    const id = setTimeout(() => setAnimate(false), DRAW_IN_MS + 50);
    return () => clearTimeout(id);
  }, [animate]);
  const data = animate ? mountSeries : series;

  const bucketMs = bucketMinutes * 60_000;
  const lastIdx = data.length - 1;
  const rows: Row[] = data.map((p, i) => ({
    t: p.t,
    value: p.partial ? null : p.value,
    partial: i === lastIdx - 1 ? p.value : i === lastIdx ? p.projected : null,
    isPartial: p.partial,
    soFar: p.partial ? p.value : null,
    bucketMs,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={formatClock}
          tick={{ fill: "var(--fg-subtle)", fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: "var(--chart-grid)" }}
          minTickGap={48}
        />
        <YAxis
          tickFormatter={(v: number) => formatAxis(v, unit)}
          tick={{ fill: "var(--fg-subtle)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          content={(p) => <ChartTooltip active={p.active} payload={p.payload} unit={unit} />}
          cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
          isAnimationActive={false}
        />
        {thresholds?.warn !== undefined && (
          <ReferenceLine y={thresholds.warn} stroke="var(--warning)" strokeDasharray="4 4" ifOverflow="extendDomain" />
        )}
        {thresholds?.critical !== undefined && (
          <ReferenceLine y={thresholds.critical} stroke="var(--danger)" strokeDasharray="4 4" ifOverflow="extendDomain" />
        )}
        {/* A 10% wash under the line, same hue. */}
        <Area
          dataKey="value"
          type="monotone"
          stroke="none"
          fill="var(--chart-mark)"
          fillOpacity={0.1}
          isAnimationActive={animate}
          animationDuration={DRAW_IN_MS}
        />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--chart-mark)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={{ r: 4, fill: "var(--chart-mark)", stroke: "var(--surface-1)", strokeWidth: 2 }}
          isAnimationActive={animate}
          animationDuration={DRAW_IN_MS}
          animationEasing="ease-out"
        />
        {/* The in-progress bucket, projected: dashed, ending in a ringed dot. */}
        <Line
          dataKey="partial"
          type="linear"
          stroke="var(--chart-mark)"
          strokeWidth={2}
          strokeDasharray="3 4"
          dot={(props: { cx?: number; cy?: number; index?: number }) =>
            props.index === lastIdx && props.cx !== undefined && props.cy !== undefined ? (
              <circle
                key="live-dot"
                cx={props.cx}
                cy={props.cy}
                r={4}
                fill="var(--chart-mark)"
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            ) : (
              <g key={`d${props.index}`} />
            )
          }
          activeDot={false}
          isAnimationActive={false}
          legendType="none"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active: boolean | undefined;
  payload: readonly { payload?: unknown }[] | undefined;
  unit: Unit;
}) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row) return null;
  const fmt = (n: number | null) => (n === null ? "No data" : formatValue(Math.round(n), unit));
  return (
    <div className="surface rounded-[var(--radius-control)] px-3 py-2 text-xs">
      <p className="tabular text-fg-subtle">
        {formatClock(row.t)} to {formatClock(row.t + row.bucketMs)}
      </p>
      {row.isPartial ? (
        <>
          <p className="mt-1 text-sm font-medium text-fg">
            {fmt(row.soFar)} <span className="font-normal text-fg-subtle">so far</span>
          </p>
          {row.partial !== null && row.partial !== row.soFar && (
            <p className="text-fg-muted">On pace for {fmt(row.partial)}</p>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm font-medium text-fg">{fmt(row.value)}</p>
      )}
    </div>
  );
}
