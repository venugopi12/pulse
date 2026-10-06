import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useConnectionStore, type ConnectionStatus } from "@/stores/connection";

const COPY: Record<ConnectionStatus, string> = {
  live: "Live",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  offline: "Offline",
};

const DOT: Record<ConnectionStatus, string> = {
  live: "bg-success",
  connecting: "bg-warning",
  reconnecting: "bg-warning",
  offline: "bg-fg-subtle",
};

/** Presentational: also used on the design-system page to show every state. */
export function LiveIndicatorView({
  status,
  retryAt = null,
  showLabel = true,
}: {
  status: ConnectionStatus;
  retryAt?: number | null;
  showLabel?: boolean;
}) {
  const seconds = useCountdown(status === "reconnecting" ? retryAt : null);

  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex h-8 items-center gap-2 rounded-full border border-border px-3 text-xs font-medium text-fg-muted"
    >
      <span className="relative flex size-2">
        {/* The breathing ring only exists while live: it's the "heartbeat". */}
        {status === "live" && <span className="animate-breathe absolute inset-0 rounded-full bg-success" />}
        <span
          className={cn(
            "relative size-2 rounded-full transition-colors duration-300",
            DOT[status],
            status === "connecting" && "animate-pulse",
          )}
        />
      </span>
      <span className={cn(!showLabel && "sr-only")}>
        {COPY[status]}
        {/* Only the changing digits are tabular, so the countdown doesn't jitter. */}
        {status === "reconnecting" && seconds !== null && (
          <>
            {" in "}
            <span className="tabular">{seconds}s</span>
          </>
        )}
      </span>
    </span>
  );
}

/** Connected version: re-renders only when status/retryAt change. */
export function LiveIndicator({ showLabel = true }: { showLabel?: boolean }) {
  const status = useConnectionStore((s) => s.status);
  const retryAt = useConnectionStore((s) => s.retryAt);
  return <LiveIndicatorView status={status} retryAt={retryAt} showLabel={showLabel} />;
}

function useCountdown(target: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [target]);
  return target === null ? null : Math.max(0, Math.ceil((target - now) / 1000));
}
