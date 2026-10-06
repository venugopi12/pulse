import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";

/** Small modal dialog: Radix handles focus trap, Escape and aria; CSS scales it in. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-[menu-in_140ms_ease-out]" />
        <D.Content
          className="surface fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] p-6 data-[state=open]:animate-[menu-in_160ms_ease-out]"
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <D.Title className="text-[17px] font-semibold">{title}</D.Title>
          {description && <D.Description className="mt-1 text-sm text-fg-muted">{description}</D.Description>}
          <div className="mt-5">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
