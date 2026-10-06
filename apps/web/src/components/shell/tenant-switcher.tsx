import type { TenantId } from "@pulse/shared";
import { ChevronsUpDown, Plus } from "lucide-react";
import { useNavigate } from "react-router";
import { useShallow } from "zustand/react/shallow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { selectSessionList, useSession, useSessionStore } from "@/stores/session";
import { withViewTransition } from "@/lib/view-transition";

export function TenantDot({ color, className = "size-2.5" }: { color: string; className?: string }) {
  return <span aria-hidden className={`${className} shrink-0 rounded-full`} style={{ background: color }} />;
}

export function TenantSwitcher() {
  const active = useSession();
  // useShallow: re-render only if the list of sessions actually changes.
  const sessions = useSessionStore(useShallow(selectSessionList));
  const switchTenant = useSessionStore((s) => s.switchTenant);
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 min-w-0 items-center gap-2 rounded-[var(--radius-control)] px-2 text-sm font-medium transition-colors hover:bg-surface-3 data-[state=open]:bg-surface-3"
        aria-label={`Organization: ${active.tenant.name}. Switch organization`}
      >
        {/* var(--accent) here, not the tenant hex: it morphs with the rest of the UI. */}
        <TenantDot color="var(--accent)" />
        <span className="truncate">{active.tenant.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-fg-subtle" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Your organizations</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={active.tenant.id} onValueChange={(id) => withViewTransition("tenant", () => switchTenant(id as TenantId))}>
          {sessions.map((s) => (
            <DropdownMenuRadioItem key={s.tenant.id} value={s.tenant.id}>
              <TenantDot color={s.tenant.accent} />
              <span className="flex-1 truncate">{s.tenant.name}</span>
              <span className="text-xs text-fg-subtle capitalize">{s.user.role}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/login?add=1")}>
          <Plus />
          Sign in to another organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
