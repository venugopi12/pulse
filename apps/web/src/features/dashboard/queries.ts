import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-client";
import { useSession } from "@/stores/session";

/**
 * The tenant's first dashboard. Two dependent queries: list, then detail.
 * `enabled` makes the second wait for the first.
 */
export function usePrimaryDashboard() {
  const { token, tenant } = useSession();

  const list = useQuery({
    queryKey: qk.dashboards(tenant.id),
    queryFn: () => api.dashboards(token),
  });
  const firstId = list.data?.dashboards[0]?.id;

  const detail = useQuery({
    queryKey: qk.dashboard(tenant.id, firstId ?? "none"),
    queryFn: () => api.dashboard(token, firstId!),
    enabled: firstId !== undefined,
  });

  return {
    dashboard: detail.data,
    isPending: list.isPending || (firstId !== undefined && detail.isPending),
    isEmpty: list.isSuccess && firstId === undefined,
    error: list.error ?? detail.error,
  };
}
