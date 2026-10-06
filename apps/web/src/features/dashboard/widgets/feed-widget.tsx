import { matchesFilter, type AnalyticsEvent, type Severity, type WidgetConfig } from "@pulse/shared";
import { useActiveFilter } from "@/features/ai-filter/store";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { maybeMemo, perf } from "@/perf/flags";
import { formatTime } from "@/lib/format";
import { useLiveStore } from "@/stores/live";
import { fade, spring } from "@/lib/motion";

type FeedConfig = Extract<WidgetConfig, { type: "feed" }>;

/** Only the rows that fit in the card are rendered, so only they animate. */
const VISIBLE = 12;
/**
 * Above this many new rows in one update, sliding them all in is just noise
 * (and the motions overlap). Bursts swap in with a quick fade instead.
 */
const MAX_ANIMATED_NEW = 4;

const DOT: Record<Severity, string> = { info: "bg-fg-subtle", warn: "bg-warning", error: "bg-danger" };

const useFeedNarrow = () => ({
  hydrated: useLiveStore((s) => s.hydrated),
  feed: useLiveStore((s) => s.feed),
});
/** ?perf=nomemo: whole-store subscription. */
const useFeedWide = () => useLiveStore();
const useFeedState = perf.memo ? useFeedNarrow : useFeedWide;

export const FeedBody = maybeMemo(function FeedBody({ widget }: { widget: FeedConfig }) {
  const { hydrated, feed } = useFeedState();
  const active = useActiveFilter();

  // Filtering scans from the newest and stops once the card is full, so it
  // costs ~VISIBLE checks, not 10,000.
  const rows = useMemo(() => {
    const out: AnalyticsEvent[] = [];
    const now = Date.now();
    for (const e of feed) {
      if (widget.severities && !widget.severities.includes(e.severity)) continue;
      if (widget.eventTypes && !widget.eventTypes.includes(e.type)) continue;
      if (active && !matchesFilter(e, active.filter, now)) continue;
      out.push(e);
      if (out.length === VISIBLE) break;
    }
    return out;
  }, [feed, widget.severities, widget.eventTypes, active]);

  // How many visible rows are new since the last COMMITTED render? The ref is
  // only read during render and written after commit (useEffect), which keeps
  // render pure, so StrictMode's double render sees the same answer twice.
  const shownIds = useRef<Set<string> | null>(null);
  const firstPaint = shownIds.current === null;
  const isNew = (id: string) => !firstPaint && !shownIds.current!.has(id);
  const newCount = rows.reduce((n, e) => n + (isNew(e.id) ? 1 : 0), 0);
  const burst = newCount > MAX_ANIMATED_NEW;
  useEffect(() => {
    shownIds.current = new Set(rows.map((e) => e.id));
  }, [rows]);

  if (!hydrated) {
    return (
      <div className="grid gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="m-auto text-sm text-fg-subtle">Nothing matching yet</p>;
  }

  return (
    <ul className="-mx-4 flex-1 overflow-hidden" aria-live="off">
      {/* New rows slide down from the top; `layout` moves the existing rows
          down with transforms (FLIP), never by animating top/height.
          No AnimatePresence: rows pushed off the bottom just unmount. They're
          leaving the visible area, and AnimatePresence would cost an extra
          render per update to clean them up (measured: 9 -> 4 renders/s). */}
      {rows.map((e) => (
        <motion.li
          key={e.id}
          layout={burst ? false : "position"}
          initial={isNew(e.id) ? (burst ? { opacity: 0 } : { opacity: 0, y: -12 }) : false}
          animate={{ opacity: 1, y: 0 }}
          transition={burst ? fade : spring.snappy}
          className="flex items-center gap-3 border-b border-border/60 px-4 py-2 text-sm last:border-0"
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", DOT[e.severity])} aria-label={e.severity} />
          <span className="min-w-0 flex-1 truncate">{e.type}</span>
          <span className="tabular shrink-0 text-xs text-fg-subtle">{formatTime(e.timestamp)}</span>
        </motion.li>
      ))}
    </ul>
  );
});
