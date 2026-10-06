import { z } from "zod";
import { RoleSchema, PublicUserSchema } from "./auth.js";
import { InviteIdSchema, TenantIdSchema, UserIdSchema } from "./ids.js";

export const InviteRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
    role: RoleSchema,
  })
  .strict();
export type InviteRequest = z.infer<typeof InviteRequestSchema>;

export const InviteSchema = z.object({
  id: InviteIdSchema,
  tenantId: TenantIdSchema,
  email: z.email(),
  role: RoleSchema,
  invitedBy: UserIdSchema,
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
});
export type Invite = z.infer<typeof InviteSchema>;

export const UserListResponseSchema = z.object({ users: z.array(PublicUserSchema) });
export const InviteListResponseSchema = z.object({ invites: z.array(InviteSchema) });
