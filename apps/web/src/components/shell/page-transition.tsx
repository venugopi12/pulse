import { useReducedMotion } from "motion/react";
import { AnimateView } from "motion/react-animate-view";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { ease } from "@/lib/motion";

/**
 * Page changes use a "fade-through": the old page fades out quickly, then the
 * new one fades in while rising 6px. Overview, Events and Team are siblings
 * with no spatial order, so a directional slide would imply a relationship
 * that isn't there; fade-through is the pattern for exactly that case.
 *
 * How it works: <AnimateView> (motion.dev) wraps React's <ViewTransition>.
 * React Router runs navigations inside startTransition, so when the keyed
 * view below unmounts and the next one mounts, the browser snapshots both
 * and Motion animates the snapshots (compositor-only: opacity + transform).
 * Only the page area is named, so the sidebar and top bar don't move
 * (see the view-transition rules in styles/index.css).
 *
 * Reduced motion: no view transition at all; pages swap instantly. Browsers
 * without the View Transitions API do the same, automatically.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  if (reduce) return <div>{children}</div>;

  return (
    <AnimateView
      key={pathname}
      // Out first, then in: the new page starts once the old one is nearly
      // gone, so the two never ghost over each other. ~300ms end to end.
      exit={{ opacity: 0, transition: { duration: 0.1, ease: ease.in } }}
      enter={{
        opacity: [0, 1],
        transform: ["translateY(6px)", "none"],
        transition: { duration: 0.22, delay: 0.09, ease: ease.out },
      }}
    >
      {/* One DOM element: the view-transition name attaches to it. */}
      <div>{children}</div>
    </AnimateView>
  );
}
