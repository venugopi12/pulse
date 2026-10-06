import type { AnalyticsEvent, TenantId } from "@pulse/shared";
import type { Store } from "../store/types.js";
import type { TenantBroadcaster } from "./hub.js";

interface PendingBatch {
  firstSeq: number;
  events: AnalyticsEvent[];
}

/**
 * The single entry point for new events.
 *
 * 1. Store the event immediately (it gets its per-tenant sequence number,
 *    and REST/snapshot reads see it right away).
 * 2. Queue it per tenant, and every `flushMs` send each tenant ONE frame
 *    with everything queued. At 20 events/sec and 50ms that's ~1 event per
 *    frame on average, but under bursts it caps frames at 20/sec/tenant
 *    instead of one per event.
 *
 * Each frame carries `firstSeq`; events inside are consecutive, so a client
 * can tell exactly which ones its snapshot already covered and spot gaps.
 */
export function createIngest(store: Store, hub: TenantBroadcaster, { flushMs = 50 } = {}) {
  const pending = new Map<TenantId, PendingBatch>();

  function flush() {
    for (const [tenantId, batch] of pending) {
      hub.publish(tenantId, { type: "events", firstSeq: batch.firstSeq, events: batch.events });
    }
    pending.clear();
  }

  const timer = setInterval(flush, flushMs);
  timer.unref(); // never keep the process alive just for this

  return {
    ingest(event: AnalyticsEvent): void {
      const seq = store.events.append(event);
      const batch = pending.get(event.tenantId);
      if (batch) batch.events.push(event);
      else pending.set(event.tenantId, { firstSeq: seq, events: [event] });
    },
    flush,
    stop() {
      clearInterval(timer);
      flush();
    },
  };
}
export type IngestPipeline = ReturnType<typeof createIngest>;
