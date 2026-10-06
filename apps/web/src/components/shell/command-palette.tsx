import type { TenantId } from "@pulse/shared";
import { Command } from "cmdk";
import { LayoutGrid, LogOut, Monitor, Moon, PanelLeft, Plus, Sparkles, Sun, UserPlus, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { Kbd } from "@/components/ui/kbd";
import { useFilterStore } from "@/features/ai-filter/store";
import { useSimulateIncident } from "@/features/dashboard/use-simulate-incident";
import { useCan } from "@/hooks/use-can";
import { useModHotkey } from "@/hooks/use-hotkey";
import { selectSessionList, useSession, useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";
import { PRIMARY_NAV, SECONDARY_NAV } from "./nav";
import { TenantDot } from "./tenant-switcher";
import { fade, spring } from "@/lib/motion";
import { withViewTransition } from "@/lib/view-transition";

/**
 * ⌘K palette. cmdk gives fuzzy filtering + full keyboard navigation; Radix
 * Dialog gives focus trapping, Escape and aria; Motion gives the scale-in.
 * Commands are built from the same nav config and the same `useCan()` check
 * as the rest of the UI, so viewers never see admin actions here either.
 */
/**
 * Set by an action that wants focus somewhere specific after the palette
 * closes. Radix normally returns focus to what had it before opening, once
 * the exit animation ends; onCloseAutoFocus lets us take over instead of
 * racing it with a timer.
 */
let focusFilterOnClose = false;

export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  useModHotkey("k", () => setOpen(!useUiStore.getState().commandOpen));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fade}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-describedby={undefined}
              onCloseAutoFocus={(e) => {
                if (!focusFilterOnClose) return;
                focusFilterOnClose = false;
                e.preventDefault();
                useFilterStore.getState().requestFocus();
              }}
            >
              <motion.div
                className="fixed top-[12vh] left-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={spring.snappy}
              >
                <Dialog.Title className="sr-only">Command palette</Dialog.Title>
                <Palette close={() => setOpen(false)} />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Palette({ close }: { close: () => void }) {
  const navigate = useNavigate();
  const active = useSession();
  const sessions = useSessionStore(useShallow(selectSessionList));
  const switchTenant = useSessionStore((s) => s.switchTenant);
  const signOut = useSessionStore((s) => s.signOut);
  const setTheme = useUiStore((s) => s.setTheme);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const canInvite = useCan("users:invite");
  const canEdit = useCan("dashboard:write");
  const canSimulate = useCan("incidents:simulate");
  const simulate = useSimulateIncident();

  /** Close first, then act — so focus returns to the page before navigating. */
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <Command
      label="Command palette"
      loop
      className="surface overflow-hidden rounded-[var(--radius-card)] shadow-[0_24px_80px_-20px_var(--accent-glow)]"
    >
      <Command.Input
        autoFocus
        placeholder="Type a command or search"
        className="h-14 w-full border-b border-border bg-transparent px-4 text-[15px] text-fg outline-none placeholder:text-fg-subtle focus-visible:shadow-none focus-visible:outline-none"
      />
      <Command.List className="max-h-[min(400px,60vh)] overflow-y-auto overscroll-contain p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-fg-subtle">
          No matching commands
        </Command.Empty>

        <Group heading="Go to">
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => (
            <Item
              key={item.to}
              value={`go ${item.label}`}
              keywords={item.keywords}
              onSelect={run(() => navigate(item.to))}
            >
              <item.icon /> {item.label}
            </Item>
          ))}
        </Group>

        <Group heading="Organizations">
          {sessions
            .filter((s) => s.tenant.id !== active.tenant.id)
            .map((s) => (
              <Item
                key={s.tenant.id}
                value={`switch ${s.tenant.name}`}
                keywords={["tenant", "organization", "switch"]}
                onSelect={run(() => withViewTransition("tenant", () => switchTenant(s.tenant.id as TenantId)))}
              >
                <TenantDot color={s.tenant.accent} /> Switch to {s.tenant.name}
              </Item>
            ))}
          <Item value="sign in another organization" onSelect={run(() => navigate("/login?add=1"))}>
            <Plus /> Sign in to another organization
          </Item>
        </Group>

        <Group heading="Actions">
          <Item
            value="filter with ai"
            keywords={["plain english", "search", "natural language", "errors", "ask"]}
            onSelect={run(() => {
              if (!/^\/(events)?$/.test(window.location.pathname)) navigate("/");
              focusFilterOnClose = true;
            })}
          >
            <Sparkles /> Filter in plain English
          </Item>
          {canEdit && (
            <Item value="edit dashboard layout" keywords={["widgets", "reorder", "thresholds"]} onSelect={run(() => navigate("/?edit=1"))}>
              <LayoutGrid /> Edit dashboard layout
            </Item>
          )}
          {canSimulate && (
            <Item value="simulate incident" keywords={["alert", "test", "demo"]} onSelect={run(() => simulate.mutate())}>
              <Zap /> Simulate an incident
            </Item>
          )}
          {canInvite && (
            <Item value="invite teammate" keywords={["user", "add"]} onSelect={run(() => navigate("/team?invite=1"))}>
              <UserPlus /> Invite a teammate
            </Item>
          )}
          <Item value="toggle sidebar" onSelect={run(toggleSidebar)}>
            <PanelLeft /> Collapse or expand sidebar
          </Item>
          <Item value="theme dark" onSelect={run(() => setTheme("dark"))}>
            <Moon /> Use dark theme
          </Item>
          <Item value="theme light" onSelect={run(() => setTheme("light"))}>
            <Sun /> Use light theme
          </Item>
          <Item value="theme system" onSelect={run(() => setTheme("system"))}>
            <Monitor /> Match system theme
          </Item>
          <Item value={`sign out ${active.tenant.name}`} onSelect={run(() => signOut(active.tenant.id))}>
            <LogOut /> Sign out of {active.tenant.name}
          </Item>
        </Group>
      </Command.List>
      <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-fg-subtle">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to move
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> to run
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>esc</Kbd> to close
        </span>
      </div>
    </Command>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-subtle"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  children,
  value,
  keywords,
  onSelect,
}: {
  children: ReactNode;
  value: string;
  keywords?: string[] | undefined;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      {...(keywords ? { keywords } : {})}
      onSelect={onSelect}
      className="flex h-10 cursor-default items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm text-fg-muted select-none data-[selected=true]:bg-surface-3 data-[selected=true]:text-fg [&_svg]:size-4 [&_svg]:shrink-0"
    >
      {children}
    </Command.Item>
  );
}
