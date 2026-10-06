import type { AnalyticsEvent } from "@pulse/shared";

export interface EventBufferOptions {
  /** Max one state update per this many ms. */
  flushMs: number;
  onFlush: (events: AnalyticsEvent[], now: number) => void;
  /** Called on quiet intervals so time-window KPIs still slide. */
  onIdle?: (now: number) => void;
  idleEveryMs?: number;
}

/**
 * THE key performance idea of the live pipeline.
 *
 * WebSocket frames arrive whenever they arrive (dozens per second). Calling
 * setState for each one means a React render per frame. Instead, frames are
 * pushed into a plain array (no React involved) and a timer moves the whole
 * array into state at most every `flushMs`. 60 events/sec becomes
 * 4 renders/sec, regardless of traffic.
 */
export function createEventBuffer({ flushMs, onFlush, onIdle, idleEveryMs = 1000 }: EventBufferOptions) {
  let pending: AnalyticsEvent[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastUpdate = 0;

  function flush() {
    const now = Date.now();
    if (pending.length > 0) {
      const batch = pending;
      pending = [];
      lastUpdate = now;
      onFlush(batch, now);
    } else if (onIdle && now - lastUpdate >= idleEveryMs) {
      lastUpdate = now;
      onIdle(now);
    }
  }

  return {
    push(events: AnalyticsEvent[]) {
      for (const e of events) pending.push(e);
    },
    clear() {
      pending = [];
    },
    /** For tests / debugging. */
    get size() {
      return pending.length;
    },
    flush,
    start() {
      if (!timer) timer = setInterval(flush, flushMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      pending = [];
    },
  };
}
