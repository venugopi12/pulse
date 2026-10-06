import { useEffect } from "react";
import { useActiveSession } from "@/stores/session";
import { useUiStore } from "@/stores/ui";
import { useMediaQuery } from "./use-media-query";

/**
 * Keeps <html> in sync with app state:
 *  - `dark` class from the theme preference (resolving "system"),
 *  - `--accent` from the active tenant.
 * Because --accent is a registered <color> property with a CSS transition,
 * setting it here is all it takes to morph the whole UI to the new tenant.
 */
export function useDocumentTheme(): void {
  const theme = useUiStore((s) => s.theme);
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const accent = useActiveSession()?.tenant.accent;

  const dark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const root = document.documentElement.style;
    if (accent) root.setProperty("--accent", accent);
    else root.removeProperty("--accent");
  }, [accent]);
}
