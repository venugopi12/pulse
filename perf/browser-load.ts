/**
 * Browser load test: before/after numbers for the client-side optimizations.
 *
 *   npm run perf:browser            (builds the profiling bundle first)
 *   npm run perf:browser -- --skip-build
 *
 * Setup: the real server at a high event rate (default 100 events/sec per
 * tenant at peak, sent as ~100 tiny WebSocket frames/sec per tenant), and THREE
 * tenants open at the same time in one Chromium, each on its own dashboard.
 * Every scenario runs the SAME production build; only ?perf= flags change.
 *
 * A/B a visual effect without touching the code: inject CSS that switches it
 * off and run one scenario (results are printed, not saved):
 *   PERF_ONLY=optimized PERF_CSS='.backdrop{background:none!important}' npm run perf:browser -- --skip-build
 *
 * Needs Chromium for Playwright: `npx playwright install chromium`
 * (or point PW_CHROMIUM at an existing Chromium binary).
 */
import { chromium, type Browser } from "@playwright/test";
import { spawnSync } from "node:child_process";
import {
  ROOT,
  TENANT_ADMINS,
  login,
  save,
  sleep,
  start,
  startServer,
  table,
  type LoginResult,
} from "./lib.js";

const API_PORT = 4300;
const WEB_PORT = 4373;
const API = `http://localhost:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const SIM_RATE = Number(process.env.SIM_RATE ?? 100);
const MEASURE_MS = Number(process.env.MEASURE_MS ?? 15_000);
const WARMUP_MS = 3_000;

interface Scenario {
  name: string;
  path: "/" | "/events";
  flags: string;
}

const SCENARIOS: Scenario[] = [
  { name: "Dashboard: naive (no buffer, no memo)", path: "/", flags: "nobuffer,nomemo" },
  { name: "Dashboard: + 250ms buffer only", path: "/", flags: "nomemo" },
  { name: "Dashboard: + selectors/memo only", path: "/", flags: "nobuffer" },
  { name: "Dashboard: optimized (both)", path: "/", flags: "" },
  { name: "Events 10k: not virtualized", path: "/events", flags: "novirtual" },
  { name: "Events 10k: virtualized", path: "/events", flags: "" },
];

interface Snapshot {
  seconds: number;
  commits: Record<string, { commits: number; ms: number }>;
  fps: number;
  p95FrameMs: number;
  slowFrames: number;
  longTasks: number;
  longTaskMs: number;
  domNodes: number;
  heapMB: number | null;
}

async function runScenario(browser: Browser, s: Scenario, sessions: LoginResult[]): Promise<Snapshot[]> {
  // One context per tenant = three independent "users" in parallel.
  const pages = await Promise.all(
    sessions.map(async (session) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript((sess) => {
        localStorage.setItem(
          "pulse-session",
          JSON.stringify({ state: { sessions: { [sess.tenant.id]: sess }, activeTenantId: sess.tenant.id }, version: 0 }),
        );
      }, session);
      if (process.env.PERF_CSS) {
        await ctx.addInitScript((css) => {
          document.addEventListener("DOMContentLoaded", () => {
            const el = document.createElement("style");
            el.textContent = css;
            document.head.appendChild(el);
          });
        }, process.env.PERF_CSS);
      }
      const page = await ctx.newPage();
      await page.goto(`${WEB}${s.path}?perf=${[s.flags, "monitor"].filter(Boolean).join(",")}`);
      return page;
    }),
  );

  // Wait until live: hydrated, and on the Events page, 10k+ rows loaded.
  await Promise.all(
    pages.map((p) =>
      p.waitForFunction(
        (needRows) => {
          const live = (window as unknown as { __pulse?: { live: { getState(): { hydrated: boolean; feed: unknown[] } } } }).__pulse?.live.getState();
          return Boolean(live?.hydrated && live.feed.length >= needRows);
        },
        s.path === "/events" ? 10_000 : 0,
        { timeout: 60_000, polling: 250 },
      ),
    ),
  );

  await sleep(WARMUP_MS);
  await Promise.all(pages.map((p) => p.evaluate(() => (window as unknown as { __perf: { reset(): void } }).__perf.reset())));
  await sleep(MEASURE_MS);
  const snaps = await Promise.all(
    pages.map((p) => p.evaluate(() => (window as unknown as { __perf: { snapshot(): unknown } }).__perf.snapshot())),
  );
  await Promise.all(pages.map((p) => p.context().close()));
  return snaps as Snapshot[];
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r1 = (n: number) => Math.round(n * 10) / 10;

function summarize(s: Scenario, snaps: Snapshot[]) {
  const per = snaps.map((x) => {
    const widget = Object.entries(x.commits).filter(([id]) => id.startsWith("widget:"));
    const page = x.commits.page ?? { commits: 0, ms: 0 };
    return {
      pageCommitsPerSec: page.commits / x.seconds,
      widgetRendersPerSec: widget.reduce((sum, [, c]) => sum + c.commits, 0) / x.seconds,
      renderMsPerSec: page.ms / x.seconds,
      fps: x.fps,
      p95: x.p95FrameMs,
      longTaskMs: x.longTaskMs / x.seconds,
      dom: x.domNodes,
      heap: x.heapMB ?? 0,
    };
  });
  return {
    Scenario: s.name,
    "React commits/s": r1(avg(per.map((p) => p.pageCommitsPerSec))),
    "Widget renders/s": s.path === "/" ? r1(avg(per.map((p) => p.widgetRendersPerSec))) : "–",
    "Render ms/s": r1(avg(per.map((p) => p.renderMsPerSec))),
    FPS: r1(avg(per.map((p) => p.fps))),
    "p95 frame ms": r1(avg(per.map((p) => p.p95))),
    "Long tasks ms/s": r1(avg(per.map((p) => p.longTaskMs))),
    "DOM nodes": Math.round(avg(per.map((p) => p.dom))),
    "JS heap MB": r1(avg(per.map((p) => p.heap))),
  };
}

async function main() {
  if (!process.argv.includes("--skip-build")) {
    console.log("Building the profiling bundle…");
    const b = spawnSync("npm", ["run", "build:profile", "-w", "@pulse/web"], { cwd: ROOT, stdio: "inherit" });
    if (b.status !== 0) process.exit(1);
  }

  console.log(`Starting server: ${SIM_RATE} events/sec/tenant at peak, 10ms sim ticks, 1ms WS flush…`);
  const server = await startServer({
    port: API_PORT,
    simRate: SIM_RATE,
    simTickMs: 10,
    wsFlushMs: 1, // many tiny frames: worst case for the client
    seedEvents: 12_000,
    corsOrigin: WEB,
  });
  const web = await start(
    "npm",
    ["run", "preview:profile", "-w", "@pulse/web", "--", "--port", String(WEB_PORT), "--strictPort"],
    { PULSE_API_URL: API },
    /localhost:\d+/,
    "vite preview",
  );

  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const rows: Record<string, string | number>[] = [];
  try {
    for (const s of SCENARIOS.filter((x) => x.name.includes(process.env.PERF_ONLY ?? ""))) {
      // Fresh tokens per scenario (cheap) so nothing carries over between runs.
      const sessions = await Promise.all(TENANT_ADMINS.map((email) => login(API, email)));
      process.stdout.write(`• ${s.name} … `);
      const snaps = await runScenario(browser, s, sessions);
      const row = summarize(s, snaps);
      rows.push(row);
      console.log(`${row.FPS} fps, ${row["React commits/s"]} commits/s`);
    }
  } finally {
    await browser.close();
    await web.stop();
    await server.stop();
  }

  const md = `# Browser load test

Three tenants open at once (one Chromium context each), ${SIM_RATE} events/sec/tenant at peak
(~${Math.round(SIM_RATE * 3 * 0.8)}–${SIM_RATE * 3} events/sec total), delivered as ~100 small WebSocket frames
per second per tenant. Production build with the Profiler API enabled (\`build:profile\`).
${MEASURE_MS / 1000}s measured per scenario after ${WARMUP_MS / 1000}s warm-up; values are the mean of the three tabs.

${table(rows)}

- **React commits/s**: React render passes that touched the page (the "commits" bar in React DevTools' Profiler).
- **Widget renders/s**: renders of individual widget bodies, summed across the dashboard.
- **Render ms/s**: main-thread time React spent rendering, per second.
- **Long tasks ms/s**: time the main thread was blocked in chunks over 50ms.

Run on: ${process.platform} ${process.arch}, Node ${process.version}, ${new Date().toISOString().slice(0, 16)}Z
`;
  // Partial or experimental runs never overwrite the published results.
  if (!process.env.PERF_ONLY && !process.env.PERF_CSS) {
    save("./results/browser.md", md);
    save("./results/browser.json", JSON.stringify(rows, null, 2));
  }
  console.log("\n" + md);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
