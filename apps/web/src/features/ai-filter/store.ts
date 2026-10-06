import { isEmptyFilter, type AiFilter, type TenantId } from "@pulse/shared";
import { create } from "zustand";
import { useActiveSession } from "@/stores/session";

export interface ActiveFilter {
  query: string;
  filter: AiFilter;
  source: "ai" | "rules";
  notes: string[];
}

interface FilterState {
  /** One filter per tenant: switching away and back restores it. */
  byTenant: Partial<Record<TenantId, ActiveFilter>>;
  /**
   * Set by ⌘K "Filter in plain English"; the bar focuses itself and clears it.
   * A one-shot flag (not a counter) so the bar doesn't grab focus on every
   * later mount, which on a phone would pop the keyboard up.
   */
  focusPending: boolean;
  apply(tenantId: TenantId, active: ActiveFilter): void;
  update(tenantId: TenantId, filter: AiFilter): void;
  clear(tenantId: TenantId): void;
  requestFocus(): void;
  consumeFocus(): void;
}

export const useFilterStore = create<FilterState>()((set) => ({
  byTenant: {},
  focusPending: false,
  apply: (tenantId, active) => set((s) => ({ byTenant: { ...s.byTenant, [tenantId]: active } })),
  update: (tenantId, filter) =>
    set((s) => {
      const current = s.byTenant[tenantId];
      if (!current) return {};
      if (isEmptyFilter(filter)) {
        const { [tenantId]: _gone, ...rest } = s.byTenant;
        return { byTenant: rest };
      }
      return { byTenant: { ...s.byTenant, [tenantId]: { ...current, filter } } };
    }),
  clear: (tenantId) =>
    set((s) => {
      const { [tenantId]: _gone, ...rest } = s.byTenant;
      return { byTenant: rest };
    }),
  requestFocus: () => set({ focusPending: true }),
  consumeFocus: () => set({ focusPending: false }),
}));

/** The active tenant's filter, or null. */
export function useActiveFilter(): ActiveFilter | null {
  const tenantId = useActiveSession()?.tenant.id;
  return useFilterStore((s) => (tenantId ? (s.byTenant[tenantId] ?? null) : null));
}
