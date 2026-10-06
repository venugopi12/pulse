import { useEffect, useRef } from "react";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
/** The label to show in the UI: ⌘ on Apple devices, Ctrl elsewhere. */
export const MOD_LABEL = isMac ? "⌘" : "Ctrl";

/**
 * Bind `mod+<key>` (⌘ on macOS, Ctrl elsewhere). The handler is kept in a
 * ref so callers can pass inline functions without re-binding every render.
 */
export function useModHotkey(key: string, handler: (e: KeyboardEvent) => void): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === key) {
        e.preventDefault();
        ref.current(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key]);
}
