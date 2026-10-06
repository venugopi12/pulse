import { UpdateDashboardRequestSchema, type Dashboard, type WidgetConfig } from "@pulse/shared";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiRequestError } from "@/lib/api";
import { qk, queryClient } from "@/lib/query-client";
import { useSession } from "@/stores/session";

/**
 * Save the layout OPTIMISTICALLY: the cache is updated before the server
 * answers, so the grid doesn't snap back while the request is in flight.
 * On failure the previous version is restored. A 409 means another admin
 * saved first (version check on the server): we don't overwrite their work.
 */
export function useSaveDashboard(dashboard: Dashboard | undefined) {
  const { token, tenant } = useSession();
  const key = qk.dashboard(tenant.id, dashboard?.id ?? "none");

  return useMutation({
    mutationFn: async (widgets: WidgetConfig[]) => {
      if (!dashboard) throw new Error("No dashboard loaded");
      // Same schema as the server: catch problems before the round trip.
      const body = UpdateDashboardRequestSchema.parse({ widgets, version: dashboard.version });
      return api.saveDashboard(token, dashboard.id, body);
    },
    onMutate: async (widgets) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Dashboard>(key);
      if (previous) queryClient.setQueryData<Dashboard>(key, { ...previous, widgets });
      return { previous };
    },
    onError: (err, _widgets, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      if (err instanceof ApiRequestError && err.status === 409) {
        toast.error("Someone else saved this dashboard first", {
          description: "Reload to get their version, then make your change again.",
          action: { label: "Reload", onClick: () => void queryClient.invalidateQueries({ queryKey: key }) },
        });
      } else {
        toast.error("Couldn't save the layout", { description: err.message });
      }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
      toast.success("Layout saved", { description: `Everyone in ${tenant.name} now sees it.` });
    },
  });
}
