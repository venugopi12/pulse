import {
  InviteIdSchema,
  InviteRequestSchema,
  InviteSchema,
  type Invite,
} from "@pulse/shared";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { HttpError } from "../lib/errors.js";
import { getAuth } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import type { Store } from "../store/types.js";
import { toPublicUser } from "./auth.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function usersRouter(store: Store): Router {
  const router = Router();

  router.get("/", requirePermission("users:read"), (req, res) => {
    const { tenantId } = getAuth(req);
    res.json({ users: store.users.listByTenant(tenantId).map(toPublicUser) });
  });

  router.get("/invites", requirePermission("users:invite"), (req, res) => {
    const { tenantId } = getAuth(req);
    res.json({ invites: store.invites.listByTenant(tenantId) });
  });

  router.post("/invites", requirePermission("users:invite"), (req, res) => {
    const { tenantId, userId } = getAuth(req);
    const { email, role } = InviteRequestSchema.parse(req.body);

    // Only check duplicates INSIDE this tenant. If we said "that email already
    // has an account" for a user in another tenant, an Acme admin could probe
    // who works at Nova. Cross-tenant existence must stay invisible.
    const isMember = store.users.listByTenant(tenantId).some((u) => u.email === email);
    const isInvited = store.invites.listByTenant(tenantId).some((i) => i.email === email);
    if (isMember || isInvited) {
      throw new HttpError("CONFLICT", `${email} is already a member or invited`);
    }

    const now = Date.now();
    const invite: Invite = InviteSchema.parse({
      id: InviteIdSchema.parse(`inv_${randomUUID()}`),
      tenantId, // from the token, full stop
      email,
      role,
      invitedBy: userId,
      createdAt: now,
      expiresAt: now + INVITE_TTL_MS,
    });
    store.invites.insert(invite);
    res.status(201).json(invite);
  });

  return router;
}
