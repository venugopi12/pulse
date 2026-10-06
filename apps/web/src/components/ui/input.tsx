import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 text-sm text-fg",
        "placeholder:text-fg-subtle transition-colors hover:border-border-strong",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("grid gap-2 text-sm font-medium text-fg-muted", className)} {...props} />;
}

export function FieldError({ children }: { children?: string | undefined }) {
  if (!children) return null;
  return <span className="text-xs font-normal text-danger">{children}</span>;
}
