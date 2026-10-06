import { EventsQuerySchema, type EventsResponse } from "@pulse/shared";
import { Router } from "express";
import { getAuth } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import type { Store } from "../store/types.js";

export function eventsRouter(store: Store): Router {
  const router = Router();

  router.get("/", requirePermission("events:read"), (req, res) => {
    const { tenantId } = getAuth(req); // the ONLY tenant this request can see
    const query = EventsQuerySchema.parse(req.query); // ?tenantId=... -> 400
    const body: EventsResponse = { events: store.events.list(tenantId, query) };
    res.json(body);
  });

  return router;
}
