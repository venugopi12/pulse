import type { Metric, Role, Severity, Thresholds, WidgetConfig } from "@pulse/shared";
import type { Rng } from "./lib/random.js";

/** Describes one kind of event a tenant emits, and how to fake it. */
export interface EventKind {
  type: string;
  source: string;
  /** Relative frequency vs. other kinds in the same tenant. */
  weight: number;
  severity: Severity | ((value: number) => Severity);
  value: (rng: Rng) => number;
  /**
   * How this kind behaves during a simulated incident: `weight` multiplies
   * how often it happens, `valueScale` multiplies its value (e.g. latency x3).
   */
  incident?: { weight?: number; valueScale?: number };
}

export interface TenantProfile {
  id: string;
  slug: string;
  name: string;
  accent: string;
  users: { email: string; name: string; role: Role }[];
  events: EventKind[];
  /** Widgets for the tenant's default "Overview" dashboard. */
  widgets: WidgetConfig[];
}

// --- tiny builders so each tenant's dashboard reads like a spec -------------
type KpiUnit = Extract<WidgetConfig, { type: "kpi" }>["unit"];
const kpi = (id: string, title: string, metric: Metric, unit: KpiUnit, thresholds?: Thresholds): WidgetConfig => ({
  id,
  type: "kpi",
  title,
  metric,
  unit,
  layout: { colSpan: 1, rowSpan: 1 },
  ...(thresholds ? { thresholds } : {}),
});

const standardWidgets = (
  k: [WidgetConfig, WidgetConfig, WidgetConfig, WidgetConfig],
  lineTitle: string,
  lineMetric: Metric,
  lineUnit: KpiUnit = "count",
): WidgetConfig[] => [
  ...k,
  { id: "trend", type: "line", title: lineTitle, metric: lineMetric, unit: lineUnit, bucketMinutes: 15, layout: { colSpan: 3, rowSpan: 2 } },
  // The full stream is ~20 events/sec: unreadable in a card. The dashboard
  // feed shows what needs attention; the Events page has everything.
  { id: "feed", type: "feed", title: "Warnings and errors", severities: ["warn", "error"], layout: { colSpan: 1, rowSpan: 2 } },
  { id: "by-source", type: "bar", title: "Events by source (1h)", metric: { aggregate: "count", windowMinutes: 60 }, groupBy: "source", layout: { colSpan: 2, rowSpan: 1 } },
  { id: "alerts", type: "alertList", title: "Alerts", layout: { colSpan: 2, rowSpan: 1 } },
];

// Thresholds were calibrated with scripts/calibrate.ts at the default 30
// events/sec: each sits above the normal reading at peak hours and below the
// reading during a 2-4 minute incident, even at the quietest hour.
// Alerting KPIs use short windows so incidents show up fast.
// Error volume differs by business, so each tenant gets its own thresholds.
const errorsKpi = (warn: number, critical: number) =>
  kpi("errors", "Errors (5m)", { aggregate: "count", severities: ["error"], windowMinutes: 5 }, "count", { direction: "above", warn, critical });

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Latency-like values: mostly fast, with a long slow tail. */
const latency = (rng: Rng, median: number) =>
  Math.round(median * Math.exp((rng.next() + rng.next() + rng.next() - 1.5) * 1.2));
const latencySeverity = (ms: number): Severity =>
  ms > 1200 ? "error" : ms > 600 ? "warn" : "info";

export const DEMO_PASSWORD = "pulse-demo-2026";

