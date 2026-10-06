import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { initials } from "@/lib/format";
import { useSession, useSessionStore } from "@/stores/session";
import { useUiStore, type ThemePreference } from "@/stores/ui";

export function RoleBadge({ role }: { role: "admin" | "viewer" }) {
  return <Badge tone={role === "admin" ? "accent" : "neutral"}>{role === "admin" ? "Admin" : "Viewer"}</Badge>;
}

export function UserMenu() {
  const { user, tenant } = useSession();
  const signOut = useSessionStore((s) => s.signOut);
  const signOutAll = useSessionStore((s) => s.signOutAll);
  const sessionCount = useSessionStore((s) => Object.keys(s.sessions).length);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 items-center gap-2 rounded-full pr-1 pl-1 transition-colors hover:bg-surface-3 data-[state=open]:bg-surface-3 md:pr-3"
        aria-label={`Account: ${user.name}, ${user.role}`}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-fg">
          {initials(user.name)}
        </span>
        <span className="hidden md:inline">
          <RoleBadge role={user.role} />
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 pt-2 pb-3">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-fg-subtle">{user.email}</p>
          <p className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
            <RoleBadge role={user.role} />
            in {tenant.name}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> Match system
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut(tenant.id)}>
          <LogOut /> Sign out of {tenant.name}
        </DropdownMenuItem>
        {sessionCount > 1 && (
          <DropdownMenuItem onSelect={signOutAll}>
            <LogOut /> Sign out of all organizations
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
