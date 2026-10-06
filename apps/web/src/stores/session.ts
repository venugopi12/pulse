import { LoginResponseSchema, type LoginResponse, type TenantId } from "@pulse/shared";
import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Multi-tenant sessions, modelled like Slack workspaces:
 * you can be signed in to several organizations at once, each with its OWN
 * token scoped to that tenant. Switching tenant swaps which token is active;
 * it never widens what a single token can see. Server isolation is unchanged.
 */
export type Session = LoginResponse;

interface SessionState {
  sessions: Partial<Record<TenantId, Session>>;
  activeTenantId: TenantId | null;
  addSession(session: Session): void;
  switchTenant(tenantId: TenantId): void;
  signOut(tenantId: TenantId): void;
  signOutAll(): void;
}

const PersistedSchema = z.object({
  sessions: z.record(z.string(), LoginResponseSchema),
  activeTenantId: z.string().nullable(),
});

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: {},
      activeTenantId: null,

      addSession: (session) =>
        set((s) => ({
          sessions: { ...s.sessions, [session.tenant.id]: session },
          activeTenantId: session.tenant.id,
        })),

      switchTenant: (tenantId) => {
        if (get().sessions[tenantId]) set({ activeTenantId: tenantId });
      },

      signOut: (tenantId) =>
        set((s) => {
          const { [tenantId]: _removed, ...rest } = s.sessions;
          const remaining = Object.keys(rest) as TenantId[];
          return {
            sessions: rest,
            activeTenantId: s.activeTenantId === tenantId ? (remaining[0] ?? null) : s.activeTenantId,
          };
        }),

      signOutAll: () => set({ sessions: {}, activeTenantId: null }),
    }),
    {
      name: "pulse-session",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ sessions, activeTenantId }) => ({ sessions, activeTenantId }),
      /**
       * localStorage is user-editable input: validate it like an API response,
       * and drop expired tokens so we never start the app with a dead session.
       */
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted);
        if (!parsed.success) return current;
        const now = Date.now();
        const sessions: Partial<Record<TenantId, Session>> = {};
        for (const session of Object.values(parsed.data.sessions)) {
          if (session.expiresAt > now) sessions[session.tenant.id] = session;
        }
        const active = parsed.data.activeTenantId as TenantId | null;
        const ids = Object.keys(sessions) as TenantId[];
        return {
          ...current,
          sessions,
          activeTenantId: active && sessions[active] ? active : (ids[0] ?? null),
        };
      },
    },
  ),
);

/** The active session, or null. Components re-render only when IT changes. */
export const useActiveSession = (): Session | null =>
  useSessionStore((s) => (s.activeTenantId ? (s.sessions[s.activeTenantId] ?? null) : null));

/** Non-hook accessor for code outside React (e.g. the query client). */
export const getActiveSession = (): Session | null => {
  const { sessions, activeTenantId } = useSessionStore.getState();
  return activeTenantId ? (sessions[activeTenantId] ?? null) : null;
};

/**
 * Use inside the authenticated shell, where a session is guaranteed by the
 * route guard. Throwing here would be a programming error, not a user error.
 */
export function useSession(): Session {
  const session = useActiveSession();
  if (!session) throw new Error("useSession() used outside an authenticated route");
  return session;
}

/** All signed-in sessions as an array. Pair with useShallow to avoid re-renders. */
export const selectSessionList = (s: SessionState): Session[] =>
  Object.values(s.sessions)
    .filter((x): x is Session => x !== undefined)
    .sort((a, b) => a.tenant.name.localeCompare(b.tenant.name));
