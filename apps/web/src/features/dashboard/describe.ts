import type { Metric, Thresholds, WidgetConfig } from "@pulse/shared";
import { formatValue, type Unit } from "@/lib/format";

const AGG = { count: "Count", sum: "Total", avg: "Average" } as const;

export function describeWindow(minutes: number): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "the last hour" : `the last ${h} hours`;
  }
  return `the last ${minutes} minutes`;
}

/** "Count of appointment.booked over the last hour" — config as a sentence. */
export function describeMetric(metric: Metric): string {
  const what = metric.eventTypes?.join(", ") ?? "all events";
  const sev = metric.severities ? ` (${metric.severities.join(", ")})` : "";
  const from = metric.sources ? ` from ${metric.sources.join(", ")}` : "";
  return `${AGG[metric.aggregate]} of ${what}${sev}${from} over ${describeWindow(metric.windowMinutes)}`;
}

export function describeThresholds(t: Thresholds, unit: Unit = "count"): string {
  const dir = t.direction === "above" ? "above" : "below";
  const parts: string[] = [];
  if (t.warn !== undefined) parts.push(`warn ${dir} ${formatValue(t.warn, unit)}`);
  if (t.critical !== undefined) parts.push(`critical ${dir} ${formatValue(t.critical, unit)}`);
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function describeWidget(w: WidgetConfig): string {
  switch (w.type) {
    case "kpi":
      return describeMetric(w.metric);
    case "line":
      return `${describeMetric(w.metric)}, in ${w.bucketMinutes}-minute steps`;
    case "bar":
      return `${describeMetric(w.metric)}, grouped by ${w.groupBy}`;
    case "feed":
      return w.severities ? `Newest ${w.severities.join(" and ")} events first` : "Newest events first";
    case "alertList":
      return "Widgets that crossed a threshold";
  }
}
