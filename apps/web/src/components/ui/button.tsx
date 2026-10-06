import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * shadcn-style button: variants live in one cva() table, so every button in
 * the app comes from the same small set of decisions.
 * Pressed state = scale(0.98): a compositor-only property, so it never triggers layout.
 */
export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)]",
    "text-sm font-medium select-none",
    "transition-[scale,background-color,border-color,color] duration-150 ease-out",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        // Accent fill with depth: a lighter top edge, an inner highlight and a
        // soft glow in the same hue. Hover only brightens (no layout change).
        primary:
          "bg-[linear-gradient(180deg,color-mix(in_oklch,var(--accent),#fff_14%),var(--accent))] text-accent-contrast shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_6px_20px_-8px_var(--accent)] hover:brightness-110",
        secondary:
          "border border-border bg-surface-2/80 text-fg shadow-[inset_0_1px_0_var(--highlight)] hover:border-border-strong hover:bg-surface-3",
        ghost: "text-fg-muted hover:bg-surface-3 hover:text-fg",
        danger: "border border-border bg-surface-2 text-danger hover:border-danger/50",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a <Link>) with button styles. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
