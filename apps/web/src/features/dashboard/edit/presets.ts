import type { WidgetConfig } from "@pulse/shared";

/**
 * "Add widget" options. Each is just a function returning a CONFIG object;
 * no new code per widget. That's the schema-driven part: the dashboard is
 * data, and the registry knows how to draw each `type`.
 */
export interface Preset {
  label: string;
  make: (id: string) => WidgetConfig;
}

export const newWidgetId = (): string => `w-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const TEMPLATES: Preset[] = [
  {
    label: "Errors over time",
    make: (id) => ({
      id,
      type: "line",
      title: "Errors (6h)",
      metric: { aggregate: "count", severities: ["error"], windowMinutes: 360 },
      bucketMinutes: 15,
      layout: { colSpan: 2, rowSpan: 2 },
    }),
  },
  {
    label: "Events by type",
    make: (id) => ({
      id,
      type: "bar",
      title: "Events by type (1h)",
      metric: { aggregate: "count", windowMinutes: 60 },
      groupBy: "type",
      layout: { colSpan: 2, rowSpan: 1 },
    }),
  },
  {
    label: "Events by severity",
    make: (id) => ({
      id,
      type: "bar",
      title: "Events by severity (1h)",
      metric: { aggregate: "count", windowMinutes: 60 },
      groupBy: "severity",
      layout: { colSpan: 2, rowSpan: 1 },
    }),
  },
  {
    label: "Total events",
    make: (id) => ({
      id,
      type: "kpi",
      title: "Events (15m)",
      metric: { aggregate: "count", windowMinutes: 15 },
      unit: "count",
      layout: { colSpan: 1, rowSpan: 1 },
    }),
  },
  {
    label: "Full event feed",
    make: (id) => ({ id, type: "feed", title: "All events", layout: { colSpan: 1, rowSpan: 2 } }),
  },
  {
    label: "Alert list",
    make: (id) => ({ id, type: "alertList", title: "Alerts", layout: { colSpan: 2, rowSpan: 1 } }),
  },
];

/** One "count of X" number per event type this tenant actually sends. */
export const countPreset = (eventType: string): Preset => ({
  label: eventType,
  make: (id) => ({
    id,
    type: "kpi",
    title: `${eventType} (15m)`,
    metric: { aggregate: "count", eventTypes: [eventType], windowMinutes: 15 },
    unit: "count",
    layout: { colSpan: 1, rowSpan: 1 },
  }),
});
