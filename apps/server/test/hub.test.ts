import { TenantIdSchema, UserIdSchema, WsCloseCode } from "@pulse/shared";
import { describe, expect, it } from "vitest";
import { createHub, type HubClient } from "../src/realtime/hub.js";

/** Fake socket: lets us unit-test the hub without any network. */
function fakeClient(tenant: string, bufferedAmount = 0) {
  const sent: string[] = [];
  const closed: number[] = [];
  const client: HubClient = {
    auth: {
      tenantId: TenantIdSchema.parse(tenant),
      userId: UserIdSchema.parse(`u_${tenant}`),
      role: "viewer",
      tokenExpiresAt: Date.now() + 60_000,
    },
    bufferedAmount,
    send: (d) => sent.push(d),
    close: (code) => closed.push(code),
  };
  return { client, sent, closed };
}

describe("hub", () => {
  it("publishes only to the target tenant's room", () => {
    const hub = createHub();
    const a = fakeClient("tnt_a");
    const b = fakeClient("tnt_b");
    hub.join(a.client);
    hub.join(b.client);

    hub.publish(TenantIdSchema.parse("tnt_a"), { type: "pong", t: 1 });

    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(0);
  });

  it("drops slow consumers instead of buffering forever", () => {
    const hub = createHub();
    const slow = fakeClient("tnt_a", 5_000_000);
    hub.join(slow.client);
    hub.publish(TenantIdSchema.parse("tnt_a"), { type: "pong", t: 1 });
    expect(slow.sent).toHaveLength(0);
    expect(slow.closed).toEqual([WsCloseCode.SlowConsumer]);
  });

  it("removes empty rooms on leave", () => {
    const hub = createHub();
    const a = fakeClient("tnt_a");
    hub.join(a.client);
    hub.leave(a.client);
    expect(hub.stats()).toEqual([]);
  });
});
