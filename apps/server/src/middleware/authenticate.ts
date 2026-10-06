import type { Request, RequestHandler } from "express";
import { resolveAuth, type AuthContext } from "../auth/context.js";
import type { TokenService } from "../auth/jwt.js";
import { HttpError } from "../lib/errors.js";
import type { Store } from "../store/types.js";

// Declaration merging: teach Express's Request type about `req.auth`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Verifies `Authorization: Bearer <jwt>` and attaches an AuthContext to
 * req.auth. From here on, tenantId comes ONLY from req.auth — never from
 * body, query or params.
 */
export function authenticate(store: Store, tokens: TokenService): RequestHandler {
  return async (req, _res, next) => {
    const header = req.get("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new HttpError("UNAUTHORIZED", "Missing bearer token");
    }
    req.auth = await resolveAuth(store, tokens, token);
    next();
  };
}

/** Typed accessor for routes mounted behind `authenticate`. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw new HttpError("UNAUTHORIZED", "Not authenticated");
  return req.auth;
}
