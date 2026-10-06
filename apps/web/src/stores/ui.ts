import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "dark" | "light" | "system";

interface UiState {
  theme: ThemePreference;
  sidebarCollapsed: boolean;
  /** Transient UI (not persisted). */
  commandOpen: boolean;
  mobileNavOpen: boolean;
  setTheme(theme: ThemePreference): void;
  toggleSidebar(): void;
  setCommandOpen(open: boolean): void;
  setMobileNavOpen(open: boolean): void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "dark",
      sidebarCollapsed: false,
      commandOpen: false,
      mobileNavOpen: false,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
    }),
    {
      name: "pulse-ui",
      // Only durable preferences survive a reload.
      partialize: ({ theme, sidebarCollapsed }) => ({ theme, sidebarCollapsed }),
    },
  ),
);
