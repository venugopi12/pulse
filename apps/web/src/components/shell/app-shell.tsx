import { Outlet } from "react-router";
import { useAlertEngine } from "@/features/alerts/use-alert-engine";
import { Backdrop } from "@/components/brand/backdrop";
import { Measure } from "@/perf/monitor";
import { useRealtime } from "@/realtime/use-realtime";
import { useSession } from "@/stores/session";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { PageTransition } from "./page-transition";
import { DesktopSidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/**
 * The authenticated frame: sidebar + top bar + page.
 *
 * The page is keyed by tenant id, so switching tenant remounts it. The switch
 * itself is a view transition (lib/view-transition.ts): the old tenant's
 * page crossfades into the new one with no blank frame in between, while the
 * accent colour morphs in CSS. Because every query key starts with the
 * tenant id, the new tenant renders its own cache or its own skeletons,
 * never the previous tenant's data.
 *
 * Changing page inside a tenant is a fade-through (page-transition.tsx).
 */
export function AppShell() {
  const { tenant } = useSession();
  // One live connection for the active tenant, for as long as the shell is mounted.
  useRealtime();
  // Threshold alerts run here too, so they fire on every page.
  useAlertEngine();

  return (
    <div className="relative isolate flex min-h-dvh">
      <Backdrop />
      <a
        href="#main"
        className="sr-only z-50 rounded-[var(--radius-control)] bg-surface-1 px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Measure id="sidebar">
        <DesktopSidebar />
      </Measure>
      <MobileNav />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Measure id="topbar">
          <TopBar />
        </Measure>
        <main id="main" className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div key={tenant.id} className="mx-auto w-full max-w-[1400px]">
            <PageTransition>
              <Measure id="page">
                <Outlet />
              </Measure>
            </PageTransition>
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
