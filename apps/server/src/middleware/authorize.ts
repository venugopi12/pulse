import { can, type Permission } from "@pulse/shared";
import type { RequestHandler } from "express";
import { HttpError } from "../lib/errors.js";
import { getAuth } from "./authenticate.js";

/**
 * Route guard: `router.put("/x", requirePermission("dashboard:write"), handler)`.
 * Uses the SAME `can()` + role matrix the UI imports from @pulse/shared.
 * 401 = we don't know who you are; 403 = we know, and you're not allowed.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const { role } = getAuth(req);
    if (!can(role, permission)) {
      throw new HttpError("FORBIDDEN", `Your role (${role}) cannot ${permission}`);
    }
    next();
  };
}