export const TENANT_PROFILES: TenantProfile[] = [
  {
    id: "tnt_acme",
    slug: "acme-health",
    name: "Acme Health",
    accent: "#2dd4bf", // teal
    users: [
      { email: "admin@acme.test", name: "Priya Raman", role: "admin" },
      { email: "viewer@acme.test", name: "Daniel Okafor", role: "viewer" },
    ],
    events: [
      { type: "appointment.booked", source: "scheduling", weight: 30, severity: "info", value: () => 1 },
      { type: "patient.checked_in", source: "front-desk", weight: 22, severity: "info", value: () => 1 },
      { type: "claim.submitted", source: "billing", weight: 12, severity: "info", value: (r) => round2(r.between(80, 1200)) },
      { type: "lab.result_ready", source: "labs", weight: 10, severity: "info", value: (r) => r.int(1, 6) },
      { type: "api.request", source: "ehr-gateway", weight: 22, severity: latencySeverity, value: (r) => latency(r, 180), incident: { valueScale: 3 } },
      { type: "ehr.sync_failed", source: "ehr-gateway", weight: 2, severity: "error", value: () => 1, incident: { weight: 8 } },
      { type: "claim.rejected", source: "billing", weight: 2, severity: "warn", value: (r) => round2(r.between(80, 900)) },
    ],
    widgets: standardWidgets(
      [
        kpi("appointments", "Appointments (1h)", { aggregate: "count", eventTypes: ["appointment.booked"], windowMinutes: 60 }, "count"),
        kpi("claims-value", "Claims value (1h)", { aggregate: "sum", eventTypes: ["claim.submitted"], windowMinutes: 60 }, "currency"),
        kpi("ehr-latency", "EHR latency (avg, 5m)", { aggregate: "avg", eventTypes: ["api.request"], windowMinutes: 5 }, "ms", { direction: "above", warn: 300, critical: 450 }),
        errorsKpi(250, 450),
      ],
      "Appointments booked (6h)",
      { aggregate: "count", eventTypes: ["appointment.booked"], windowMinutes: 360 },
    ),
  },
  {
    id: "tnt_nova",
    slug: "nova-retail",
    name: "Nova Retail",
    accent: "#a78bfa", // violet
    users: [
      { email: "admin@nova.test", name: "Sofia Marquez", role: "admin" },
      { email: "viewer@nova.test", name: "Kenji Watanabe", role: "viewer" },
    ],
    events: [
      { type: "page.view", source: "storefront", weight: 40, severity: "info", value: () => 1 },
      { type: "cart.item_added", source: "storefront", weight: 18, severity: "info", value: (r) => round2(r.between(8, 160)) },
      { type: "order.placed", source: "checkout", weight: 10, severity: "info", value: (r) => round2(r.between(15, 420)) },
      { type: "cart.abandoned", source: "storefront", weight: 7, severity: "warn", value: (r) => round2(r.between(10, 300)) },
      { type: "api.request", source: "checkout", weight: 20, severity: latencySeverity, value: (r) => latency(r, 140), incident: { valueScale: 3 } },
      { type: "payment.failed", source: "checkout", weight: 3, severity: "error", value: (r) => round2(r.between(15, 420)), incident: { weight: 6 } },
      { type: "checkout.error", source: "checkout", weight: 2, severity: "error", value: () => 1, incident: { weight: 8 } },
    ],
    widgets: standardWidgets(
      [
        kpi("orders", "Orders (1h)", { aggregate: "count", eventTypes: ["order.placed"], windowMinutes: 60 }, "count"),
        kpi("revenue", "Revenue (1h)", { aggregate: "sum", eventTypes: ["order.placed"], windowMinutes: 60 }, "currency"),
        kpi("checkout-latency", "Checkout latency (avg, 5m)", { aggregate: "avg", eventTypes: ["api.request"], windowMinutes: 5 }, "ms", { direction: "above", warn: 250, critical: 340 }),
        errorsKpi(550, 800),
      ],
      "Revenue (6h)",
      { aggregate: "sum", eventTypes: ["order.placed"], windowMinutes: 360 },
      "currency",
    ),
  },
  {
    id: "tnt_orbit",
    slug: "orbit-logistics",
    name: "Orbit Logistics",
    accent: "#f59e0b", // amber
    users: [
      { email: "admin@orbit.test", name: "Lars Henriksen", role: "admin" },
      { email: "viewer@orbit.test", name: "Amara Nwosu", role: "viewer" },
    ],
    events: [
      { type: "vehicle.gps_ping", source: "fleet", weight: 38, severity: "info", value: (r) => r.int(20, 95), incident: { valueScale: 0.45 } },
      { type: "shipment.created", source: "dispatch", weight: 16, severity: "info", value: (r) => round2(r.between(1, 40)) },
      { type: "shipment.delivered", source: "fleet", weight: 15, severity: "info", value: (r) => r.int(1, 3) },
      { type: "package.scanned", source: "warehouse", weight: 20, severity: "info", value: () => 1 },
      { type: "delivery.delayed", source: "fleet", weight: 6, severity: "warn", value: (r) => r.int(10, 240), incident: { weight: 4 } },
      { type: "scanner.error", source: "warehouse", weight: 3, severity: "error", value: () => 1, incident: { weight: 8 } },
      { type: "route.optimized", source: "dispatch", weight: 2, severity: "info", value: (r) => r.int(2, 18) },
    ],
    widgets: standardWidgets(
      [
        kpi("deliveries", "Deliveries (1h)", { aggregate: "count", eventTypes: ["shipment.delivered"], windowMinutes: 60 }, "count"),
        kpi("delays", "Delayed deliveries (5m)", { aggregate: "count", eventTypes: ["delivery.delayed"], windowMinutes: 5 }, "count", { direction: "above", warn: 600, critical: 900 }),
        kpi("utilisation", "Fleet utilisation (avg, 5m)", { aggregate: "avg", eventTypes: ["vehicle.gps_ping"], windowMinutes: 5 }, "percent", { direction: "below", warn: 48, critical: 40 }),
        errorsKpi(400, 600),
      ],
      "Shipments created (6h)",
      { aggregate: "count", eventTypes: ["shipment.created"], windowMinutes: 360 },
    ),
  },
];
