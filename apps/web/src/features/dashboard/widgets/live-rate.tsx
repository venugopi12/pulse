import { useLiveStore } from "@/stores/live";

/** "21.4 events/s" — subscribes to one rounded number, so it re-renders rarely. */
export function LiveRate() {
  const rate = useLiveStore((s) => s.ratePerSec);
  const hydrated = useLiveStore((s) => s.hydrated);
  if (!hydrated) return null;
  return (
    <span className="text-sm text-fg-muted">
      <span className="tabular text-fg">{rate.toFixed(1)}</span> events/s
    </span>
  );
}
