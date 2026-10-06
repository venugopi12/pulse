import { WsCloseCode, type ServerMessage, type TenantId } from "@pulse/shared";
import type { AuthContext } from "../auth/context.js";

/** The only capability routes need: "send this to everyone in tenant X". */
export interface TenantBroadcaster {
  publish(tenantId: TenantId, message: ServerMessage): void;
}

/** What the hub needs from a socket. Keeps the hub testable without `ws`. */
export interface HubClient {
  readonly auth: AuthContext;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(code: number, reason: string): void;
}

export interface Hub extends TenantBroadcaster {
  join(client: HubClient): void;
  leave(client: HubClient): void;
  stats(): { tenantId: TenantId; connections: number }[];
}

/** If a client has this much unsent data queued, it can't keep up: drop it. */
const MAX_BUFFERED_BYTES = 1_000_000;

/**
 * Connections are grouped into one "room" per tenant. publish(tenantId) can
 * only reach that tenant's room — there is no broadcast-to-all method, so a
 * cross-tenant leak would need someone to deliberately add one.
 */
export function createHub(): Hub {
  const rooms = new Map<TenantId, Set<HubClient>>();

  return {
    join(client) {
      const { tenantId } = client.auth;
      let room = rooms.get(tenantId);
      if (!room) {
        room = new Set();
        rooms.set(tenantId, room);
      }
      room.add(client);
    },

    leave(client) {
      const room = rooms.get(client.auth.tenantId);
      room?.delete(client);
      if (room && room.size === 0) rooms.delete(client.auth.tenantId);
    },

    publish(tenantId, message) {
      const room = rooms.get(tenantId);
      if (!room || room.size === 0) return;
      // Serialize ONCE per tenant, not once per client.
      const data = JSON.stringify(message);
      for (const client of room) {
        // Backpressure: a stalled client (bad network, frozen tab) would
        // otherwise make the server buffer messages for it without limit.
        if (client.bufferedAmount > MAX_BUFFERED_BYTES) {
          client.close(WsCloseCode.SlowConsumer, "Client too slow");
          continue;
        }
        client.send(data);
      }
    },

    stats() {
      return [...rooms].map(([tenantId, room]) => ({ tenantId, connections: room.size }));
    },
  };
}
