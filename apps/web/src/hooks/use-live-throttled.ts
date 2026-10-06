import { useEffect, useRef, useState } from "react";
import { perf } from "@/perf/flags";
import { useLiveStore } from "@/stores/live";

type LiveState = ReturnType<typeof useLiveStore.getState>;

/**
 * Subscribe to a value DERIVED from the live store, but re-render at most
 * once per `intervalMs`, and only if `isEqual` says the value changed.
 *
 * KPIs use plain selectors (a rounded number rarely changes). Charts derive
 * whole arrays that change on every 250ms flush; 1 redraw/sec is plenty for
 * a 6-hour chart and saves 3 of every 4 renders.
 *
 * Leading + trailing: the first change renders immediately, and the last
 * change in a burst is never dropped.
 */
function useLiveThrottledImpl<T>(
  select: (s: LiveState) => T,
  intervalMs: number,
  isEqual: (a: T, b: T) => boolean,
): T {
  const selectRef = useRef(select);
  const equalRef = useRef(isEqual);
  selectRef.current = select;
  equalRef.current = isEqual;

  const [value, setValue] = useState(() => select(useLiveStore.getState()));
  const valueRef = useRef(value);

  useEffect(() => {
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;

    const update = () => {
      trailing = null;
      last = Date.now();
      const next = selectRef.current(useLiveStore.getState());
      if (!equalRef.current(valueRef.current, next)) {
        valueRef.current = next;
        setValue(next);
      }
    };
    // Recompute right away in case the store changed between render and effect.
    update();

    const unsubscribe = useLiveStore.subscribe(() => {
      if (trailing) return;
      const wait = intervalMs - (Date.now() - last);
      if (wait <= 0) update();
      else trailing = setTimeout(update, wait);
    });
    return () => {
      unsubscribe();
      if (trailing) clearTimeout(trailing);
    };
  }, [intervalMs]);

  return value;
}

/** ?perf=nomemo: whole-store subscription, recompute on every update. */
function useLiveEveryUpdate<T>(select: (s: LiveState) => T): T {
  return select(useLiveStore());
}

export const useLiveThrottled: <T>(
  select: (s: LiveState) => T,
  intervalMs: number,
  isEqual: (a: T, b: T) => boolean,
) => T = perf.memo ? useLiveThrottledImpl : useLiveEveryUpdate;
