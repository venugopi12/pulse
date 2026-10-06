import { matchesFilter, type AnalyticsEvent, type Severity } from "@pulse/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { List, useListRef, type RowComponentProps } from "react-window";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar } from "@/features/ai-filter/filter-bar";
import { useActiveFilter } from "@/features/ai-filter/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";
import { qk } from "@/lib/query-client";
import { perf } from "@/perf/flags";
import { Measure } from "@/perf/monitor";
import { MAX_FEED, useLiveStore } from "@/stores/live";
import { useSession } from "@/stores/session";

const ROW_HEIGHT = 40;
const TONE: Record<Severity, "neutral" | "warning" | "danger"> = { info: "neutral", warn: "warning", error: "danger" };
const SEVERITY_FILTERS = [
  { id: "all", label: "All" },
  { id: "warn", label: "Warnings" },
  { id: "error", label: "Errors" },
] as const;
type SeverityFilter = (typeof SEVERITY_FILTERS)[number]["id"];

/** Columns: time, severity, event, then source and value from 640px up. */
const GRID = "grid grid-cols-[76px_72px_minmax(0,1fr)] sm:grid-cols-[84px_80px_minmax(0,1fr)_140px_96px] items-center gap-3 px-4";

/**
 * The full live stream: up to 20,000 events, ~90 new per second at peak.
 *
 * VIRTUALIZED with react-window: only the ~20 rows in view (plus a few of
 * overscan) exist in the DOM, whatever the list length. A new batch
 * re-renders those ~25 rows, not 20,000. Compare with /events?perf=novirtual.
 *
 * Scrolling down PAUSES the list, so rows don't slide away while you read;
 * a button shows how many arrived meanwhile and jumps back to live.
 */
