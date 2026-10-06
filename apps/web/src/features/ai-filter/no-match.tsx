import { Funnel } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Shown instead of a value when the active filter can't apply to a widget
 * (e.g. "errors" on an orders counter). A plain 0 would read like an outage.
 */
export function NoMatch({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-sm text-fg-subtle", className)}>
      <Funnel aria-hidden className="size-4" />
      No events match this filter
    </p>
  );
}
