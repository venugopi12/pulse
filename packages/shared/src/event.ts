import { z } from "zod";
import { EventIdSchema, TenantIdSchema } from "./ids.js";

export const SeveritySchema = z.enum(["info", "warn", "error"]);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * One analytics event. Timestamps are epoch milliseconds (numbers, not ISO
 * strings): smaller on the wire, trivially sortable, and cheap to bucket
 * into chart time windows.
 */
export const AnalyticsEventSchema = z.object({
  id: EventIdSchema,
  tenantId: TenantIdSchema,
  type: z.string().min(1), // e.g. "order.placed"
  source: z.string().min(1), // service that emitted it, e.g. "checkout"
  severity: SeveritySchema,
  value: z.number(), // metric payload: revenue, latency ms, count…
  timestamp: z.number().int().nonnegative(),
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

/**
 * Query string of GET /api/events. `z.coerce` because query values arrive as
 * strings. `.strict()` rejects `?tenantId=...` outright — the tenant only
 * ever comes from the JWT.
 */
export const EventsQuerySchema = z
  .object({
    since: z.coerce.number().int().nonnegative().optional(),
    limit: z.coerce.number().int().min(1).max(10_000).default(200),
    severity: SeveritySchema.optional(),
    type: z.string().min(1).optional(),
  })
  .strict();
export type EventsQuery = z.infer<typeof EventsQuerySchema>;

export const EventsResponseSchema = z.object({ events: z.array(AnalyticsEventSchema) });
export type EventsResponse = z.infer<typeof EventsResponseSchema>;
