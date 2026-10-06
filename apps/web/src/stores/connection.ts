import { create } from "zustand";

/**
 * Realtime connection status. Phase 4's WebSocket client writes to this;
 * the top-bar indicator only reads `status`, so it re-renders only when the
 * status itself changes.
 */
export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline";

interface ConnectionState {
  status: ConnectionStatus;
  /** When reconnecting: epoch ms of the next attempt. */
  retryAt: number | null;
  setStatus(status: ConnectionStatus, retryAt?: number | null): void;
}

export const useConnectionStore = create<ConnectionState>()((set) => ({
  status: "offline",
  retryAt: null,
  setStatus: (status, retryAt = null) => set({ status, retryAt }),
}));
