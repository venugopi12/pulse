import { can, type Permission } from "@pulse/shared";
import { useActiveSession } from "@/stores/session";

/**
 * UI permission check using the SAME matrix the server enforces.
 * This only decides what to show; the server is still the authority.
 */
export function useCan(permission: Permission): boolean {
  const role = useActiveSession()?.user.role;
  return role ? can(role, permission) : false;
}
