import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end test against the REAL stack: the Express + WebSocket server
 * (with its event simulator) and the production web build served by
 * `vite preview`. Playwright starts both, on their own ports, so it doesn't
 * clash with `npm run dev`.
 *
 *   npx playwright install chromium   # once
 *   npm run e2e
 */
const API_PORT = 4400;
const WEB_PORT = 5199;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
      },
    },
  ],
  webServer: [
    {
      command: "npx tsx apps/server/src/index.ts",
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        NODE_ENV: "production",
        JWT_SECRET: "e2e-secret-that-is-at-least-32-characters-long",
        PORT: String(API_PORT),
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        SIM_RATE: "20",
        SEED_EVENTS: "500",
      },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run build -w @pulse/web && npm run preview -w @pulse/web -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { PULSE_API_URL: `http://localhost:${API_PORT}` },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
