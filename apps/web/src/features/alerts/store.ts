import type { AlertLevel, Unit } from "@pulse/shared";
import { create } from "zustand";

export interface AlertRecord {
  id: string;
  widgetId: string;
  title: string;
  level: Exclude<AlertLevel, "ok">;
  value: number | null;
  unit: Unit;
  startedAt: number;
  resolvedAt: number | null;
}

const MAX_HISTORY = 30;

interface AlertsState {
  /** Current confirmed level per widget: drives the card glow. */
  levels: Record<string, AlertLevel>;
  /** Newest first; open alerts have resolvedAt === null. */
  history: AlertRecord[];
  /** Alerts raised since the user last opened the bell menu. */
  unseen: number;
  reset(): void;
  raise(alert: Omit<AlertRecord, "id" | "resolvedAt">): void;
  resolve(widgetId: string, at: number): void;
  markSeen(): void;
  closeAll(at: number): void;
}

/** Alerts for the ACTIVE tenant. Reset on tenant switch. */
export const useAlertsStore = create<AlertsState>()((set) => ({
  levels: {},
  history: [],
  unseen: 0,
  reset: () => set({ levels: {}, history: [], unseen: 0 }),

  raise: (a) =>
    set((s) => {
      // Escalation (warn -> critical) closes the warn record and opens a critical one.
      const history = s.history.map((h) =>
        h.widgetId === a.widgetId && h.resolvedAt === null ? { ...h, resolvedAt: a.startedAt } : h,
      );
      const record: AlertRecord = { ...a, id: `${a.widgetId}-${a.startedAt}`, resolvedAt: null };
      return {
        levels: { ...s.levels, [a.widgetId]: a.level },
        history: [record, ...history].slice(0, MAX_HISTORY),
        unseen: s.unseen + 1,
      };
    }),

  resolve: (widgetId, at) =>
    set((s) => ({
      levels: { ...s.levels, [widgetId]: "ok" },
      history: s.history.map((h) => (h.widgetId === widgetId && h.resolvedAt === null ? { ...h, resolvedAt: at } : h)),
    })),

  markSeen: () => set({ unseen: 0 }),

  closeAll: (at) =>
    set((s) => ({
      levels: {},
      history: s.history.map((h) => (h.resolvedAt === null ? { ...h, resolvedAt: at } : h)),
    })),
}));
