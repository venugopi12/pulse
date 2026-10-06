import { memo, type ReactNode } from "react";

/**
 * Performance switches for before/after measurements.
 *
 *   /?perf=nobuffer          one store update per WebSocket frame (no 250ms buffer)
 *   /?perf=nomemo            widgets subscribe to the WHOLE live store, no React.memo
 *   /?perf=novirtual         Events page renders every row instead of a window
 *   /?perf=monitor           record renders, frames and long tasks (see monitor.ts)
 *   /?perf=nobuffer,nomemo,monitor   combine them
 *
 * Read once at startup (so components can pick an implementation at module
 * load time) and kept in sessionStorage so they survive navigation.
 * Defaults are the optimized behaviour; flags only ever turn things OFF.
 */
export type PerfFlag = "nobuffer" | "nomemo" | "novirtual" | "monitor";

function readFlags(): Set<PerfFlag> {
  if (typeof window === "undefined") return new Set();
  const fromUrl = new URLSearchParams(window.location.search).get("perf");
  try {
    if (fromUrl !== null) sessionStorage.setItem("pulse-perf", fromUrl);
    const raw = fromUrl ?? sessionStorage.getItem("pulse-perf") ?? "";
    return new Set(raw.split(",").filter(Boolean) as PerfFlag[]);
  } catch {
    return new Set((fromUrl ?? "").split(",").filter(Boolean) as PerfFlag[]);
  }
}

const flags = readFlags();

export const perf = {
  buffer: !flags.has("nobuffer"),
  memo: !flags.has("nomemo"),
  virtual: !flags.has("novirtual"),
  monitor: flags.has("monitor"),
  any: flags.size > 0,
};


/**
 * React.memo, unless ?perf=nomemo. Chosen once at module load, so hooks and
 * component identity stay stable for the whole session.
 */
export function maybeMemo<P extends object>(component: (props: P) => ReactNode): (props: P) => ReactNode {
  return perf.memo ? memo(component) : component;
}
