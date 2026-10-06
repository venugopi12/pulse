import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A pill with a highlight that sweeps across it every few seconds.
 * Inspired by Magic UI's "Animated Shiny Text" (21st.dev), which animates
 * background-position (a repaint per frame). Here the highlight is its own
 * element moved with transform. Reduced motion: no sweep.
 */
export function ShinyBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-border bg-surface-1/70 px-3 py-1 text-xs font-medium text-fg-muted backdrop-blur",
        className,
      )}
    >
      {children}
      <span
        aria-hidden
        className="shiny-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-[color-mix(in_oklch,var(--fg)_14%,transparent)] to-transparent"
      />
    </span>
  );
}
