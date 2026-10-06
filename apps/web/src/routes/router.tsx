import { createBrowserRouter } from "react-router";
import { AppShell } from "@/components/shell/app-shell";
import { BootFallback, RequireSession, Root } from "./root";

/**
 * Every page is lazy-loaded: `lazy()` returns a dynamic import, so each page
 * becomes its own JS chunk, fetched the first time you navigate to it.
 * The shell (sidebar, top bar) stays in the main bundle because every
 * signed-in page needs it.
 */
export const router = createBrowserRouter([
  {
    Component: Root,
    HydrateFallback: BootFallback,
    children: [
      { path: "login", lazy: async () => ({ Component: (await import("./login")).LoginPage }) },
      {
        Component: RequireSession,
        children: [
          {
            Component: AppShell,
            children: [
              { index: true, lazy: async () => ({ Component: (await import("./dashboard")).DashboardPage }) },
              { path: "events", lazy: async () => ({ Component: (await import("./events")).EventsPage }) },
              { path: "team", lazy: async () => ({ Component: (await import("./team")).TeamPage }) },
              { path: "design", lazy: async () => ({ Component: (await import("./design")).DesignPage }) },
            ],
          },
        ],
      },
      { path: "*", lazy: async () => ({ Component: (await import("./not-found")).NotFoundPage }) },
    ],
  },
]);
