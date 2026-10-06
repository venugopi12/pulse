import type { Role, TenantId, UserId } from "@pulse/shared";
import { HttpError } from "../lib/errors.js";
import type { Store } from "../store/types.js";
import type { TokenService } from "./jwt.js";

/**
 * Who is making this request. Built from the JWT + the store, and the ONLY
 * source of tenantId anywhere in request handling (HTTP and WebSocket).
 */
export interface AuthContext {
  userId: UserId;
  tenantId: TenantId;
  role: Role;
  tokenExpiresAt: number;
}

/**
 * "The token says who you are; the store says what you can do."
 * We verify the JWT, then load the user (scoped to the token's tenant):
 *  - a deleted user is locked out immediately, not when their token expires;
 *  - a demoted admin loses admin rights on their very next request.
 * Shared by the HTTP middleware and the WebSocket handshake.
 */
export async function resolveAuth(
  store: Store,
  tokens: TokenService,
  token: string,
): Promise<AuthContext> {
  let claims;
  try {
    claims = await tokens.verify(token);
  } catch {
    throw new HttpError("UNAUTHORIZED", "Invalid or expired token");
  }

  const user = store.users.findById(claims.tenantId, claims.sub);
  if (!user) throw new HttpError("UNAUTHORIZED", "Account no longer exists");

  return {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    tokenExpiresAt: claims.expiresAt,
  };
}
