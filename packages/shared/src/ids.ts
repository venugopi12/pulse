import { z } from "zod";

/**
 * Branded ID types. At runtime they are plain strings, but the type system
 * treats them as distinct — you cannot accidentally pass a UserId where a
 * TenantId is expected. Cheap insurance for a multi-tenant codebase.
 */
export const TenantIdSchema = z.string().min(1).brand<"TenantId">();
export type TenantId = z.infer<typeof TenantIdSchema>;

export const UserIdSchema = z.string().min(1).brand<"UserId">();
export type UserId = z.infer<typeof UserIdSchema>;

export const EventIdSchema = z.string().min(1).brand<"EventId">();
export type EventId = z.infer<typeof EventIdSchema>;

export const DashboardIdSchema = z.string().min(1).brand<"DashboardId">();
export type DashboardId = z.infer<typeof DashboardIdSchema>;

export const InviteIdSchema = z.string().min(1).brand<"InviteId">();
export type InviteId = z.infer<typeof InviteIdSchema>;
