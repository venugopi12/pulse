import { QueryCache, QueryClient } from "@tanstack/react-query";
import { getActiveSession, useSessionStore } from "@/stores/session";
import { ApiRequestError } from "./api";

/**
 * A 401 from any query means the active token is dead (expired, user removed,
 * secret rotated). Sign out of THAT tenant only; the route guard then sends
 * the user to the login screen or to another signed-in tenant.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 401) {
        const session = getActiveSession();
        if (session) useSessionStore.getState().signOut(session.tenant.id);
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Never retry auth/permission errors; retry flaky network once.
      retry: (count, error) =>
        !(error instanceof ApiRequestError && error.status < 500) && count < 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Every query key starts with the tenant. Two tenants can never share a
 * cache entry, and switching back to a tenant you've seen is instant.
 */
export const qk = {
  tenant: (tenantId: string) => ["tenant", tenantId] as const,
  dashboards: (tenantId: string) => ["tenant", tenantId, "dashboards"] as const,
  dashboard: (tenantId: string, id: string) => ["tenant", tenantId, "dashboard", id] as const,
  events: (tenantId: string) => ["tenant", tenantId, "events"] as const,
  users: (tenantId: string) => ["tenant", tenantId, "users"] as const,
};
