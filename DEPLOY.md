# Deploying Pulse

Two ways to deploy, both from this repo:

| | Option A: one Vercel project (services) | Option B: Vercel + Render |
| --- | --- | --- |
| Web app | Vercel, `web` service | Vercel |
| API + WebSockets | Vercel, `pulse-api` container service | Render (or Fly.io / Railway) |
| Domains | One: `/api/*` and `/ws` route to the API | Two, cross-origin (`CORS_ORIGIN`) |
| API process | Auto-scaling Vercel Functions | One long-running server |
| Best for | Simplest setup, a demo link | Consistent live data under real traffic |

> Before deploying, commit `package-lock.json` (created by your first `npm install`). CI and Docker use
> `npm ci`, which needs it, so every deploy installs exactly the versions you tested.

## Option A: one Vercel project with services

The root `vercel.json` defines two services and the public routes:

```
Browser ──▶ pulse.vercel.app
              ├── /api/*  ──▶ pulse-api  (the root Dockerfile: Express + ws, runs as Vercel Functions)
              ├── /ws     ──▶ pulse-api  (WebSockets, Vercel Functions beta)
              └── /*      ──▶ web        (apps/web Vite build, every route serves index.html)
```

Services receive the original path, so the server's `/api` and `/ws` routes need no changes. The web
app uses same-origin URLs by default, so don't set `VITE_API_URL`/`VITE_WS_URL`. There are no service
bindings, because no service calls another server-side: the browser calls the API directly.

1. In Vercel: **Add New > Project**, import the repo, and leave **Root Directory** at the repo root (where
   `vercel.json` is).
2. **Environment variables** (Production and Preview):

   | Variable | Value |
   | --- | --- |
   | `PORT` | `4000`, **required**: Vercel sends container traffic to `$PORT` (default 80), and the server listens on 4000 as a non-root user |
   | `JWT_SECRET` | 32+ random characters, e.g. `openssl rand -hex 32` |
   | `TRUST_PROXY` | `1`, so the login rate limit sees real client IPs |
   | `ANTHROPIC_API_KEY` | optional, enables Claude for natural-language filters |

   `CORS_ORIGIN` isn't needed: the WebSocket handshake accepts any page served from the same host, which
   covers every preview URL automatically.
3. Deploy, then open the URL and run the smoke test below.

   Environment variables apply to **new** deployments only: after adding or changing one, redeploy
   (push a commit, or **Deployments > … > Redeploy**). Without `JWT_SECRET` the web app loads but every
   `/api` call returns `500 FUNCTION_INVOCATION_FAILED`, because the server refuses to start.

   Vercel installs dependencies **per service workspace**, not the root's. Each workspace must declare
   the tools its own scripts run (that's why `apps/web` lists `typescript` for its `tsc` build step). `/api/health` should return `{"status":"ok",…}`.

**What to know about Vercel Functions** (the API is built for one long-running process):
- **Each instance has its own in-memory store and simulator.** At demo traffic there's usually one
  instance, but under load Vercel may start more. A layout saved on one instance then doesn't reach
  viewers connected to another, and two tabs can show different numbers. Sharing state needs Redis
  (pub/sub for the hub, a store for dashboards), which is the production fix.
- **Instances scale to zero** after 5 idle minutes, which resets the seeded data, like Render's free tier.
- **WebSockets close at the function's max duration** (300 s on Hobby). The client reconnects with
  backoff and resyncs from a snapshot, so the live indicator blips to "Reconnecting" briefly.
- The simulator keeps the CPU busy while an instance is up, which counts as Active CPU time.

If any of that matters for your use, use Option B for the API.

## Option B: web on Vercel, API on Render

```
Browser ──HTTPS──▶ pulse.vercel.app (static app)
   │
   ├──HTTPS /api/*──▶ pulse-api.onrender.com  (REST, JWT in Authorization header)
   └──WSS   /ws ─────▶ pulse-api.onrender.com  (live events, JWT in Sec-WebSocket-Protocol)
```

The frontend calls the API cross-origin, so the server's `CORS_ORIGIN` must list the Vercel URL. The
same list is used for the WebSocket Origin check.

### 1. API server on Render

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
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated. Also the WebSocket Origin allowlist (same-host pages are always allowed). |
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

### 2. Web app on Vercel

1. In Vercel: **Add New > Project**, import the repo.
2. **Root Directory:** `apps/web`, **Framework:** Vite, **Output Directory:** `dist`. Vercel detects the
   npm workspace and installs from the repo root, so `@pulse/shared` resolves. (The root `vercel.json`
   is for Option A and isn't read when the root directory is `apps/web`.)
3. Add a rewrite so every route serves the app: in **Settings > Routing** (project-level routing rules),
   rewrite `/((?!assets/).*)` to `/index.html`.
4. **Environment variables** (Production and Preview):

   | Variable | Example |
   | --- | --- |
   | `VITE_API_URL` | `https://pulse-api.onrender.com` |
   | `VITE_WS_URL` | `wss://pulse-api.onrender.com/ws` |

   These are read at **build time** (Vite inlines them), so redeploy after changing them.
5. Deploy, then put the resulting URL in the server's `CORS_ORIGIN` if you hadn't already.

## Smoke test after deploying

- [ ] `/api/health` returns `ok`.
- [ ] Open the Vercel URL, click **Sign in to all three as admin**: dashboard loads, indicator shows **Live**.
- [ ] Switch tenant: the accent colour changes and the numbers change.
- [ ] Sign in as a viewer: "Edit layout" is disabled.
- [ ] DevTools > Network > WS: one connection to `/ws`, frames arriving every ~50ms.
- [ ] Type "errors in the last hour" in the filter bar: chips appear, the widgets show a funnel icon, and the label next to the input says "AI" if a key is set.
- [ ] Restart the Render service: the indicator goes amber ("Reconnecting in Ns"), then back to Live.

## CI

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
