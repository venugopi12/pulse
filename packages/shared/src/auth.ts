import { z } from "zod";
import { TenantIdSchema, UserIdSchema } from "./ids.js";
import { TenantSchema } from "./tenant.js";

export const RoleSchema = z.enum(["admin", "viewer"]);
export type Role = z.infer<typeof RoleSchema>;

/** Body of POST /api/auth/login. Validated on the client AND the server. */
export const LoginRequestSchema = z.object({
  // Normalise first (trim + lowercase), THEN validate the format.
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** A user as the outside world may see it — never includes the password hash. */
export const PublicUserSchema = z.object({
  id: UserIdSchema,
  tenantId: TenantIdSchema,
  email: z.email(),
  name: z.string().min(1),
  role: RoleSchema,
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

/**
 * Claims we put inside the JWT. Deliberately small: the token travels with
 * every request and every WebSocket handshake.
 * `sub` is the standard JWT "subject" claim (the user id).
 */
export const AuthClaimsSchema = z.object({
  sub: UserIdSchema,
  tenantId: TenantIdSchema,
  role: RoleSchema,
});
export type AuthClaims = z.infer<typeof AuthClaimsSchema>;

export const LoginResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.number().int(), // epoch ms
  user: PublicUserSchema,
  tenant: TenantSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const MeResponseSchema = z.object({
  user: PublicUserSchema,
  tenant: TenantSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