export function EventsPage() {
  const { token, tenant } = useSession();
  const hydrated = useLiveStore((s) => s.hydrated);
  const feed = useLiveStore((s) => s.feed);
  const backfill = useLiveStore((s) => s.backfill);

  // The live feed starts with the last 200 events; fetch up to 10,000 older
  // ones once, and append them behind it.
  const history = useQuery({
    queryKey: [...qk.events(tenant.id), { limit: 10_000 }],
    queryFn: () => api.events(token, { limit: 10_000 }),
    enabled: hydrated,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (history.data) backfill(history.data.events);
  }, [history.data, backfill]);

  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [search, setSearch] = useState("");
  // Typing stays responsive: filtering 20k rows runs at lower priority.
  const query = useDeferredValue(search.trim().toLowerCase());

  const ai = useActiveFilter();
  const filtered = useMemo(() => {
    if (severity === "all" && !query && !ai) return feed;
    const now = Date.now();
    return feed.filter(
      (e) =>
        (severity === "all" || e.severity === severity) &&
        (!query || e.type.includes(query) || e.source.includes(query)) &&
        (!ai || matchesFilter(e, ai.filter, now)),
    );
  }, [feed, severity, query, ai]);

  // Pause while the user is scrolled away from the top.
  const [frozen, setFrozen] = useState<readonly AnalyticsEvent[] | null>(null);
  const rows = frozen ?? filtered;
  const newSincePause = useMemo(() => {
    if (!frozen || frozen.length === 0) return 0;
    const idx = filtered.findIndex((e) => e.id === frozen[0]!.id);
    return idx === -1 ? filtered.length : idx;
  }, [frozen, filtered]);

  // Rows read their event through a function, not the array itself. In dev,
  // React 19 diffs changed props for its Performance panel; handing every row
  // a 10,000-item array made that diff cost ~1s per update. A function isn't
  // diffed, and rows still re-render when `rows` changes (new getRow identity).
  const getRow = useCallback((i: number) => rows[i], [rows]);

  const listRef = useListRef(null);
  const naiveRef = useRef<HTMLDivElement>(null);
  const onScroll = (top: number) => {
    if (top > ROW_HEIGHT && !frozen) setFrozen(filtered);
    else if (top <= 0 && frozen) setFrozen(null);
  };
  const jumpToLatest = () => {
    setFrozen(null);
    if (perf.virtual) listRef.current?.element?.scrollTo({ top: 0 });
    else naiveRef.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const el = listRef.current?.element;
    if (!el) return;
    const handler = () => onScroll(el.scrollTop);
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  });

  return (
    <>
      <PageHeader
        title="Events"
        description={`Every event from ${tenant.name}, newest first. Up to ${MAX_FEED.toLocaleString()} are kept in memory.`}
      />

      <FilterBar className="mb-4" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Severity" className="flex rounded-[var(--radius-control)] border border-border p-0.5">
          {SEVERITY_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setSeverity(f.id)}
              aria-pressed={severity === f.id}
              className={cn(
                "h-8 rounded-[6px] px-3 text-sm transition-colors",
                severity === f.id ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by event or source"
          aria-label="Filter by event or source"
          className="h-9 w-full sm:w-64"
        />
        <p className="tabular ml-auto text-sm text-fg-muted">
          {rows.length.toLocaleString()} <span className="font-sans">{frozen ? "shown, paused" : "events"}</span>
        </p>
      </div>

      <Card className="relative overflow-hidden">
        <div className={cn(GRID, "h-10 border-b border-border text-xs text-fg-subtle")} role="presentation">
          <span>Time</span>
          <span>Severity</span>
          <span>Event</span>
          <span className="hidden sm:block">Source</span>
          <span className="hidden text-right sm:block">Value</span>
        </div>

        {frozen && (
          <div className="absolute top-12 left-1/2 z-10 -translate-x-1/2">
            <Button size="sm" variant="primary" onClick={jumpToLatest}>
              <ArrowUp /> {newSincePause > 0 ? `${newSincePause.toLocaleString()} new events` : "Back to live"}
            </Button>
          </div>
        )}

        {!hydrated ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-fg-subtle">No events match these filters.</p>
        ) : (
          <Measure id="events-list">
            {perf.virtual ? (
              <List
                listRef={listRef}
                rowComponent={EventRow}
                rowCount={rows.length}
                rowHeight={ROW_HEIGHT}
                rowProps={{ getRow }}
                overscanCount={6}
                style={{ height: "max(320px, calc(100dvh - 300px))" }}
                aria-label="Events"
              />
            ) : (
              // ?perf=novirtual: every row in the DOM (the "before" case).
              <div
                ref={naiveRef}
                role="list"
                aria-label="Events"
                className="overflow-y-auto"
                style={{ height: "max(320px, calc(100dvh - 300px))" }}
                onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
              >
                {rows.map((_, i) => (
                  <EventRow
                    key={rows[i]!.id}
                    index={i}
                    getRow={getRow}
                    style={{ height: ROW_HEIGHT }}
                    ariaAttributes={{ "aria-posinset": i + 1, "aria-setsize": rows.length, role: "listitem" }}
                  />
                ))}
              </div>
            )}
          </Measure>
        )}
      </Card>
    </>
  );
}

type RowData = { getRow: (index: number) => AnalyticsEvent | undefined };

function EventRow({ index, getRow, style, ariaAttributes }: RowComponentProps<RowData>) {
  const e = getRow(index);
  if (!e) return null;
  return (
    <div style={style} {...ariaAttributes} className={cn(GRID, "border-b border-border/60 text-sm hover:bg-surface-2")}>
      <span className="tabular text-xs text-fg-muted">{formatTime(e.timestamp)}</span>
      <span>
        <Badge tone={TONE[e.severity]}>{e.severity}</Badge>
      </span>
      <span className="truncate font-medium">{e.type}</span>
      <span className="hidden truncate text-fg-muted sm:block">{e.source}</span>
      <span className="tabular hidden text-right text-xs sm:block">{e.value}</span>
    </div>
  );
}
