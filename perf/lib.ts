/**
 * Shared helpers for the load tests: start the API server from source with
 * a given environment, wait for it, log in, and print tables.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";

export const ROOT = new URL("..", import.meta.url).pathname;
export const DEMO_PASSWORD = "pulse-demo-2026";
export const TENANT_ADMINS = ["admin@acme.test", "admin@nova.test", "admin@orbit.test"] as const;

export interface Running {
  proc: ChildProcess;
  stop(): Promise<void>;
}

/** Spawn a long-running command and resolve once `ready` appears in its output. */
export function start(cmd: string, args: string[], env: Record<string, string>, ready: RegExp, label: string): Promise<Running> {
  return new Promise((resolve, reject) => {
    // detached: the child leads its own process group, so stop() can signal
    // the whole group (npm/npx wrappers AND the real server underneath).
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        if (proc.pid) process.kill(-proc.pid, signal);
      } catch {
        // already gone
      }
    };
    let output = "";
    const timer = setTimeout(() => reject(new Error(`${label} did not start:\n${output}`)), 60_000);
    const onData = (d: Buffer) => {
      output += d.toString();
      if (ready.test(output)) {
        clearTimeout(timer);
        resolve({
          proc,
          stop: () =>
            new Promise((done) => {
              proc.once("exit", () => done());
              killGroup("SIGTERM");
              setTimeout(() => killGroup("SIGKILL"), 5000).unref();
            }),
        });
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${label} exited early (${code}):\n${output}`));
    });
    // If the load test itself crashes, don't leave servers behind.
    process.once("exit", () => killGroup("SIGKILL"));
  });
}

export interface ServerEnv {
  port: number;
  simRate: number;
  simTickMs: number;
  wsFlushMs: number;
  seedEvents: number;
  corsOrigin: string;
}

/** The real server (src/index.ts via tsx), production mode. */
export function startServer(e: ServerEnv): Promise<Running> {
  return start(
    "npx",
    ["tsx", "apps/server/src/index.ts"],
    {
      NODE_ENV: "production",
      JWT_SECRET: "load-test-secret-that-is-at-least-32-characters",
      PORT: String(e.port),
      SIM_RATE: String(e.simRate),
      SIM_TICK_MS: String(e.simTickMs),
      WS_FLUSH_MS: String(e.wsFlushMs),
      SEED_EVENTS: String(e.seedEvents),
      CORS_ORIGIN: e.corsOrigin,
    },
    /API \+ WebSocket on/,
    "server",
  );
}

export interface LoginResult {
  token: string;
  expiresAt: number;
  user: { id: string; tenantId: string; role: string; name: string; email: string };
  tenant: { id: string; name: string; slug: string; accent: string };
}

export async function login(baseUrl: string, email: string): Promise<LoginResult> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  return (await res.json()) as LoginResult;
}

export async function serverStats(baseUrl: string): Promise<{ cpuMs: number; rssMB: number }> {
  const res = await fetch(`${baseUrl}/api/health`);
  return (await res.json()) as { cpuMs: number; rssMB: number };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

/** Markdown table from rows of objects (column order = key order of the first row). */
export function table(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]!);
  const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
  return [line(cols), line(cols.map((_c, i) => (i === 0 ? "---" : "---:"))), ...rows.map((r) => line(cols.map((c) => r[c] ?? "")))].join("\n");
}

export function save(path: string, content: string) {
  writeFileSync(new URL(path, import.meta.url), content);
}
