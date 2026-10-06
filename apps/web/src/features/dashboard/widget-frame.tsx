import type { AlertLevel, WidgetConfig } from "@pulse/shared";
import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { GlowBorder } from "@/components/fx/glow-border";
import { SpotlightCard } from "@/components/fx/spotlight-card";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Funnel } from "lucide-react";
import { useActiveFilter } from "@/features/ai-filter/store";
import { useAlertsStore } from "@/features/alerts/store";
import { cn } from "@/lib/cn";
import { maybeMemo } from "@/perf/flags";
import { Measure } from "@/perf/monitor";
import { WIDGETS, WidgetBody } from "./registry";
import { LevelBadge } from "./widgets/alert-list-widget";
import { duration, ease, spring } from "@/lib/motion";

/**
 * Tailwind only generates classes it can SEE in source files, so spans are
 * looked up from complete class strings, never built like `col-span-${n}`.
 * Phones: 1 column. Tablets: 2. Desktop: the 4-column bento.
 */
const COL: Record<number, string> = {
  1: "lg:col-span-1",
  2: "sm:col-span-2 lg:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
  4: "sm:col-span-2 lg:col-span-4",
};
const ROW: Record<number, string> = { 1: "", 2: "lg:row-span-2", 3: "lg:row-span-3" };

export const gridClass = (w: WidgetConfig) => cn(COL[w.layout.colSpan], ROW[w.layout.rowSpan]);

/** Stagger child: a short fade + 8px rise. Parent controls the timing. */
export const widgetEnter: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } },
};

/** View mode. memo: re-renders only when ITS config changes. */
export const WidgetFrame = maybeMemo(function WidgetFrame({ widget }: { widget: WidgetConfig }) {
  return (
    <motion.div
      variants={widgetEnter}
      // `layout`: when an admin reorders or resizes widgets, every viewer's
      // grid animates to the new arrangement (FLIP: transforms only).
      layout
      transition={{ layout: spring.smooth }}
      className={cn("min-h-[140px]", gridClass(widget))}
    >
      <WidgetCard widget={widget} />
    </motion.div>
  );
});

/** The card itself, shared by view mode and edit mode. */
export function WidgetCard({
  widget,
  toolbar,
  className,
}: {
  widget: WidgetConfig;
  toolbar?: ReactNode;
  className?: string;
}) {
  const level = useAlertsStore((s) => s.levels[widget.id] ?? "ok");
  const filtered = useActiveFilter() !== null && widget.type !== "alertList";
  const Icon = filtered ? Funnel : WIDGETS[widget.type].icon;

  // View mode: a spotlight card. Edit mode (toolbar): a plain card, since the
  // pointer is busy dragging and resizing there.
  const Frame = toolbar ? Card : SpotlightCard;

  return (
    <Frame className={cn("relative flex h-full flex-col", className)}>
      {level !== "ok" && <AlertBorder level={level} />}
      <CardHeader>
        <CardTitle>{widget.title}</CardTitle>
        {toolbar ??
          (level !== "ok" ? (
            <LevelBadge level={level} />
          ) : (
            // Icon in a small tinted chip (bento-card style); accent when a
            // filter is narrowing this widget.
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-[8px] ring-1 ring-inset transition-colors",
                filtered
                  ? "bg-accent-soft text-accent-fg ring-[color-mix(in_oklch,var(--accent)_35%,transparent)]"
                  : "bg-surface-3/60 text-fg-subtle ring-border",
              )}
            >
              <Icon aria-label={filtered ? "Filtered" : undefined} aria-hidden={!filtered} className="size-[15px]" />
            </span>
          ))}
      </CardHeader>
      <CardBody className="flex flex-1 flex-col">
        <Measure id={`widget:${widget.type}:${widget.id}`}>
          <WidgetBody widget={widget} />
        </Measure>
      </CardBody>
    </Frame>
  );
}

/**
 * Alert state on the card: a solid ring in the alert colour, plus a beam of
 * light travelling around the border (faster when critical). The beam is a
 * rotating conic gradient (transform only, see GlowBorder). With reduced
 * motion the beam holds still. The header badge says the same thing in
 * words and an icon, so colour is never the only signal.
 */
function AlertBorder({ level }: { level: Exclude<AlertLevel, "ok"> }) {
  const color = level === "critical" ? "var(--danger)" : "var(--warning)";
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 55%, transparent), inset 0 0 32px -8px color-mix(in oklch, ${color} 35%, transparent)`,
        }}
      />
      <GlowBorder
        variant="beam"
        width={1.5}
        duration={level === "critical" ? 2.4 : 4}
        colors={[`color-mix(in oklch, ${color} 40%, transparent)`, color]}
      />
    </>
  );
}
