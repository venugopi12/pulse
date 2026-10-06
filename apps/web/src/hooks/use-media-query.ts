import { useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query. useSyncExternalStore is React's sanctioned
 * way to read an external, changing value without tearing.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
