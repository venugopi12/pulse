import { groupFromRollups, isNoMatch, type WidgetConfig } from "@pulse/shared";
import { NoMatch } from "@/features/ai-filter/no-match";
import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useFilteredMetric } from "@/features/ai-filter/use-filtered-metric";
import { useLiveThrottled } from "@/hooks/use-live-throttled";
import { formatValue } from "@/lib/format";
import { maybeMemo } from "@/perf/flags";
import { spring } from "@/lib/motion";

type BarConfig = Extract<WidgetConfig, { type: "bar" }>;
type Row = { key: string; value: number };

/** More groups than this fold into "Other" rather than shrinking every bar. */
const MAX_ROWS = 5;

function topRows(groups: Row[]): Row[] {
  if (groups.length <= MAX_ROWS) return groups;
  const rest = groups.slice(MAX_ROWS - 1).reduce((s, g) => s + g.value, 0);
  return [...groups.slice(0, MAX_ROWS - 1), { key: "Other", value: rest }];
}

const sameRows = (a: Row[] | null, b: Row[] | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.length === b.length &&
    a.every((r, i) => r.key === b[i]!.key && Math.round(r.value) === Math.round(b[i]!.value)));

/**
 * Horizontal bars in plain HTML. Each bar is a full-width element scaled
 * with transform: scaleX(value / max), so live updates animate on the
 * compositor (no layout, no repaint of text). When the ranking changes,
 * `layout` slides rows to their new positions (FLIP, also transforms).
 */
export const BarBody = maybeMemo(function BarBody({ widget }: { widget: BarConfig }) {
  const metric = useFilteredMetric(widget.metric);
  const rows = useLiveThrottled(
    (s) => (s.hydrated ? topRows(groupFromRollups(s.rollups, metric, widget.groupBy, s.now)) : null),
    1000,
    sameRows,
  );
  const unit = widget.unit ?? "count";

  if (isNoMatch(metric)) return <NoMatch className="m-auto" />;
  if (!rows) {
    return (
      <div className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-5" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) return <p className="m-auto text-sm text-fg-subtle">No events in this window yet</p>;

  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <ul className="grid gap-2">
      {rows.map((r) => (
        <motion.li key={r.key} layout="position" transition={spring.smooth}>
          <Tooltip
            content={`${r.key}: ${formatValue(Math.round(r.value), unit)} (${Math.round((r.value / total) * 100)}% of total)`}
            side="top"
          >
            {/* The whole row is the hover target: much easier to hit than a thin bar. */}
            <div className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 rounded-[6px] py-0.5 text-sm hover:bg-surface-2">
              <span className="truncate text-fg-muted">{r.key}</span>
              <span className="relative h-5 overflow-hidden">
                <motion.span
                  className="absolute inset-y-0 left-0 w-full origin-left rounded-r-[4px] bg-chart-mark"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: r.value / max }}
                  transition={spring.data}
                />
              </span>
              <span className="tabular text-right text-xs text-fg">{formatValue(Math.round(r.value), unit)}</span>
            </div>
          </Tooltip>
        </motion.li>
      ))}
    </ul>
  );
});
