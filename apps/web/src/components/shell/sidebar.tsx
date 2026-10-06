import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { motion } from "motion/react";
import { NavLink } from "react-router";
import { Logo } from "@/components/brand/logo";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/ui";
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "./nav";
import { spring } from "@/lib/motion";

/**
 * Sidebar content, shared by the desktop rail and the mobile drawer.
 * `collapsed` shows icons only (desktop rail at 64px).
 */
export function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-3">
      <div className="flex h-12 items-center px-1">
        <Logo collapsed={collapsed} />
      </div>
      <p
        aria-hidden
        className={cn(
          "mt-5 mb-1 px-3 text-[11px] font-semibold tracking-[0.08em] text-fg-subtle uppercase transition-opacity duration-150",
          collapsed && "opacity-0",
        )}
      >
        Workspace
      </p>
      <ul className="flex flex-col gap-1">
        {PRIMARY_NAV.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </ul>
      <ul className="mt-auto flex flex-col gap-1">
        {SECONDARY_NAV.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </ul>
    </nav>
  );
}

function SidebarLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const link = (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "relative flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm font-medium transition-colors",
          isActive ? "text-fg" : "text-fg-muted hover:bg-surface-3/60 hover:text-fg",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            // layoutId: Motion moves ONE highlight element between links using
            // transforms (FLIP), instead of fading one out and another in.
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 rounded-[var(--radius-control)] bg-gradient-to-r from-accent-soft to-transparent ring-1 ring-[color-mix(in_oklch,var(--accent)_22%,transparent)] ring-inset"
              transition={spring.snappy}
            >
              <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
            </motion.span>
          )}
          <item.icon className={cn("relative size-[18px] shrink-0", isActive && "text-accent-fg")} />
          <span className={cn("relative truncate transition-opacity duration-150", collapsed && "opacity-0")}>
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );

  // The tooltip wraps a span, not the NavLink itself: Radix's asChild merges
  // className as a string, which would clobber NavLink's className FUNCTION.
  return (
    <li>
      {collapsed ? (
        <Tooltip content={item.label} side="right">
          <span className="block">{link}</span>
        </Tooltip>
      ) : (
        link
      )}
    </li>
  );
}

/** Desktop sidebar: a rail that collapses between 232px and 64px. */
export function DesktopSidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      // Width is the one layout property we animate here. It's user-triggered,
      // 200ms, and nothing else is moving at the same time; live widgets
      // stick to transform/opacity.
      className={cn(
        "glass-tint sticky top-0 z-20 hidden h-dvh shrink-0 flex-col border-r md:flex",
        "overflow-hidden transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-[232px]",
      )}
    >
      <SidebarContent collapsed={collapsed} />
      <div className="p-3 pt-0">
        <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
          <button
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="flex h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
