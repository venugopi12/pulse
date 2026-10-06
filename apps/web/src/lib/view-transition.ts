import { flushSync } from "react-dom";

/**
 * Run a synchronous UI update inside a browser view transition of a given
 * type, so CSS can style it (`:active-view-transition-type(<type>)`).
 *
 * Why not <AnimateView> here? Tenant switching is a Zustand update, and
 * React never treats external-store updates as transitions (they always
 * render synchronously), so React's <ViewTransition> can't see them. Instead
 * we ask the browser to snapshot the page, apply the update synchronously
 * with flushSync, and let CSS crossfade old and new.
 *
 * Skipped (plain update) when the browser lacks the API or the `types`
 * option, the tab is hidden, or the user prefers reduced motion.
 */
export function withViewTransition(type: string, update: () => void): void {
  const canAnimate =
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    document.visibilityState === "visible" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!canAnimate) {
    update();
    return;
  }
  try {
    document.startViewTransition({ update: () => flushSync(update), types: [type] });
  } catch {
    // Older engines only accept a callback; without types our CSS can't
    // target it, so skip the animation rather than get a generic crossfade.
    update();
  }
}
