import { useEffect } from "react";
import { perf } from "@/perf/flags";
import { api } from "@/lib/api";
import { qk, queryClient } from "@/lib/query-client";
import { useConnectionStore } from "@/stores/connection";
import { useLiveStore } from "@/stores/live";
import { useSession, useSessionStore } from "@/stores/session";
import { createEventBuffer } from "./event-buffer";
import { acceptFrame } from "./sequencer";
import { RealtimeSocket } from "./socket";

/** Max one live-state update per this many ms. */
export const FLUSH_MS = 250;
const SNAPSHOT_MINUTES = 360;

/**
 * Runs the live pipeline for the active tenant. Mounted once, in AppShell.
 *
 *   WebSocket frame -> sequence check -> buffer -> (every 250ms) live store
 *
 * On every (re)connect: load a snapshot, then apply only frames AFTER the
 * snapshot's sequence number. Frames that arrive while the snapshot is
 * loading are held, then filtered the same way. If a sequence gap appears
 * (we missed something), resync from a fresh snapshot.
 *
 * Switching tenant changes `tenantId`, which tears all of this down and
 * starts again for the new tenant: one socket per active tenant.
 */
export function useRealtime(): void {
  const { token, expiresAt, tenant } = useSession();
  const tenantId = tenant.id;

  useEffect(() => {
    const live = useLiveStore.getState();
    const setStatus = useConnectionStore.getState().setStatus;
    live.reset(tenantId);

    let disposed = false;
    let nextSeq: number | null = null; // null = waiting for a snapshot
    let held: { firstSeq: number; events: Parameters<typeof acceptFrame>[2] }[] = [];
    let resyncId = 0;

    const buffer = createEventBuffer({
      flushMs: FLUSH_MS,
      onFlush: (events, now) => useLiveStore.getState().applyBatch(events, now),
      onIdle: (now) => useLiveStore.getState().tick(now),
    });

    function handleFrame(firstSeq: number, events: Parameters<typeof acceptFrame>[2]) {
      if (nextSeq === null) {
        held.push({ firstSeq, events });
        return;
      }
      const result = acceptFrame(nextSeq, firstSeq, events);
      if (result.kind === "apply") {
        nextSeq = result.nextSeq;
        if (perf.buffer) buffer.push(result.events);
        // ?perf=nobuffer: the naive way, one store update per frame (for comparison).
        else useLiveStore.getState().applyBatch(result.events, Date.now());
      } else if (result.kind === "gap") {
        void resync();
      }
    }

    async function resync() {
      const id = ++resyncId;
      nextSeq = null;
      held = [];
      buffer.clear();
      try {
        const snapshot = await api.liveSnapshot(token, SNAPSHOT_MINUTES);
        if (disposed || id !== resyncId) return; // a newer resync superseded this one
        useLiveStore.getState().hydrate(snapshot);
        nextSeq = snapshot.seq + 1;
        const frames = held;
        held = [];
        for (const f of frames) handleFrame(f.firstSeq, f.events);
      } catch {
        // The socket's own reconnect loop will call resync again on the next hello.
      }
    }

    const socket = new RealtimeSocket(token, expiresAt, {
      onStatus: setStatus,
      onReady: () => void resync(),
      onEvents: handleFrame,
      // An admin saved the dashboard somewhere: update the cache in place,
      // every viewer of this tenant sees it without refetching.
      onDashboardUpdated: (dashboard) => queryClient.setQueryData(qk.dashboard(tenantId, dashboard.id), dashboard),
      onAuthExpired: () => useSessionStore.getState().signOut(tenantId),
    });

    socket.start();
    buffer.start();
    return () => {
      disposed = true;
      socket.stop();
      buffer.stop();
      setStatus("offline");
    };
  }, [tenantId, token, expiresAt]);
}
