import type { Role } from "./auth.js";

/**
 * Everything a user can do, as `resource:action` strings.
 * Thresholds live inside widget config, so editing them is `dashboard:write`.
 */
export const PERMISSIONS = [
  "dashboard:read",
  "dashboard:write",
  "events:read",
  "users:read",
  "users:invite",
  /** Demo control: make the simulator spike errors for your own tenant. */
  "incidents:simulate",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * The single role → permission matrix. The server enforces it; the UI imports
 * the SAME table to hide/disable controls. They can't drift apart.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  viewer: ["dashboard:read", "events:read", "users:read"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
