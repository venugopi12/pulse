import type { Transition } from "motion/react";

/**
 * Pulse's motion system: one place for every spring, easing and duration.
 *
 * Springs are written with `visualDuration` + `bounce` (Motion's
 * designer-friendly form) instead of stiffness/damping: "looks done in
 * 0.25s, no overshoot" is something you can reason about and keep
 * consistent; `stiffness: 520, damping: 36` isn't.
 *
 * Rules the app follows:
 *  - Only transform and opacity animate (compositor-only, no layout work).
 *  - Chrome is fast (under ~250ms); data is slower, so changes can be read.
 *  - Only the alert bell overshoots. Bounce means "look at me".
 *  - Reduced motion: <MotionConfig reducedMotion="user"> in main.tsx turns
 *    transforms off and keeps opacity; view transitions are skipped
 *    entirely (see page-transition.tsx and view-transition.ts).
 */
export const spring = {
  /** UI chrome: nav highlight, popovers, chips, palette. Quick, settles flat. */
  snappy: { type: "spring", visualDuration: 0.22, bounce: 0.1 },
  /** Things travelling across the page: grid reflow, list reorder, drawer. */
  smooth: { type: "spring", visualDuration: 0.4, bounce: 0 },
  /** Data easing to a new value: numbers, bar lengths. Slow enough to follow. */
  data: { type: "spring", visualDuration: 0.6, bounce: 0 },
  /** Attention only (the alert bell). The one spring that overshoots. */
  attention: { type: "spring", visualDuration: 0.35, bounce: 0.5 },
} satisfies Record<string, Transition>;

/** Easings for tweens (opacity fades, entrances). */
export const ease = {
  /** Decelerate: things arriving. Fast start, gentle landing. */
  out: [0.22, 1, 0.36, 1],
  /** Accelerate: things leaving. Gets out of the way quickly. */
  in: [0.4, 0, 1, 1],
} as const;

export const duration = {
  fast: 0.12,
  base: 0.2,
  slow: 0.35,
} as const;

/** A plain opacity fade for overlays and menus. */
export const fade: Transition = { duration: duration.fast, ease: "linear" };
