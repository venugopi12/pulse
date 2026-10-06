/**
 * Regenerates the README screenshots and GIF from the running app.
 *
 *   SEED_EVENTS=12000 npm run dev      # in one terminal
 *   npm run docs:media                 # in another (needs ffmpeg for the GIF)
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const OUT = new URL("../docs/media/", import.meta.url).pathname;
const API = process.env.API_URL ?? "http://localhost:4000";

interface Session {
  tenant: { id: string };
}

async function login(email: string): Promise<Session> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "pulse-demo-2026" }),
  });
  return (await res.json()) as Session;
}

/** A browser context already signed in to the given sessions, with a theme. */
async function context(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  sessions: Session[],
  opts: { theme?: "dark" | "light"; width?: number; height?: number; video?: boolean } = {},
): Promise<BrowserContext> {
  const width = opts.width ?? 1440;
  const height = opts.height ?? 900;
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: opts.video ? 1 : 2,
    ...(opts.video ? { recordVideo: { dir: `${OUT}.video`, size: { width, height } } } : {}),
  });
  await ctx.addInitScript(
    ({ sessions, theme }) => {
      const map = Object.fromEntries(sessions.map((s) => [s.tenant.id, s]));
      localStorage.setItem("pulse-session", JSON.stringify({ state: { sessions: map, activeTenantId: sessions[0]!.tenant.id }, version: 0 }));
      localStorage.setItem("pulse-ui", JSON.stringify({ state: { theme, sidebarCollapsed: false }, version: 0 }));
    },
    { sessions, theme: opts.theme ?? "dark" },
  );
  return ctx;
}

async function ready(page: Page, path = "/") {
  await page.goto(`${BASE}${path}`);
  await page.locator("main h1").waitFor({ timeout: 20_000 });
  // Let live data load and the entrance animations finish.
  await page.waitForTimeout(3500);
  await page.mouse.move(0, 0);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const admins = await Promise.all(["admin@acme.test", "admin@nova.test", "admin@orbit.test"].map(login));
  const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${OUT}${name}.png`, fullPage });

  // Dashboard, dark
  let ctx = await context(browser, admins);
  let page = await ctx.newPage();
  await ready(page);
  await shot(page, "dashboard-dark");

  // Command palette
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await page.waitForTimeout(400);
  await shot(page, "command-palette");
  await page.keyboard.press("Escape");

  // Edit mode
  await page.getByRole("button", { name: "Edit layout" }).click();
  await page.waitForTimeout(600);
  await shot(page, "edit-mode");
  await page.getByRole("button", { name: "Cancel" }).click();

  // Alerts: start an incident and wait for the first threshold to fire
  await page.getByRole("button", { name: "Simulate incident" }).click();
  await page.locator("header [aria-label^='Alerts,']").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(6000);
  await page.mouse.move(0, 0);
  await shot(page, "alerts");

  // Events page (virtualized)
  await ready(page, "/events");
  await shot(page, "events");
  await ctx.close();

  // Light theme, Nova
  ctx = await context(browser, [admins[1]!, admins[0]!, admins[2]!], { theme: "light" });
  page = await ctx.newPage();
  await ready(page);
  await shot(page, "dashboard-light");
  await ctx.close();

  // Mobile
  ctx = await context(browser, [admins[2]!], { width: 390, height: 844 });
  page = await ctx.newPage();
  await ready(page);
  await shot(page, "mobile");
  await ctx.close();

  // GIF: tenant switching (accent morph + crossfade + live numbers).
  // 12fps, 800px wide, 96 colours: keeps it around 2-3 MB for the README.
  ctx = await context(browser, admins, { video: true, width: 1280, height: 800 });
  page = await ctx.newPage();
  await ready(page);
  await page.waitForTimeout(1500);
  for (const name of ["Nova Retail", "Orbit Logistics", "Acme Health"]) {
    await page.getByRole("button", { name: /^Organization:/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole("menuitemradio", { name: new RegExp(name) }).click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(2200);
  }
  await ctx.close(); // flushes the video
  const videoDir = `${OUT}.video`;
  const webm = readdirSync(videoDir).find((f) => f.endsWith(".webm"));
  if (webm) {
    renameSync(`${videoDir}/${webm}`, `${OUT}tenant-switch.webm`);
    // Two-pass palette GIF: crisp colours at a reasonable size.
    execFileSync("ffmpeg", [
      "-y", "-ss", "3", "-i", `${OUT}tenant-switch.webm`,
      "-vf", "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
      `${OUT}tenant-switch.gif`,
    ], { stdio: "ignore" });
    rmSync(`${OUT}tenant-switch.webm`);
  }
  rmSync(videoDir, { recursive: true, force: true });
  await browser.close();
  console.log(`Saved to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
