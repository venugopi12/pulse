import {
  ApiErrorSchema,
  DashboardListResponseSchema,
  DashboardSchema,
  EventsResponseSchema,
  InviteSchema,
  LiveSnapshotSchema,
  LoginResponseSchema,
  MeResponseSchema,
  UserListResponseSchema,
  type DashboardId,
  type EventsQuery,
  type InviteRequest,
  type LoginRequest,
  type UpdateDashboardRequest,
} from "@pulse/shared";
import { z } from "zod";

/**
 * Where the API lives. Empty (default) = same origin: /api is proxied by
 * Vite in dev, or by a reverse proxy / Vercel rewrite in production.
 * Set VITE_API_URL (e.g. https://pulse-api.onrender.com) to call it directly.
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/** Thrown for any non-2xx response; carries the server's error code. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * Typed fetch: every response body is validated with the SAME Zod schema the
 * server uses. If the server ever drifts from the contract, we get a clear
 * error at the boundary instead of `undefined` deep inside a component.
 */
async function request<S extends z.ZodType>(
  schema: S,
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<z.infer<S>> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(json);
    if (parsed.success) {
      throw new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message);
    }
    throw new ApiRequestError(res.status, "UNKNOWN", `Request failed (${res.status})`);
  }
  return schema.parse(json);
}

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};

export const api = {
  login: (body: LoginRequest) =>
    request(LoginResponseSchema, "/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: (token: string) => request(MeResponseSchema, "/auth/me", { token }),

  dashboards: (token: string) => request(DashboardListResponseSchema, "/dashboards", { token }),
  dashboard: (token: string, id: DashboardId) => request(DashboardSchema, `/dashboards/${id}`, { token }),

  events: (token: string, query: Partial<EventsQuery> = {}) =>
    request(EventsResponseSchema, `/events${qs(query)}`, { token }),

  liveSnapshot: (token: string, minutes: number) =>
    request(LiveSnapshotSchema, `/live/snapshot${qs({ minutes, recent: 200 })}`, { token }),

  simulateIncident: (token: string, durationSeconds: number) =>
    request(z.object({ endsAt: z.number() }), "/live/incident", {
      method: "POST",
      body: JSON.stringify({ durationSeconds }),
      token,
    }),
  saveDashboard: (token: string, id: DashboardId, body: UpdateDashboardRequest) =>
    request(DashboardSchema, `/dashboards/${id}`, { method: "PUT", body: JSON.stringify(body), token }),

  aiStatus: (token: string) =>
    request(z.object({ mode: z.enum(["ai", "rules"]), model: z.string().nullable() }), "/ai/status", { token }),

  users: (token: string) => request(UserListResponseSchema, "/users", { token }),
  invite: (token: string, body: InviteRequest) =>
    request(InviteSchema, "/users/invites", { method: "POST", body: JSON.stringify(body), token }),
};
