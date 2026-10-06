import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border bg-surface-1 px-1",
        "font-sans text-[11px] font-medium text-fg-subtle",
        className,
      )}
      {...props}
    />
  );
}
