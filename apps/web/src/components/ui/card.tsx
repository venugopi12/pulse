import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends ComponentProps<"div"> {
  /** Lifts 2px on hover. Use for cards that respond to the pointer. */
  interactive?: boolean;
}

export function Card({ className, interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "surface rounded-[var(--radius-card)]",
        interactive &&
          "transition-[translate,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-between gap-2 px-4 pt-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("truncate text-sm font-medium text-fg-muted", className)} {...props} />;
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-4 pt-3 pb-4", className)} {...props} />;
}
