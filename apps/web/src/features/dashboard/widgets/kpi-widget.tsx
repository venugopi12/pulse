import {
  computeMetric,
  isNoMatch,
  seriesFromRollups,
  type Metric,
  type Thresholds,
  type WidgetConfig,
} from "@pulse/shared";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { maybeMemo } from "@/perf/flags";
import { formatValue } from "@/lib/format";
import { useLiveThrottled } from "@/hooks/use-live-throttled";
import { describeThresholds, describeWidget, describeWindow } from "../describe";
import { AnimatedNumber } from "./animated-number";
import { NoMatch } from "@/features/ai-filter/no-match";
import { useFilteredMetric } from "@/features/ai-filter/use-filtered-metric";
import { Sparkline } from "./sparkline";
import { useMetric } from "./use-metric";

type KpiConfig = Extract<WidgetConfig, { type: "kpi" }>;
type Trend = { dir: "up" | "down"; good: boolean; id: number };

/** Show a direction tint at most this often, so a constantly moving number doesn't strobe. */
const TINT_EVERY_MS = 1500;

/**
 * Is this change good? With an "above" threshold (errors, latency) going up
 * is bad; with a "below" threshold (utilisation) going down is bad. With no
 * thresholds, up is treated as good.
 */
function isGood(dir: "up" | "down", thresholds: Thresholds | undefined): boolean {
  if (!thresholds) return dir === "up";
  return thresholds.direction === "above" ? dir === "down" : dir === "up";
}

