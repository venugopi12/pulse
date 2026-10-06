import { computeMetric, type Metric } from "@pulse/shared";
import { perf } from "@/perf/flags";
import { useLiveStore } from "@/stores/live";

/**
 * Current value of a metric, or undefined until live data has loaded
 * (null = an average with no data in the window).
 *
 * The selector returns a ROUNDED primitive. Zustand compares selector
 * results with Object.is, so this component re-renders only when the number
 * it shows actually changes, not on every 250ms flush.
 */
function useMetricNarrow(metric: Metric): number | null | undefined {
  return useLiveStore((s) => {
    if (!s.hydrated) return undefined;
    const value = computeMetric(s.rollups, metric, s.now);
    return value === null ? null : Math.round(value);
  });
}

/** ?perf=nomemo: subscribe to the whole store and recompute on every update. */
function useMetricWide(metric: Metric): number | null | undefined {
  const s = useLiveStore();
  if (!s.hydrated) return undefined;
  const value = computeMetric(s.rollups, metric, s.now);
  return value === null ? null : Math.round(value);
}

export const useMetric = perf.memo ? useMetricNarrow : useMetricWide;
