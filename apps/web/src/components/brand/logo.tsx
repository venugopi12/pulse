import { useReducedMotion } from "motion/react";
import { AnimateView } from "motion/react-animate-view";
import type { ReactElement } from "react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

/** The Pulse mark: a heartbeat trace drawn in the current tenant's accent. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <SharedMark>
      <LogoSvg className={className} />
    </SharedMark>
  );
}

/**
 * The login page and the sidebar both render the mark with the same view
 * name, so after signing in the big mark flies into the sidebar's corner
 * (an AnimateView "share" animation: position and size morph together).
 * It is the one moment in the app that connects two screens; everything
 * else stays quiet.
 */
function SharedMark({ children }: { children: ReactElement }) {
  const reduce = useReducedMotion();
  if (reduce) return children;
  return (
    <AnimateView name="pulse-logo" transition={{ layout: spring.smooth }}>
      {children}
    </AnimateView>
  );
}

function LogoSvg({ className }: { className?: string | undefined }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-surface-3" />
      <path
        d="M5 17h5l3-7 5 13 3-6h6"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark />
      <span
        className={cn(
          "text-[17px] font-semibold tracking-tight transition-opacity duration-200",
          collapsed && "pointer-events-none opacity-0",
        )}
      >
        Pulse
      </span>
    </span>
  );
}