export const KpiBody = maybeMemo(function KpiBody({ widget }: { widget: KpiConfig }) {
  const metric = useFilteredMetric(widget.metric);
  const value = useMetric(metric);
  const trend = useTrend(value, widget.thresholds);
  const history = useKpiHistory(metric);
  const filtered = metric !== widget.metric;

  if (isNoMatch(metric)) {
    return (
      <>
        <NoMatch className="h-8" />
        <p className="mt-auto pt-4 text-xs text-fg-subtle">{describeWidget(widget)}</p>
      </>
    );
  }

  return (
    <>
      <div className="relative -mx-2 rounded-[var(--radius-control)] px-2 py-1">
        {/* Direction tint: an overlay that fades out (opacity only). Keyed so
            each new trend restarts the fade. */}
        <AnimatePresence>
          {trend && (
            <motion.span
              key={trend.id}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 rounded-[var(--radius-control)]",
                trend.good ? "bg-success/15" : "bg-danger/15",
              )}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        <div className="relative flex items-baseline gap-2">
          {value === undefined ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <p className="tabular text-[34px] leading-none font-semibold tracking-tight">
              {value === null ? (
                <span className="text-fg-subtle">No data</span>
              ) : (
                <AnimatedNumber value={value} format={(n) => formatValue(Math.round(n), widget.unit)} />
              )}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 min-h-5">
        {history && (
          <DeltaPill
            deltaTenths={history.deltaTenths}
            thresholds={widget.thresholds}
            windowMinutes={metric.windowMinutes}
          />
        )}
      </div>
      <Sparkline values={history?.points ?? []} className="-mx-4 mt-3 h-11" />
      <p className="mt-auto pt-3 text-xs text-fg-subtle">{describeWidget(filtered ? { ...widget, metric } : widget)}</p>
      {widget.thresholds && (
        <p className="mt-1 text-xs text-fg-subtle">
          {describeThresholds(widget.thresholds, widget.unit)}
          {/* Alerts keep watching the real, unfiltered value: a view filter must never silence them. */}
          {filtered && ", on the unfiltered value"}
        </p>
      )}
    </>
  );
});

/** Direction of the latest meaningful change, throttled to one tint per 1.5s. */
function useTrend(value: number | null | undefined, thresholds: Thresholds | undefined): Trend | null {
  const [trend, setTrend] = useState<Trend | null>(null);
  const last = useRef<{ value: number; at: number } | null>(null);

  useEffect(() => {
    if (typeof value !== "number") return;
    const now = Date.now();
    const prev = last.current;
    if (!prev) {
      last.current = { value, at: now };
      return;
    }
    if (value === prev.value || now - prev.at < TINT_EVERY_MS) return;
    const dir = value > prev.value ? "up" : "down";
    last.current = { value, at: now };
    setTrend({ dir, good: isGood(dir, thresholds), id: now });
  }, [value, thresholds]);

  return trend;
}

interface KpiHistory {
  /** The last hour in 3-minute steps (for the sparkline). */
  points: number[];
  /**
   * Change versus the previous window, in tenths of a percent (what the pill
   * shows), or null when there's no full previous window of history.
   * Rounded HERE so the card only re-renders when the pill's text changes.
   */
  deltaTenths: number | null;
}

const sameHistory = (a: KpiHistory | null, b: KpiHistory | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.deltaTenths === b.deltaTenths &&
    a.points.length === b.points.length &&
    a.points.every((v, i) => v === b.points[i]));

/**
 * Sparkline + previous-period value, from the same rollups as the number.
 * Throttled to one update a second (like the charts): a 30-minute line
 * doesn't need 4 redraws a second.
 */
function useKpiHistory(metric: Metric): KpiHistory | null {
  return useLiveThrottled(
    (s) => {
      if (!s.hydrated) return null;
      // 3-minute steps over the last hour: per-minute values are mostly noise
      // at this size; 20 points show the trend. The still-filling last step
      // is dropped so the line doesn't dip at the end.
      const series = seriesFromRollups(s.rollups, { ...metric, windowMinutes: 63 }, 3, s.now).slice(0, -1);
      // Averages have gaps (null) in quiet minutes: carry the last value forward.
      let last = 0;
      const points = series.map((p) => (last = p.value === null ? last : Math.round(p.value)));

      const windowMs = metric.windowMinutes * 60_000;
      let oldest = Infinity;
      for (const t of s.rollups.keys()) oldest = Math.min(oldest, t);
      const covered = oldest <= s.now - 2 * windowMs;
      const prev = covered ? computeMetric(s.rollups, metric, s.now - windowMs) : null;
      const current = computeMetric(s.rollups, metric, s.now);
      const deltaTenths =
        prev === null || current === null || Math.round(prev) === 0
          ? null
          : Math.round(((current - prev) / Math.abs(prev)) * 1000);
      return { points, deltaTenths };
    },
    1000,
    sameHistory,
  );
}

/**
 * "+4.2%" versus the previous window, coloured by whether that's good news
 * for this metric (same rule as the trend tint), with an arrow so colour is
 * never the only signal, and a full sentence for screen readers.
 */
function DeltaPill({
  deltaTenths,
  thresholds,
  windowMinutes,
}: {
  deltaTenths: number | null;
  thresholds: Thresholds | undefined;
  windowMinutes: number;
}) {
  if (deltaTenths === null) return null;
  const pct = deltaTenths / 10;
  const flat = Math.abs(pct) < 0.5;
  const dir = pct > 0 ? "up" : "down";
  const good = isGood(dir, thresholds);
  const period = describeWindow(windowMinutes).replace("the last ", "");
  const label = `${flat ? "Flat" : dir === "up" ? "Up" : "Down"} ${Math.abs(pct).toFixed(1)}% versus the previous ${period}`;
  return (
    <span className="flex items-center gap-2 text-xs text-fg-subtle">
      <span
        role="img"
        aria-label={label}
        title={label}
        className={cn(
          "tabular inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
          flat ? "bg-surface-3 text-fg-muted" : good ? "bg-success/12 text-success" : "bg-danger/12 text-danger",
        )}
      >
        {!flat && (dir === "up" ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />)}
        {flat ? "0.0" : `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}`}%
      </span>
      <span aria-hidden>vs previous {period}</span>
    </span>
  );
}
