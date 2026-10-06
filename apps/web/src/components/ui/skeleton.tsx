import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Placeholder block with a transform-based shimmer (see .skeleton in CSS). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("skeleton", className)} {...props} />;
}
