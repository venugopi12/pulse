import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * A tiny area chart for KPI cards: the last 30 minutes, one point a minute.
 * Plain SVG (no chart library): two paths in a 100×32 viewBox stretched to
 * the card's width; `vector-effect` keeps the line 1.5px whatever the
 * stretch. Decorative: the number above it is the accessible value, so the
 * SVG is hidden from screen readers.
 */
export function Sparkline({ values, className }: { values: readonly number[]; className?: string }) {
  const id = useId();
  if (values.length < 2) return <div className={className} />;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 30 - ((v - min) / span) * 26] as const);
  const line = smoothPath(pts);
  const area = `${line} L100,32 L0,32 Z`;
  const [lx, ly] = pts[pts.length - 1] ?? [100, 16];

  return (
    <div className={cn("relative", className)}>
      <svg
        aria-hidden
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-mark)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--chart-mark)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id}-fill)`} />
        <path
          d={line}
          fill="none"
          stroke="var(--chart-mark)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* The live end of the line: an HTML dot, so the stretched viewBox
          doesn't squash it into an ellipse. */}
      <span
        aria-hidden
        className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-mark shadow-[0_0_0_3px_var(--accent-soft)]"
        style={{ left: `${lx}%`, top: `${(ly / 32) * 100}%` }}
      />
    </div>
  );
}

/**
 * A smooth curve through the points (Catmull-Rom converted to cubic
 * Béziers). Control points are clamped to the chart's height so the curve
 * never overshoots above the top or below the baseline.
 */
function smoothPath(pts: readonly (readonly [number, number])[]): string {
  const f = (n: number) => n.toFixed(2);
  const clampY = (y: number) => Math.min(31, Math.max(1, y));
  let d = `M${f(pts[0]![0])},${f(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = clampY(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clampY(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}
