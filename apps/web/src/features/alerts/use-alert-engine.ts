import { computeMetric, seriesFromRollups, type Thresholds, type WidgetConfig } from "@pulse/shared";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { usePrimaryDashboard } from "@/features/dashboard/queries";
import { formatValue } from "@/lib/format";
import { useLiveStore } from "@/stores/live";
import { useSession } from "@/stores/session";
import { createAlertEngine } from "./engine";
import { useAlertsStore } from "./store";

type Watched = Extract<WidgetConfig, { type: "kpi" | "line" }> & { thresholds: Thresholds };

const EVALUATE_EVERY_MS = 1_000;

/**
 * Runs in the app shell, so alerts keep working on every page, not just the
 * dashboard. Evaluates thresholds from the live store once a second, OUTSIDE
 * React rendering (a store subscription), and only touches React state when
 * an alert actually starts or ends.
 */
export function useAlertEngine(): void {
  const { tenant } = useSession();
  const { dashboard } = usePrimaryDashboard();
  const widgets = dashboard?.widgets;

  // Only what the engine depends on. Reordering or resizing widgets leaves
  // this unchanged, so open alerts are NOT reset by a layout save; editing a
  // threshold or metric changes it and restarts the engine.
  const watched = useMemo(
    () =>
      (widgets ?? []).filter(
        (w): w is Watched => (w.type === "kpi" || w.type === "line") && w.thresholds !== undefined,
      ),
    [widgets],
  );
  const signature = JSON.stringify(
    watched.map((w) => [w.id, w.title, w.metric, w.thresholds, w.type === "line" ? w.bucketMinutes : 0]),
  );

  useEffect(() => {
    useAlertsStore.getState().reset();
  }, [tenant.id]);

  useEffect(() => {
    if (watched.length === 0) return;

    // A new config (e.g. an admin edited thresholds) starts a fresh engine, so
    // close whatever was open under the old rules; still-true alerts re-fire.
    useAlertsStore.getState().closeAll(Date.now());
    const engine = createAlertEngine(watched.map((w) => ({ widgetId: w.id, thresholds: w.thresholds })));
    const byId = new Map(watched.map((w) => [w.id, w]));
    let last = 0;

    const evaluate = () => {
      const s = useLiveStore.getState();
      if (!s.hydrated || s.now - last < EVALUATE_EVERY_MS) return;
      last = s.now;

      const values = new Map<string, number | null>();
      for (const w of watched) {
        if (w.type === "kpi") {
          values.set(w.id, computeMetric(s.rollups, w.metric, s.now));
        } else {
          // Lines alert on the last COMPLETE bucket, not the one still filling.
          const series = seriesFromRollups(s.rollups, w.metric, w.bucketMinutes, s.now);
          values.set(w.id, series[series.length - 2]?.value ?? null);
        }
      }

      const alerts = useAlertsStore.getState();
      for (const t of engine.evaluate(values, s.now)) {
        const w = byId.get(t.widgetId);
        if (!w) continue;
        const unit = w.unit ?? "count";
        const shown = t.value === null ? "no data" : formatValue(Math.round(t.value), unit);
        if (t.to === "ok") {
          alerts.resolve(w.id, t.at);
          toast.success(`${w.title} is back to normal`, { description: `Now ${shown}` });
        } else {
          alerts.raise({ widgetId: w.id, title: w.title, level: t.to, value: t.value, unit, startedAt: t.at });
          const limit = t.to === "critical" ? w.thresholds.critical : w.thresholds.warn;
          const description = `Now ${shown}, ${w.thresholds.direction} ${limit === undefined ? "" : formatValue(limit, unit)}`;
          if (t.to === "critical") toast.error(`${w.title} is critical`, { description });
          else toast.warning(`${w.title} needs attention`, { description });
        }
      }
    };

    evaluate();
    return useLiveStore.subscribe(evaluate);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` captures what matters in `watched`
  }, [signature, tenant.id]);
}
