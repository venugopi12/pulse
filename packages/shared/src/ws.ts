import { z } from "zod";
import { RoleSchema } from "./auth.js";
import { AnalyticsEventSchema } from "./event.js";
import { TenantIdSchema, UserIdSchema } from "./ids.js";
import { DashboardSchema } from "./widget.js";

export const WS_PATH = "/ws";

/**
 * Browsers can't set an Authorization header on a WebSocket, so the client
 * offers two subprotocols: `pulse.v1` (the real one, echoed back by the
 * server) and `bearer.<jwt>` (carries the token, never echoed). This keeps
 * the token out of URLs — URLs end up in proxy and access logs.
 */
export const WS_PROTOCOL = "pulse.v1";
export const WS_TOKEN_PROTOCOL_PREFIX = "bearer.";
export const wsProtocols = (token: string): string[] => [
  WS_PROTOCOL,
  `${WS_TOKEN_PROTOCOL_PREFIX}${token}`,
];

/** Application close codes live in the 4000–4999 range. */
export const WsCloseCode = {
  TokenExpired: 4001,
  SlowConsumer: 4008,
  ServerShutdown: 1001,
} as const;

/** Everything the server can send. One schema = one exhaustive `switch` on the client. */
export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    tenantId: TenantIdSchema,
    userId: UserIdSchema,
    role: RoleSchema,
    serverTime: z.number().int(),
  }),
  // Always an array: lets the server batch events into fewer frames later.
  // `firstSeq` = sequence number of events[0]; the rest are consecutive.
  z.object({ type: z.literal("events"), firstSeq: z.number().int().positive(), events: z.array(AnalyticsEventSchema) }),
  z.object({ type: z.literal("dashboard.updated"), dashboard: DashboardSchema }),
  z.object({ type: z.literal("pong"), t: z.number() }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Everything a client may send. Note: there is no way to name a tenant. */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping"), t: z.number() }).strict(),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
