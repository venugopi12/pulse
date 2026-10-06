import { Navigate, Outlet, useLocation } from "react-router";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDocumentTheme } from "@/hooks/use-document-theme";
import { useActiveSession } from "@/stores/session";
import { useUiStore } from "@/stores/ui";

/** Top of the tree: keeps <html> theme/accent in sync, hosts toasts. */
export function Root() {
  useDocumentTheme();
  const theme = useUiStore((s) => s.theme);
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster
        theme={theme}
        position="bottom-right"
        toastOptions={{
          className: "!bg-surface-2 !border-border !text-fg !rounded-[var(--radius-control)]",
        }}
      />
    </TooltipProvider>
  );
}

/** Route guard: no active session means "go sign in", remembering where to. */
export function RequireSession() {
  const session = useActiveSession();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Shown while the first lazy route chunk loads. Same background, no flash. */
export function BootFallback() {
  return <div className="min-h-dvh bg-bg" />;
}
