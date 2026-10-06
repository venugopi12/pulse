# Deploying Pulse

Two pieces, two hosts:

| Piece | Host | Why |
| --- | --- | --- |
| `apps/web` (static React build) | **Vercel** | Static files on a CDN, preview deploys per branch |
| `apps/server` (Express + WebSocket) | **Render** (or Fly.io / Railway) | Vercel functions can't hold long-lived WebSocket connections; Render web services can |

```
Browser ──HTTPS──▶ pulse.vercel.app (static app)
   │
   ├──HTTPS /api/*──▶ pulse-api.onrender.com  (REST, JWT in Authorization header)
   └──WSS   /ws ─────▶ pulse-api.onrender.com  (live events, JWT in Sec-WebSocket-Protocol)
```

The frontend calls the API cross-origin, so the server's `CORS_ORIGIN` must list the Vercel URL. The
same list is used for the WebSocket Origin check.

> Before deploying, commit `package-lock.json` (created by your first `npm install`). CI and Docker use
> `npm ci`, which needs it, so every deploy installs exactly the versions you tested.

## 1. API server on Render

1. Push the repo to GitHub.
2. In Render: **New > Blueprint**, pick the repo. Render reads `render.yaml` and creates the
   `pulse-api` web service from the `Dockerfile`.
3. When asked for `CORS_ORIGIN`, enter your future Vercel URL (you can change it later), e.g.
   `https://pulse.vercel.app`. Several origins can be comma-separated.
4. Deploy. Check `https://pulse-api.onrender.com/api/health` returns `{"status":"ok",…}`.

Environment variables (all validated at startup; a bad value stops the server with a clear message):

| Variable | Default | Notes |
| --- | --- | --- |
| `JWT_SECRET` | none, **required in production** | 32+ characters. The blueprint generates one. |
| `JWT_EXPIRES_IN` | `8h` | Sockets are closed when the token expires; the client signs out that tenant. |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated. Also the WebSocket Origin allowlist. |
| `TRUST_PROXY` | `0` | Set `1` behind Render/Fly/Railway so the login rate limit sees real client IPs. |
| `SIM_RATE` | `30` | Simulated events/sec per tenant at peak. `0` turns the simulator off. |
| `WS_FLUSH_MS` | `50` | WebSocket batching window (see the performance section in the README). |
| `ANTHROPIC_API_KEY` | none | Optional. Enables Claude for natural-language filters; without it they use keyword matching. Keep it secret: set it in the dashboard, never in the repo. |
| `AI_MODEL` | `claude-haiku-4-5` | Any model that supports structured outputs. |
| `AI_TIMEOUT_MS` | `12000` | After this, the request falls back to keyword matching. |
| `PORT` | `4000` | Render sets this for you. |

**Free-tier note:** Render's free web services sleep after inactivity; the first request wakes the
service (it takes a little while), and the data resets on restart because the store is in memory. The
client handles this: the live indicator shows "Reconnecting" with a countdown, then resyncs from a fresh
snapshot. A paid instance stays awake.

**Fly.io instead:** `fly launch` detects the Dockerfile. Set secrets with
`fly secrets set JWT_SECRET=$(openssl rand -hex 32) CORS_ORIGIN=https://pulse.vercel.app TRUST_PROXY=1`.
Fly supports WebSockets with no extra config.

## 2. Web app on Vercel

1. In Vercel: **Add New > Project**, import the repo.
2. **Root Directory:** `apps/web`. Vercel detects the npm workspace and installs from the repo root,
   so `@pulse/shared` resolves. `apps/web/vercel.json` sets the build command, output directory, and
   the single-page-app rewrite (every route serves `index.html`).
3. **Environment variables** (Production and Preview):

   | Variable | Example |
   | --- | --- |
   | `VITE_API_URL` | `https://pulse-api.onrender.com` |
   | `VITE_WS_URL` | `wss://pulse-api.onrender.com/ws` |

   These are read at **build time** (Vite inlines them), so redeploy after changing them.
4. Deploy, then put the resulting URL in the server's `CORS_ORIGIN` if you hadn't already.

## 3. Smoke test after deploying

- [ ] `/api/health` returns `ok`.
- [ ] Open the Vercel URL, click **Sign in to all three as admin**: dashboard loads, indicator shows **Live**.
- [ ] Switch tenant: the accent colour changes and the numbers change.
- [ ] Sign in as a viewer: "Edit layout" is disabled.
- [ ] DevTools > Network > WS: one connection to `/ws`, frames arriving every ~50ms.
- [ ] Type "errors in the last hour" in the filter bar: chips appear, the widgets show a funnel icon, and the label next to the input says "AI" if a key is set.
- [ ] Restart the Render service: the indicator goes amber ("Reconnecting in Ns"), then back to Live.

## 4. CI

`.github/workflows/ci.yml` runs on every push and pull request: typecheck, unit and integration tests,
build, then the Playwright end-to-end test against the real server and production web build. The
Playwright report is uploaded when a run fails.

## Before real customers

This is a portfolio project. For production you'd also want:

- A real database (Postgres) instead of the in-memory store, with row-level security as a second
  isolation layer behind the `tenantId` checks.
- Redis (or Postgres LISTEN/NOTIFY) between server instances, so the tenant rooms work across more than
  one instance, plus shared storage for the login rate limiter.
- Tokens in httpOnly cookies (with CSRF protection) instead of localStorage.
- Server-side alert evaluation, so alerts can notify by email or Slack when no one has the dashboard open.
