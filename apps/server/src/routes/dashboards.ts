import {
  DashboardIdSchema,
  UpdateDashboardRequestSchema,
  type Dashboard,
  type DashboardListResponse,
} from "@pulse/shared";
import { Router } from "express";
import { HttpError } from "../lib/errors.js";
import { getAuth } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import type { TenantBroadcaster } from "../realtime/hub.js";
import type { Store } from "../store/types.js";

export function dashboardsRouter(store: Store, hub: TenantBroadcaster): Router {
  const router = Router();

  router.get("/", requirePermission("dashboard:read"), (req, res) => {
    const { tenantId } = getAuth(req);
    const body: DashboardListResponse = {
      dashboards: store.dashboards
        .list(tenantId)
        .map(({ id, name, version, updatedAt }) => ({ id, name, version, updatedAt })),
    };
    res.json(body);
  });

  router.get("/:id", requirePermission("dashboard:read"), (req, res) => {
    const { tenantId } = getAuth(req);
    const id = DashboardIdSchema.parse(req.params.id);
    const dashboard = store.dashboards.get(tenantId, id);
    // Another tenant's dashboard is a 404, not a 403: a 403 would confirm
    // that the id exists, which is itself a cross-tenant leak.
    if (!dashboard) throw new HttpError("NOT_FOUND", "Dashboard not found");
    res.json(dashboard satisfies Dashboard);
  });

  router.put("/:id", requirePermission("dashboard:write"), (req, res) => {
    const { tenantId, userId } = getAuth(req);
    const id = DashboardIdSchema.parse(req.params.id);
    const body = UpdateDashboardRequestSchema.parse(req.body);

    const result = store.dashboards.save(tenantId, id, body.version, (current) => ({
      ...current,
      name: body.name ?? current.name,
      widgets: body.widgets,
      updatedAt: Date.now(),
      updatedBy: userId,
    }));

    if (!result.ok && result.reason === "not_found") {
      throw new HttpError("NOT_FOUND", "Dashboard not found");
    }
    if (!result.ok) {
      throw new HttpError(
        "CONFLICT",
        `Dashboard was changed by someone else (now version ${result.current.version}). Reload and retry.`,
      );
    }

    // Everyone in THIS tenant who is looking at the dashboard sees the change live.
    hub.publish(tenantId, { type: "dashboard.updated", dashboard: result.dashboard });
    res.json(result.dashboard);
  });

  return router;
}
