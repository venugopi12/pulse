import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";

/** One-line tooltip. Wrap the app once in <TooltipProvider>. */
export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <T.Provider delayDuration={300}>{children}</T.Provider>
);

export function Tooltip({
  content,
  side = "bottom",
  children,
}: {
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={8}
          className="z-50 rounded-[var(--radius-chip)] border border-border bg-surface-3 px-2 py-1 text-xs text-fg"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
