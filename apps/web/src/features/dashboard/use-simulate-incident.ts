import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiRequestError } from "@/lib/api";
import { useSession } from "@/stores/session";

/** Demo control (admins only): spike errors and latency for 3 minutes. */
export function useSimulateIncident() {
  const { token, tenant } = useSession();
  return useMutation({
    mutationFn: () => api.simulateIncident(token, 180),
    onSuccess: () =>
      toast(`Incident started for ${tenant.name}`, {
        description: "Errors and latency will spike for 3 minutes. Alerts fire once a threshold holds for 3 seconds.",
      }),
    onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't start the incident"),
  });
}
