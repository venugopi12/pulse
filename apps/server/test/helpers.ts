import {
  LoginResponseSchema,
  ServerMessageSchema,
  WS_PATH,
  wsProtocols,
  type AnalyticsEvent,
  type LoginResponse,
  type ServerMessage,
} from "@pulse/shared";
import request from "supertest";
import WebSocket from "ws";
import { createPulseServer, type PulseServerOptions } from "../src/pulse-server.js";
import { DEMO_PASSWORD } from "../src/seed-data.js";

export const TEST_SECRET = "test-secret-that-is-at-least-32-characters-long";
export const TEST_ORIGIN = "http://localhost:5173";

/** A fresh, fully-wired server per test file: own store, hub and tokens. */
export function buildTestServer(overrides: Partial<PulseServerOptions> = {}) {
  return createPulseServer({
    jwtSecret: TEST_SECRET,
    jwtExpiresIn: "1h",
    corsOrigins: [TEST_ORIGIN],
    seed: { now: Date.UTC(2026, 0, 15, 12), eventsPerTenant: 200, historyMinutes: 30 },
    loginRateLimit: { windowMs: 60_000, limit: 10_000 },
    ...overrides,
  });
}
export type TestServer = Awaited<ReturnType<typeof buildTestServer>>;

export async function loginAs(
  srv: TestServer,
  email: string,
): Promise<LoginResponse> {
  const res = await request(srv.app).post("/api/auth/login").send({ email, password: DEMO_PASSWORD });
  if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status}`);
  return LoginResponseSchema.parse(res.body);
}

/** Thin supertest wrapper that adds the bearer token. */
export function as(srv: TestServer, token: string) {
  const auth = { authorization: `Bearer ${token}` };
  return {
    get: (path: string) => request(srv.app).get(path).set(auth),
    put: (path: string, body: object) => request(srv.app).put(path).set(auth).send(body),
    post: (path: string, body: object) => request(srv.app).post(path).set(auth).send(body),
  };
}

// --- WebSocket helpers -------------------------------------------------------

export interface TestSocket {
  ws: WebSocket;
  messages: ServerMessage[];
  events(): AnalyticsEvent[];
  waitFor(predicate: () => boolean, timeoutMs?: number): Promise<void>;
  closed: Promise<{ code: number; reason: string }>;
}

/** Connect like the browser will, resolve once the server's `hello` arrives. */
export function connectWs(port: number, token: string, origin = TEST_ORIGIN): Promise<TestSocket> {
  const ws = new WebSocket(`ws://localhost:${port}${WS_PATH}`, wsProtocols(token), { origin });
  const messages: ServerMessage[] = [];
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() })),
  );

  const socket: TestSocket = {
    ws,
    messages,
    closed,
    events: () => messages.flatMap((m) => (m.type === "events" ? m.events : [])),
    waitFor: (predicate, timeoutMs = 2000) =>
      new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
          if (predicate()) return resolve();
          if (Date.now() - started > timeoutMs) return reject(new Error("waitFor timed out"));
          setTimeout(tick, 10);
        };
        tick();
      }),
  };

  return new Promise((resolve, reject) => {
    ws.on("message", (raw) => {
      const msg = ServerMessageSchema.parse(JSON.parse(raw.toString()));
      messages.push(msg);
      if (msg.type === "hello") resolve(socket);
    });
    ws.on("error", reject);
  });
}

/** Attempt a handshake that should fail; resolves with the HTTP status. */
export function rejectedStatus(
  port: number,
  protocols: string[],
  origin = TEST_ORIGIN,
  path = WS_PATH,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}${path}`, protocols, { origin });
    ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    ws.on("open", () => reject(new Error("handshake unexpectedly succeeded")));
    ws.on("error", () => undefined);
  });
}
