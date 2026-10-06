import { OctagonAlert, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { useAlertsStore, type AlertRecord } from "@/features/alerts/store";
import { cn } from "@/lib/cn";
import { maybeMemo } from "@/perf/flags";
import { formatTime, formatValue } from "@/lib/format";

export const LEVEL_COPY = { warn: "Warning", critical: "Critical" } as const;

/** Status is never colour alone: an icon AND a word, always. */
export function LevelBadge({ level }: { level: "warn" | "critical" }) {
  const Icon = level === "critical" ? OctagonAlert : TriangleAlert;
  return (
    <Badge tone={level === "critical" ? "danger" : "warning"}>
      <Icon className="size-3" aria-hidden />
      {LEVEL_COPY[level]}
    </Badge>
  );
}

export const AlertListBody = maybeMemo(function AlertListBody() {
  const history = useAlertsStore((s) => s.history);
  const open = history.filter((a) => a.resolvedAt === null);
  const recent = history.filter((a) => a.resolvedAt !== null).slice(0, 4);

  if (history.length === 0) {
    return (
      <div className="m-auto text-center">
        <p className="text-sm text-fg-muted">All clear</p>
        <p className="mt-1 text-xs text-fg-subtle">Alerts appear here when a widget crosses its threshold.</p>
      </div>
    );
  }

  return (
    <ul className="-mx-1 grid gap-1">
      <AnimatePresence initial={false}>
        {[...open, ...recent].map((a) => (
          <motion.li
            key={a.id}
            layout="position"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius-control)] px-1 py-1.5 text-sm",
              a.resolvedAt !== null && "opacity-60",
            )}
          >
            <LevelBadge level={a.level} />
            <span className="min-w-0 flex-1 truncate">{a.title}</span>
            <AlertMeta alert={a} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
});

function AlertMeta({ alert }: { alert: AlertRecord }) {
  return (
    <span className="shrink-0 text-xs text-fg-subtle">
      {alert.resolvedAt === null ? (
        <>
          <span className="tabular text-fg">{alert.value === null ? "–" : formatValue(Math.round(alert.value), alert.unit)}</span>
          {" since "}
          <span className="tabular">{formatTime(alert.startedAt)}</span>
        </>
      ) : (
        <>
          {"resolved "}
          <span className="tabular">{formatTime(alert.resolvedAt)}</span>
        </>
      )}
    </span>
  );
}
