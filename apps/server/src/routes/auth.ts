import {
  LoginRequestSchema,
  type LoginResponse,
  type MeResponse,
  type PublicUser,
} from "@pulse/shared";
import { Router, type RequestHandler } from "express";
import type { TokenService } from "../auth/jwt.js";
import { DUMMY_HASH, verifyPassword } from "../auth/password.js";
import { HttpError } from "../lib/errors.js";
import { authenticate, getAuth } from "../middleware/authenticate.js";
import type { Store, UserRecord } from "../store/types.js";

/** Strip server-only fields before anything is sent to a client. */
export const toPublicUser = ({ passwordHash: _omit, ...user }: UserRecord): PublicUser => user;

export function authRouter(store: Store, tokens: TokenService, loginLimiter: RequestHandler): Router {
  const router = Router();

  // Rate limit runs BEFORE bcrypt, so brute force can't also burn our CPU.
  router.post("/login", loginLimiter, async (req, res) => {
    // Throws ZodError on bad input -> errorHandler returns 400 with issues.
    const { email, password } = LoginRequestSchema.parse(req.body);

    const user = store.users.findByEmail(email);
    // Always run bcrypt, even for unknown emails (see DUMMY_HASH).
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      // Same message for both cases — don't reveal which emails exist.
      throw new HttpError("UNAUTHORIZED", "Invalid email or password");
    }

    const tenant = store.tenants.getById(user.tenantId);
    if (!tenant) throw new HttpError("INTERNAL", "User has no tenant");

    const { token, expiresAt } = await tokens.sign({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    const body: LoginResponse = { token, expiresAt, user: toPublicUser(user), tenant };
    res.json(body);
  });

  router.get("/me", authenticate(store, tokens), (req, res) => {
    const { userId, tenantId } = getAuth(req);
    const user = store.users.findById(tenantId, userId);
    const tenant = store.tenants.getById(tenantId);
    if (!user || !tenant) throw new HttpError("UNAUTHORIZED", "Account no longer exists");

    const body: MeResponse = { user: toPublicUser(user), tenant };
    res.json(body);
  });

  return router;
}
