import { Menu, Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { MOD_LABEL } from "@/hooks/use-hotkey";
import { useEffect, useState } from "react";
import { useUiStore } from "@/stores/ui";
import { AlertsMenu } from "./alerts-menu";
import { LiveIndicator } from "./live-indicator";
import { TenantSwitcher } from "./tenant-switcher";
import { UserMenu } from "./user-menu";

export function TopBar() {
  const openCommand = useUiStore((s) => s.setCommandOpen);
  const openMobileNav = useUiStore((s) => s.setMobileNavOpen);
  const scrolled = useScrolled();

  return (
    <header
      data-scrolled={scrolled}
      className="topbar sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-4 md:gap-4 md:px-6"
    >
      <button
        className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-fg-muted hover:bg-surface-3 md:hidden"
        onClick={() => openMobileNav(true)}
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      <TenantSwitcher />

      <button
        onClick={() => openCommand(true)}
        className="ml-auto flex h-9 items-center gap-2 rounded-full border border-border bg-surface-1/60 px-3 text-sm text-fg-subtle shadow-[inset_0_1px_0_var(--highlight)] transition-colors hover:border-border-strong hover:text-fg-muted md:w-72"
        aria-label="Search and run commands"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 text-left md:inline">Search or jump to</span>
        <span className="hidden gap-1 md:flex">
          <Kbd>{MOD_LABEL}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      {/* Label hidden on small screens; still announced to screen readers. */}
      <span className="hidden sm:inline-flex">
        <LiveIndicator />
      </span>
      <span className="sm:hidden">
        <LiveIndicator showLabel={false} />
      </span>

      <AlertsMenu />
      <UserMenu />
    </header>
  );
}

/**
 * True once the page has scrolled at all. Drives the top bar's blur (see
 * `.topbar` in styles/index.css). A passive listener that only sets state
 * when the answer flips, so scrolling doesn't re-render the bar.
 */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const check = () => setScrolled(window.scrollY > 0);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);
  return scrolled;
}
