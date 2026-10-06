import { z } from "zod";
import { DashboardIdSchema, TenantIdSchema, UserIdSchema } from "./ids.js";
import { SeveritySchema } from "./event.js";

/** What to measure: an aggregate over matching events in a time window. */
export const MetricSchema = z
  .object({
    aggregate: z.enum(["count", "sum", "avg"]),
    /** Omit to include every event type. */
    eventTypes: z.array(z.string().min(1)).min(1).max(20).optional(),
    /** Omit to include every source. */
    sources: z.array(z.string().min(1)).min(1).max(20).optional(),
    severities: z.array(SeveritySchema).min(1).optional(),
    windowMinutes: z.number().int().min(1).max(1440),
  })
  .strict();
export type Metric = z.infer<typeof MetricSchema>;

/** How a metric's numbers are formatted. */
export const UnitSchema = z.enum(["count", "currency", "ms", "percent"]);
export type Unit = z.infer<typeof UnitSchema>;

/** Alert when the metric crosses these values. */
export const ThresholdsSchema = z
  .object({
    direction: z.enum(["above", "below"]),
    warn: z.number().optional(),
    critical: z.number().optional(),
  })
  .strict()
  .refine((t) => t.warn !== undefined || t.critical !== undefined, {
    message: "Set at least one of warn or critical",
  })
  .refine(
    (t) =>
      t.warn === undefined ||
      t.critical === undefined ||
      (t.direction === "above" ? t.critical >= t.warn : t.critical <= t.warn),
    { message: "critical must be beyond warn in the alert direction", path: ["critical"] },
  );
export type Thresholds = z.infer<typeof ThresholdsSchema>;

/**
 * Bento grid on 4 columns. Order on screen = order in the widgets array,
 * so drag-and-drop reordering is just an array move.
 */
export const LayoutSchema = z
  .object({
    colSpan: z.number().int().min(1).max(4),
    rowSpan: z.number().int().min(1).max(3),
  })
  .strict();

const base = {
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  title: z.string().trim().min(1).max(60),
  layout: LayoutSchema,
};

/**
 * A discriminated union on `type`: TypeScript narrows on `widget.type`, and
 * Zod gives precise errors ("bar requires groupBy"). Adding a new widget kind
 * = add one member here + one renderer on the client.
 */
export const WidgetConfigSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("kpi"),
      metric: MetricSchema,
      unit: UnitSchema,
      thresholds: ThresholdsSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("line"),
      metric: MetricSchema,
      unit: UnitSchema.optional(),
      bucketMinutes: z.number().int().min(1).max(240),
      thresholds: ThresholdsSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("bar"),
      metric: MetricSchema,
      unit: UnitSchema.optional(),
      groupBy: z.enum(["type", "source", "severity"]),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("feed"),
      severities: z.array(SeveritySchema).min(1).optional(),
      eventTypes: z.array(z.string().min(1)).min(1).optional(),
    })
    .strict(),
  z.object({ ...base, type: z.literal("alertList") }).strict(),
]);
export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;
export type WidgetType = WidgetConfig["type"];

export const WidgetListSchema = z
  .array(WidgetConfigSchema)
  .max(24)
  .refine((ws) => new Set(ws.map((w) => w.id)).size === ws.length, {
    message: "Widget ids must be unique",
  });

export const DashboardSchema = z.object({
  id: DashboardIdSchema,
  tenantId: TenantIdSchema,
  name: z.string().trim().min(1).max(60),
  widgets: WidgetListSchema,
  /** Incremented on every save — used for optimistic concurrency. */
  version: z.number().int().nonnegative(),
  updatedAt: z.number().int(),
  updatedBy: UserIdSchema.nullable(),
});
export type Dashboard = z.infer<typeof DashboardSchema>;

/**
 * Body of PUT /api/dashboards/:id. `.strict()` means a `tenantId` (or any
 * other unexpected key) in the body is rejected with 400, not silently used.
 * `version` is the version the client last saw: if someone else saved in
 * between, the server answers 409 instead of overwriting their change.
 */
export const UpdateDashboardRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    widgets: WidgetListSchema,
    version: z.number().int().nonnegative(),
  })
  .strict();
export type UpdateDashboardRequest = z.infer<typeof UpdateDashboardRequestSchema>;

export const DashboardListResponseSchema = z.object({
  dashboards: z.array(DashboardSchema.pick({ id: true, name: true, version: true, updatedAt: true })),
});
export type DashboardListResponse = z.infer<typeof DashboardListResponseSchema>;
