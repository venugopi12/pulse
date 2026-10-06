import { Activity, LayoutGrid, Palette, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown in ⌘K to make items findable by other words. */
  keywords?: string[];
}

/** Single source for sidebar AND command palette, so they never disagree. */
export const PRIMARY_NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutGrid, keywords: ["dashboard", "home", "kpi"] },
  { to: "/events", label: "Events", icon: Activity, keywords: ["log", "feed", "stream"] },
  { to: "/team", label: "Team", icon: Users, keywords: ["users", "members", "invite"] },
];

export const SECONDARY_NAV: NavItem[] = [
  { to: "/design", label: "Design system", icon: Palette, keywords: ["tokens", "components", "theme"] },
];
