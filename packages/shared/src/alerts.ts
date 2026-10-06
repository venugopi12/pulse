import type { Thresholds } from "./widget.js";

export type AlertLevel = "ok" | "warn" | "critical";

/** Where a value sits relative to a widget's thresholds. */
export function thresholdLevel(value: number | null, t: Thresholds): AlertLevel {
  if (value === null) return "ok";
  const beyond = (limit: number | undefined) =>
    limit !== undefined && (t.direction === "above" ? value > limit : value < limit);
  if (beyond(t.critical)) return "critical";
  if (beyond(t.warn)) return "warn";
  return "ok";
}

export const LEVEL_RANK: Record<AlertLevel, number> = { ok: 0, warn: 1, critical: 2 };
