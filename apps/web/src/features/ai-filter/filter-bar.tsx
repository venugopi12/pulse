import { describeFilter, type AiFilter, type Severity } from "@pulse/shared";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { GlowBorder } from "@/components/fx/glow-border";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useLiveStore } from "@/stores/live";
import { useSession } from "@/stores/session";
import { useActiveFilter, useFilterStore } from "./store";
import { useAiFilter, type FilterPreview } from "./use-ai-filter";
import { fade, spring } from "@/lib/motion";

const SEVERITY: Record<Severity, string> = { info: "Info", warn: "Warnings", error: "Errors" };

function timeLabel(m: number): string {
  if (m === 60) return "Last hour";
  if (m === 1440) return "Last 24 hours";
  return m % 60 === 0 ? `Last ${m / 60} hours` : `Last ${m} minutes`;
}

interface Chip {
  key: string;
  label: string;
  remove: (f: AiFilter) => AiFilter;
}

function chipsFor(f: FilterPreview): Chip[] {
  const chips: Chip[] = [];
  for (const s of f.severities ?? [])
    chips.push({
      key: `sev-${s}`,
      label: SEVERITY[s],
      remove: (x) => ({ ...x, severities: x.severities.filter((y) => y !== s) }),
    });
  for (const t of f.eventTypes ?? [])
    chips.push({
      key: `type-${t}`,
      label: t,
      remove: (x) => ({ ...x, eventTypes: x.eventTypes.filter((y) => y !== t) }),
    });
  for (const src of f.sources ?? [])
    chips.push({
      key: `src-${src}`,
      label: `from ${src}`,
      remove: (x) => ({ ...x, sources: x.sources.filter((y) => y !== src) }),
    });
  if (f.sinceMinutes != null)
    chips.push({ key: "time", label: timeLabel(f.sinceMinutes), remove: (x) => ({ ...x, sinceMinutes: null }) });
  return chips;
}

/**
 * "Filter in plain English". Type, press Enter, watch the filter assemble
 * itself as the model streams, then it's applied to every widget (or the
 * Events list). Chips can be removed one by one.
 */
