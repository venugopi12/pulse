import { existsSync } from "node:fs";
import { z } from "zod";

// Load apps/server/.env if present, using Node's built-in loader (no dotenv dep).
if (existsSync(".env")) process.loadEnvFile(".env");

const DEV_SECRET = "dev-only-secret-do-not-use-in-production-0123456789";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  /** Simulated events per second, per tenant, at peak hours. 0 disables it. */
  SIM_RATE: z.coerce.number().min(0).max(5000).default(30),
  /** How often queued events are sent to WebSocket clients. */
  WS_FLUSH_MS: z.coerce.number().int().min(1).max(1000).default(50),
  /** Simulator tick. Smaller = smaller, more frequent bursts (used by the load test). */
  SIM_TICK_MS: z.coerce.number().int().min(5).max(1000).default(100),
  /**
   * Behind a host's load balancer (Render, Fly, Railway…), every request
   * arrives from the proxy's IP. Set this to the number of proxy hops (1) so
   * Express reads the real client IP from X-Forwarded-For, otherwise the
   * login rate limit would treat ALL users as one IP.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /** Enables AI filters. Without it, filters use keyword matching only. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Fast, inexpensive model for short structured extraction. */
  AI_MODEL: z.string().min(1).default("claude-haiku-4-5"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(12_000),
  /** Raw events seeded per tenant at startup (the load test uses 12000). */
  SEED_EVENTS: z.coerce.number().int().min(0).max(50_000).default(3000),
});

export interface Config {
  env: "development" | "test" | "production";
  port: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  /** CORS_ORIGIN may be a comma-separated list. Also used for the WS Origin check. */
  corsOrigins: string[];
  simRate: number;
  simTickMs: number;
  wsFlushMs: number;
  seedEvents: number;
  trustProxy: number;
  ai: { apiKey: string | null; model: string; timeoutMs: number };
}

/**
 * Validate environment variables once, at boot. A bad config should crash
 * immediately with a clear message — not surface as a weird bug at runtime.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);

  if (!parsed.JWT_SECRET && parsed.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  if (!parsed.JWT_SECRET && parsed.NODE_ENV === "development") {
    console.warn("[config] JWT_SECRET not set — using an insecure dev secret");
  }

  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    jwtSecret: parsed.JWT_SECRET ?? DEV_SECRET,
    jwtExpiresIn: parsed.JWT_EXPIRES_IN,
    corsOrigins: parsed.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
    simRate: parsed.SIM_RATE,
    simTickMs: parsed.SIM_TICK_MS,
    wsFlushMs: parsed.WS_FLUSH_MS,
    seedEvents: parsed.SEED_EVENTS,
    trustProxy: parsed.TRUST_PROXY,
    ai: { apiKey: parsed.ANTHROPIC_API_KEY ?? null, model: parsed.AI_MODEL, timeoutMs: parsed.AI_TIMEOUT_MS },
  };
}
