import { LiveSnapshotQuerySchema, toWire, type LiveSnapshot } from "@pulse/shared";
import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/errors.js";
import type { Simulator } from "../sim/simulator.js";
import { getAuth } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import type { Store } from "../store/types.js";

const IncidentRequestSchema = z
  .object({ durationSeconds: z.number().int().min(30).max(600).default(180) })
  .strict();

export function liveRouter(store: Store, simulator: Simulator | null): Router {
  const router = Router();

  /**
   * Snapshot for a client about to go live. All reads happen synchronously
   * in one tick of the event loop, so `seq`, `rollups` and `recent` describe
   * exactly the same moment — no event can slip in between them.
   */
  router.get("/snapshot", requirePermission("events:read"), (req, res) => {
    const { tenantId } = getAuth(req);
    const { minutes, recent } = LiveSnapshotQuerySchema.parse(req.query);
    const asOf = Date.now();
    const body: LiveSnapshot = {
      asOf,
      seq: store.events.seq(tenantId),
      rollups: toWire(store.rollups.get(tenantId), asOf - minutes * 60_000),
      recent: store.events.list(tenantId, { limit: recent }),
    };
    res.json(body);
  });

  /**
   * Demo control: make the simulator spike errors and latency for the
   * caller's OWN tenant (tenant from the token, as always). Admin only.
   */
  router.post("/incident", requirePermission("incidents:simulate"), (req, res) => {
    const { tenantId } = getAuth(req);
    const { durationSeconds } = IncidentRequestSchema.parse(req.body ?? {});
    if (!simulator) throw new HttpError("CONFLICT", "The event simulator is turned off (SIM_RATE=0)");
    simulator.startIncident(tenantId, durationSeconds * 1000);
    res.status(202).json({ endsAt: Date.now() + durationSeconds * 1000 });
  });

  return router;
}
