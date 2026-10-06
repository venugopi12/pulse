import { Bell } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAlertsStore } from "@/features/alerts/store";
import { LevelBadge } from "@/features/dashboard/widgets/alert-list-widget";
import { formatTime } from "@/lib/format";
import { spring } from "@/lib/motion";

/**
 * Bell + unseen count. The badge is keyed by the count, so every new alert
 * remounts it and replays a springy scale-in: the "bounce".
 */
export function AlertsMenu() {
  const unseen = useAlertsStore((s) => s.unseen);
  const history = useAlertsStore((s) => s.history);
  const markSeen = useAlertsStore((s) => s.markSeen);
  const openCount = history.filter((a) => a.resolvedAt === null).length;

  return (
    <DropdownMenu onOpenChange={(open) => open && markSeen()}>
      <DropdownMenuTrigger
        className="relative flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg data-[state=open]:bg-surface-3"
        aria-label={unseen > 0 ? `Alerts, ${unseen} new` : "Alerts"}
      >
        <Bell className="size-[18px]" />
        <AnimatePresence>
          {unseen > 0 && (
            <motion.span
              key={unseen}
              className="tabular absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={spring.attention}
            >
              {unseen > 9 ? "9+" : unseen}
            </motion.span>
          )}
        </AnimatePresence>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{openCount > 0 ? `${openCount} open` : "No open alerts"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {history.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-fg-subtle">Nothing yet. You'll see threshold alerts here.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {history.slice(0, 10).map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-2 py-2 text-sm">
                <LevelBadge level={a.level} />
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
                <span className="tabular shrink-0 text-xs text-fg-subtle">
                  {a.resolvedAt === null ? formatTime(a.startedAt) : "resolved"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
