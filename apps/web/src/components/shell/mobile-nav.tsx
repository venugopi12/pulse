import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { useUiStore } from "@/stores/ui";
import { SidebarContent } from "./sidebar";
import { spring } from "@/lib/motion";

/** Below 768px the sidebar becomes a drawer that slides in (transform only). */
export function MobileNav() {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed inset-y-0 left-0 z-50 w-[272px] max-w-[85vw] border-r border-border bg-bg"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={spring.smooth}
              >
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Dialog.Close
                  className="absolute top-5 right-3 flex size-9 items-center justify-center rounded-[var(--radius-control)] text-fg-muted hover:bg-surface-3"
                  aria-label="Close navigation"
                >
                  <X className="size-5" />
                </Dialog.Close>
                <SidebarContent collapsed={false} onNavigate={() => setOpen(false)} />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
