import { cn } from "@/lib/cn";

/**
 * The page backdrop, shared by the app shell and the login screen:
 *  - a dot grid (Magic UI "Dot Pattern", 21st.dev) drawn with ONE CSS
 *    radial-gradient instead of an SVG circle per dot;
 *  - soft "aurora" glows in the tenant's accent (var(--accent-glow)), so
 *    the whole app takes on the tenant's colour when you switch.
 *
 * Performance: it's a FIXED layer behind the page, not the page's own
 * background. As the page background, every live number that repainted
 * (several per second) made the browser re-rasterize the gradient stack
 * beneath it. As its own layer it's rasterized once and only composited.
 * Measured with perf/browser-load.ts, optimized dashboard under load:
 *   pre-redesign 48.6 / 49.5 fps
 *   backdrop as page background 44.7–47.7 fps
 *   backdrop as fixed layer 48.6 / 49.8 fps (parity)
 * No mask either: the dots fade out under a gradient painted on top of
 * them in the same background stack. See `.backdrop` in styles/index.css.
 */
export function Backdrop({ strong = false }: { strong?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn("backdrop pointer-events-none fixed inset-0 -z-10", strong && "backdrop-strong")}
    />
  );
}
