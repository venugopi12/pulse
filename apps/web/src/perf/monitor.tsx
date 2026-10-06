import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";
import { perf } from "./flags";

/**
 * In-app performance monitor, enabled with ?perf=monitor.
 *
 * It records the same things you'd read off React DevTools' Profiler and
 * Chrome's Performance panel, but as numbers a script can collect:
 *   - React commits and render time per <Measure id> (React's Profiler API)
 *   - frames per second and slow frames (requestAnimationFrame timing)
 *   - long tasks: main-thread blocks over 50ms (PerformanceObserver)
 *
 * The Profiler API only reports in development and in the special
 * "profiling" production build (`npm run build:profile`), which is what the
 * load test uses so the numbers reflect production React.
 *
 * Read it from the console: __perf.reset(); …wait…; __perf.snapshot()
 */

interface Counter {
  commits: number;
  ms: number;
}

let started = performance.now();
let counters = new Map<string, Counter>();
let frameTimes: number[] = [];
let longTasks = { count: 0, ms: 0 };

const onRender: ProfilerOnRenderCallback = (id, _phase, actualDuration) => {
  const c = counters.get(id) ?? { commits: 0, ms: 0 };
  c.commits += 1;
  c.ms += actualDuration;
  counters.set(id, c);
};

/** Wraps children in a React Profiler only when monitoring is on. */
export function Measure({ id, children }: { id: string; children: ReactNode }) {
  if (!perf.monitor) return children;
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

export interface PerfSnapshot {
  seconds: number;
  commits: Record<string, Counter>;
  fps: number;
  p95FrameMs: number;
  slowFrames: number;
  longTasks: number;
  longTaskMs: number;
  domNodes: number;
  heapMB: number | null;
}

function snapshot(): PerfSnapshot {
  const seconds = (performance.now() - started) / 1000;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return {
    seconds: Math.round(seconds * 10) / 10,
    commits: Object.fromEntries(
      [...counters].map(([id, c]) => [id, { commits: c.commits, ms: Math.round(c.ms * 10) / 10 }]),
    ),
    fps: Math.round((frameTimes.length / seconds) * 10) / 10,
    p95FrameMs: Math.round(percentile(frameTimes, 95) * 10) / 10,
    slowFrames: frameTimes.filter((t) => t > 50).length,
    longTasks: longTasks.count,
    longTaskMs: Math.round(longTasks.ms),
    domNodes: document.getElementsByTagName("*").length,
    heapMB: memory ? Math.round((memory.usedJSHeapSize / 1048576) * 10) / 10 : null,
  };
}

function reset() {
  started = performance.now();
  counters = new Map();
  frameTimes = [];
  longTasks = { count: 0, ms: 0 };
}

if (perf.monitor && typeof window !== "undefined") {
  let last = performance.now();
  const loop = (now: number) => {
    frameTimes.push(now - last);
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.count += 1;
        longTasks.ms += entry.duration;
      }
    }).observe({ type: "longtask", buffered: false });
  } catch {
    // longtask isn't supported in every browser (Safari, Firefox)
  }

  (window as unknown as { __perf: object }).__perf = { reset, snapshot, flags: perf };
}
