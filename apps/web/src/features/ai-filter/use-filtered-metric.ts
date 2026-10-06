import { applyFilterToMetric, type Metric } from "@pulse/shared";
import { useMemo } from "react";
import { useActiveFilter } from "./store";

/**
 * A widget's metric, narrowed by the active AI filter (if any). Memoized so
 * selectors downstream see a stable object until the filter changes.
 */
export function useFilteredMetric(metric: Metric): Metric {
  const active = useActiveFilter();
  return useMemo(() => (active ? applyFilterToMetric(metric, active.filter) : metric), [metric, active]);
}

/** Pick a sensible chart step for a filter's time range: ~12-30 points. */
export function bucketFor(windowMinutes: number, fallback: number): number {
  if (windowMinutes <= 30) return 1;
  if (windowMinutes <= 60) return 5;
  if (windowMinutes <= 180) return 10;
  if (windowMinutes <= 360) return 15;
  if (windowMinutes <= 720) return 30;
  return Math.max(fallback, 60);
}
