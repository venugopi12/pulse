import { DropdownMenu as DM } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;
export const DropdownMenuRadioGroup = DM.RadioGroup;

export function DropdownMenuContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={sideOffset}
        className={cn(
          "surface z-50 min-w-56 overflow-hidden rounded-[var(--radius-control)] p-1",
          "origin-[var(--radix-dropdown-menu-content-transform-origin)]",
          "data-[state=open]:animate-[menu-in_140ms_ease-out]",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

const itemClass =
  "relative flex cursor-default items-center gap-2 rounded-[6px] px-2 py-2 text-sm text-fg outline-none select-none " +
  "data-[highlighted]:bg-surface-3 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-fg-subtle";

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof DM.Item>) {
  return <DM.Item className={cn(itemClass, className)} {...props} />;
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof DM.RadioItem>) {
  return (
    <DM.RadioItem className={cn(itemClass, "pr-8", className)} {...props}>
      {children}
      <DM.ItemIndicator className="absolute right-2 size-1.5 rounded-full bg-accent" />
    </DM.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2 pt-2 pb-1 text-xs text-fg-subtle", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
