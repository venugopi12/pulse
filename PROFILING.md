# Profiling Pulse

How to see, and prove, where the rendering time goes.

## 1. Verify with React DevTools Profiler (by hand)

1. Install the **React Developer Tools** browser extension.
2. `npm run dev`, open http://localhost:5173 and sign in (e.g. "Sign in to all three as admin").
3. Open DevTools, then the **Profiler** tab. Click the gear icon and turn on
   **"Highlight updates when components render"** and **"Record why each component rendered"**.
4. Click **Record**, wait 5 seconds, click **Stop**.

What you should see on the dashboard:

- **About 10 commits per second** in the commit bar at the top (the naive version measures ~56).
  The 250ms buffer turns dozens of WebSocket frames per second into 4 store updates; the remaining
  commits are small follow-ups, like a KPI's trend tint or the once-a-second chart refresh.
- Click any commit. In the flamegraph, **only the KPIs whose number changed** are coloured; the line
  chart, bar chart, sidebar and top bar are grey ("did not render").
- Select a KPI: "Why did this render?" says **a hook changed**: its own `useLiveStore` selector
  returned a new number. A grey widget's selector returned the same value, so React skipped it.
- With highlight updates on, the page shows a flash only around the numbers that change.

Now compare with the naive version: open **http://localhost:5173/?perf=nobuffer,nomemo** and record
again. You'll see dozens of commits per second and every widget coloured in every commit.

> **Measure production, not dev.** React 19 in development diffs every changed prop to build its
> Performance-panel tracks. We hit this: passing a 10,000-item array to each virtualized row cost
> ~1 second per update in dev (and 0 in production). Rows now get a `getRow(index)` function instead.
> Use the dev Profiler to see *which* components render; use the production build for *how long*.

## 2. Automated numbers (what the README tables come from)

```bash
npx playwright install chromium   # once
npm run perf:browser              # 3 tenants at once in Chromium, ~4 minutes
npm run perf:ws                   # 300 WebSocket clients, ~1 minute
```

Results are written to `perf/results/` (Markdown + JSON).

`perf:browser` builds the **profiling** production bundle (`npm run build:profile -w @pulse/web`,
production React with the Profiler API switched on), starts the server at 100 events/sec per tenant
sent as ~100 tiny frames/sec, opens three tenants side by side, and runs each scenario with
different `?perf=` flags.

## 3. The switches

All optimizations can be turned OFF from the URL, so "before" and "after" are the same build:

| Flag | What it turns off |
| --- | --- |
| `?perf=nobuffer` | the 250ms buffer: one store update per WebSocket frame |
| `?perf=nomemo` | narrow selectors and `React.memo`: every widget subscribes to the whole live store |
| `?perf=novirtual` | react-window on the Events page: all rows in the DOM |
| `?perf=monitor` | turns ON the in-app monitor: `__perf.reset()`, then `__perf.snapshot()` in the console |

Combine with commas: `?perf=nobuffer,nomemo,monitor`. Flags persist for the tab (sessionStorage);
open the app without `?perf=` in a new tab to reset.

## 4. A/B testing a visual effect

To find out what a visual effect costs, switch it off with injected CSS and run just one scenario.
Nothing in the code changes, and partial runs never overwrite `perf/results/`:

```bash
npm run build:profile -w @pulse/web
PERF_ONLY=optimized PERF_CSS='.backdrop{background:none!important}' npm run perf:browser -- --skip-build
```

Run each variant two or three times (noise is about ±2 fps) with the dev server stopped, since it
competes for the same CPU. This is how the backdrop cost was found (see "Visual design" in the README).