export function FilterBar({ className }: { className?: string }) {
  const { token, tenant } = useSession();
  const active = useActiveFilter();
  const update = useFilterStore((s) => s.update);
  const clear = useFilterStore((s) => s.clear);
  const focusPending = useFilterStore((s) => s.focusPending);
  const consumeFocus = useFilterStore((s) => s.consumeFocus);
  const { status, submit, cancel } = useAiFilter();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mode = useQuery({ queryKey: ["ai-status"], queryFn: () => api.aiStatus(token), staleTime: Infinity });

  useEffect(() => {
    if (!focusPending) return;
    inputRef.current?.focus();
    consumeFocus();
  }, [focusPending, consumeFocus]);
  useEffect(() => setQuery(active?.query ?? ""), [tenant.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Examples built from what THIS tenant actually sends.
  const examples = useMemo(() => {
    if (!focused || query) return [];
    const types = new Set<string>();
    const sources = new Set<string>();
    for (const bucket of useLiveStore.getState().rollups.values())
      for (const c of bucket.values()) {
        types.add(c.type);
        sources.add(c.source);
      }
    const src = [...sources][1] ?? [...sources][0];
    const type = [...types].find((t) => /fail|delay|reject|abandon|error/.test(t)) ?? [...types][0];
    return [
      src ? `errors from ${src} in the last hour` : "errors in the last hour",
      type ? `${type.replace(/[._]/g, " ")} today` : "warnings today",
      "problems in the last 15 minutes",
    ];
  }, [focused, query]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length >= 2) void submit(query.trim());
  }

  const streaming = status.state === "streaming";
  const previewChips = streaming ? chipsFor(status.preview) : [];
  const activeChips = active ? chipsFor(active.filter) : [];

  return (
    <section aria-label="Filter" className={cn("mb-6", className)}>
      <form role="search" onSubmit={onSubmit} className="relative">
        <div
          className={cn(
            "surface relative flex h-12 items-center gap-3 rounded-[var(--radius-card)] pr-2 pl-4 transition-[border-color,box-shadow]",
            focused &&
              "border-[color-mix(in_oklch,var(--accent)_45%,var(--border))] shadow-[0_0_0_4px_var(--accent-soft)]",
          )}
        >
          {/* At rest: a faint accent gradient ring, so the bar reads as an AI
              input before you type (21st.dev AI-prompt pattern). Static: a
              masked gradient, painted once. Brighter on focus. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 rounded-[inherit] p-px transition-opacity duration-200",
              focused || streaming ? "opacity-0" : "opacity-70",
            )}
            style={{
              background:
                "linear-gradient(100deg, color-mix(in oklch, var(--accent) 70%, transparent), transparent 35%, transparent 65%, color-mix(in oklch, var(--accent) 40%, #a78bfa))",
              mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              maskComposite: "exclude",
              WebkitMaskComposite: "xor",
            }}
          />
          {/* While the answer streams, a light sweeps around the bar
              (Shine Border, compositor-only): "the AI is working". */}
          {streaming && (
            <GlowBorder
              variant="shine"
              width={1.5}
              duration={2.2}
              colors={["var(--accent)", "transparent", "color-mix(in oklch, var(--accent), #fff 55%)", "transparent"]}
            />
          )}
          <Sparkles
            aria-hidden
            className={cn("size-[18px] shrink-0 text-accent-fg transition-opacity", !streaming && !focused && "opacity-80")}
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (streaming) cancel();
                else if (active) clear(tenant.id);
                setQuery("");
              }
            }}
            maxLength={200}
            placeholder="Filter in plain English, like “errors from checkout in the last hour”"
            aria-label="Filter in plain English"
            className="h-full min-w-0 flex-1 appearance-none bg-transparent [&::-webkit-search-cancel-button]:hidden text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:shadow-none focus-visible:outline-none"
          />
          <span className="hidden text-xs text-fg-subtle md:inline">
            {mode.data?.mode === "ai" ? "AI" : mode.data ? "Keyword matching" : ""}
          </span>
          <Button
            type="submit"
            size="sm"
            variant={query.trim() ? "primary" : "ghost"}
            disabled={streaming || query.trim().length < 2}
          >
            {streaming ? "Filtering" : "Filter"}
          </Button>
        </div>

        <AnimatePresence>
          {examples.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={fade}
              className="surface absolute inset-x-0 top-14 z-20 rounded-[var(--radius-control)] p-1"
              aria-label="Examples"
            >
              {examples.map((ex) => (
                <li key={ex}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery(ex);
                      void submit(ex);
                    }}
                    className="w-full rounded-[6px] px-3 py-2 text-left text-sm text-fg-muted hover:bg-surface-3 hover:text-fg"
                  >
                    {ex}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </form>

      <div aria-live="polite" className="mt-3 empty:mt-0">
        {streaming ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span>Reading your request</span>
            {previewChips.length === 0 ? (
              <Skeleton className="h-6 w-28" />
            ) : (
              previewChips.map((c) => (
                <motion.span
                  key={c.key}
                  layoutId={`chip-${c.key}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={spring.snappy}
                >
                  <Badge tone="accent">{c.label}</Badge>
                </motion.span>
              ))
            )}
          </div>
        ) : status.state === "nothing" ? (
          <p className="text-sm text-fg-muted">{status.message}</p>
        ) : status.state === "error" ? (
          <p role="alert" className="text-sm text-danger">
            {status.message}
          </p>
        ) : active ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-fg-muted">Showing</span>
            <span className="font-medium">{describeFilter(active.filter)}</span>
            {/* Same layoutId as the preview chips: when the answer lands they
                glide into place here. popLayout: a removed chip leaves the
                flow immediately so its neighbours slide over (transform only). */}
            <AnimatePresence mode="popLayout" initial={false}>
              {activeChips.map((c) => (
                <motion.span
                  key={c.key}
                  layoutId={`chip-${c.key}`}
                  layout="position"
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={spring.snappy}
                >
                  <Badge tone="accent" className="pr-1">
                    {c.label}
                    <button
                      type="button"
                      onClick={() => update(tenant.id, c.remove(active.filter))}
                      aria-label={`Remove ${c.label}`}
                      className="rounded-[4px] p-0.5 hover:bg-accent-soft"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                </motion.span>
              ))}
              <motion.span key="source" layout="position" transition={spring.snappy}>
                <Badge tone="neutral">{active.source === "ai" ? "via AI" : "via keywords"}</Badge>
              </motion.span>
            </AnimatePresence>
            <motion.span layout="position" transition={spring.snappy}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => {
                  clear(tenant.id);
                  setQuery("");
                }}
              >
                Clear filter
              </Button>
            </motion.span>
            {active.notes.length > 0 && <p className="w-full text-xs text-fg-subtle">{active.notes.join(" ")}</p>}
          </div>
        ) : null}
      </div>
    </section>
  );
}
