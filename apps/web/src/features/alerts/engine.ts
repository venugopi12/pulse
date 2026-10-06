import { LEVEL_RANK, thresholdLevel, type AlertLevel, type Thresholds } from "@pulse/shared";

export interface WatchedMetric {
  widgetId: string;
  thresholds: Thresholds;
}

export interface Transition {
  widgetId: string;
  from: AlertLevel;
  to: AlertLevel;
  value: number | null;
  at: number;
}

interface WidgetAlertState {
  confirmed: AlertLevel;
  candidate: AlertLevel;
  candidateSince: number;
}

/**
 * Turns a stream of metric values into alert transitions, with HYSTERESIS.
 *
 * A raw "value > threshold" check flaps: a metric hovering at 449/451 would
 * fire and resolve every second. So a new level must hold for a while before
 * it counts:
 *   - getting worse (ok -> warn -> critical): `fireAfterMs` (fast, 3s)
 *   - getting better: `clearAfterMs` (slower, 10s), so a brief dip doesn't
 *     resolve a real incident.
 *
 * Pure logic, no React and no timers: easy to unit-test with fake clocks.
 */
export function createAlertEngine(
  watched: WatchedMetric[],
  { fireAfterMs = 3_000, clearAfterMs = 10_000 } = {},
) {
  const states = new Map<string, WidgetAlertState>(
    watched.map((w) => [w.widgetId, { confirmed: "ok", candidate: "ok", candidateSince: 0 }]),
  );

  return {
    evaluate(values: ReadonlyMap<string, number | null>, now: number): Transition[] {
      const out: Transition[] = [];
      for (const w of watched) {
        const state = states.get(w.widgetId);
        if (!state || !values.has(w.widgetId)) continue;
        const value = values.get(w.widgetId) ?? null;
        const raw = thresholdLevel(value, w.thresholds);

        if (raw === state.confirmed) {
          state.candidate = raw;
          continue;
        }
        if (raw !== state.candidate) {
          state.candidate = raw;
          state.candidateSince = now;
          continue;
        }
        const worse = LEVEL_RANK[raw] > LEVEL_RANK[state.confirmed];
        if (now - state.candidateSince >= (worse ? fireAfterMs : clearAfterMs)) {
          out.push({ widgetId: w.widgetId, from: state.confirmed, to: raw, value, at: now });
          state.confirmed = raw;
        }
      }
      return out;
    },
    levels(): Record<string, AlertLevel> {
      return Object.fromEntries([...states].map(([id, s]) => [id, s.confirmed]));
    },
  };
}
export type AlertEngine = ReturnType<typeof createAlertEngine>;
