import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { FilterInterpreter } from "./ai/interpreter.js";
import { createApp } from "./app.js";
import { createTokenService } from "./auth/jwt.js";
import { createHub } from "./realtime/hub.js";
import { createIngest } from "./realtime/ingest.js";
import { attachRealtime } from "./realtime/ws-server.js";
import { seedStore, type SeedOptions, type SeedSummary } from "./seed.js";
import { TENANT_PROFILES } from "./seed-data.js";
import { createSimulator, type Simulator } from "./sim/simulator.js";
import { createMemoryStore } from "./store/memory.js";

export interface PulseServerOptions {
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  seed?: SeedOptions;
  loginRateLimit?: { windowMs: number; limit: number };
  heartbeatMs?: number;
  /** How often queued events are flushed to WebSocket clients. */
  wsFlushMs?: number;
  trustProxy?: number;
  /** AI filter interpreter (Claude in production, a fake in tests). */
  ai?: { interpreter: FilterInterpreter | null; timeoutMs?: number; perMinute?: number };
  /** Events/sec per tenant. Omit (tests) for no simulator. */
  simulatorRate?: number;
  simulatorTickMs?: number;
}

/**
 * Wires every piece together. index.ts uses it for the real server and the
 * tests use the exact same function — so tests exercise production wiring.
 */
export async function createPulseServer(opts: PulseServerOptions) {
  const store = createMemoryStore();
  const seedSummary: SeedSummary = await seedStore(store, {
    ...(opts.simulatorRate ? { ratePerTenant: opts.simulatorRate } : {}),
    ...opts.seed,
  });
  const tokens = createTokenService(opts.jwtSecret, opts.jwtExpiresIn);
  const hub = createHub();
  const pipeline = createIngest(store, hub, { flushMs: opts.wsFlushMs ?? 50 });

  let simulator: Simulator | null = null;
  if (opts.simulatorRate) {
    simulator = createSimulator({
      ratePerTenant: opts.simulatorRate,
      ...(opts.simulatorTickMs ? { tickMs: opts.simulatorTickMs } : {}),
      ingest: pipeline.ingest,
      tenants: store.tenants.list().map((t) => ({
        tenantId: t.id,
        slug: t.slug,
        kinds: TENANT_PROFILES.find((p) => p.id === t.id)?.events ?? [],
      })),
    });
  }

  const app = createApp({
    store,
    tokens,
    hub,
    simulator,
    corsOrigins: opts.corsOrigins,
    ...(opts.loginRateLimit ? { loginRateLimit: opts.loginRateLimit } : {}),
    ...(opts.trustProxy ? { trustProxy: opts.trustProxy } : {}),
    ...(opts.ai ? { ai: opts.ai } : {}),
  });
  const server: Server = createServer(app);
  const realtime = attachRealtime(server, {
    store,
    tokens,
    hub,
    allowedOrigins: opts.corsOrigins,
    ...(opts.heartbeatMs ? { heartbeatMs: opts.heartbeatMs } : {}),
  });

  return {
    store,
    tokens,
    hub,
    ingest: pipeline.ingest,
    flush: pipeline.flush,
    simulator,
    app,
    server,
    seedSummary,
    /** Resolves with the actual port (pass 0 for a random free port in tests). */
    listen(port: number): Promise<number> {
      return new Promise((resolve) => {
        server.listen(port, () => {
          simulator?.start();
          resolve((server.address() as AddressInfo).port);
        });
      });
    },
    async close(): Promise<void> {
      simulator?.stop();
      pipeline.stop();
      await realtime.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
export type PulseServer = Awaited<ReturnType<typeof createPulseServer>>;
