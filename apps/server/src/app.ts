import cors from "cors";
import express, { type Express, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { TokenService } from "./auth/jwt.js";
import { HttpError, errorHandler, notFound } from "./lib/errors.js";
import { authenticate } from "./middleware/authenticate.js";
import type { TenantBroadcaster } from "./realtime/hub.js";
import type { Simulator } from "./sim/simulator.js";
import { aiRouter, type AiOptions } from "./routes/ai.js";
import { authRouter } from "./routes/auth.js";
import { dashboardsRouter } from "./routes/dashboards.js";
import { eventsRouter } from "./routes/events.js";
import { liveRouter } from "./routes/live.js";
import { usersRouter } from "./routes/users.js";
import type { Store } from "./store/types.js";

export interface AppDeps {
  store: Store;
  tokens: TokenService;
  hub: TenantBroadcaster;
  simulator?: Simulator | null;
  corsOrigins: string[];
  /** AI filters. Omit for keyword matching only. */
  ai?: AiOptions;
  /** Number of reverse-proxy hops to trust for the client IP (0 = none). */
  trustProxy?: number;
  /** Login attempts allowed per IP per window. */
  loginRateLimit?: { windowMs: number; limit: number };
}

/**
 * Builds the Express app WITHOUT calling listen(). Tests drive it with
 * supertest; pulse-server.ts adds the http.Server and the WebSocket server.
 */
export function createApp({
  store,
  tokens,
  hub,
  simulator = null,
  corsOrigins,
  loginRateLimit,
  trustProxy = 0,
  ai = { interpreter: null },
}: AppDeps): Express {
  const app = express();
  if (trustProxy > 0) app.set("trust proxy", trustProxy);

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    const cpu = process.cpuUsage();
    res.json({
      status: "ok",
      uptime: process.uptime(),
      // For the load test: CPU time used so far and resident memory.
      cpuMs: Math.round((cpu.user + cpu.system) / 1000),
      rssMB: Math.round(process.memoryUsage().rss / 1048576),
    });
  });

  const loginLimiter: RequestHandler = rateLimit({
    windowMs: loginRateLimit?.windowMs ?? 15 * 60 * 1000,
    limit: loginRateLimit?.limit ?? 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new HttpError("TOO_MANY_REQUESTS", "Too many login attempts, try again later")),
  });
  app.use("/api/auth", authRouter(store, tokens, loginLimiter));

  // Everything below requires a valid token. One line protects every route,
  // so a new router can't accidentally be left public.
  app.use("/api", authenticate(store, tokens));
  app.use("/api/events", eventsRouter(store));
  app.use("/api/live", liveRouter(store, simulator));
  app.use("/api/dashboards", dashboardsRouter(store, hub));
  app.use("/api/users", usersRouter(store));
  app.use("/api/ai", aiRouter(store, ai));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
