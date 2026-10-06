import { describe, expect, it } from "vitest";
import {
  AiFilterSchema,
  NO_MATCH,
  applyFilterToMetric,
  describeFilter,
  isNoMatch,
  matchesFilter,
  parseFilterRules,
  redactQuery,
  sanitizeFilter,
  type AiFilter,
  type AnalyticsEvent,
} from "../src/index.js";

const NOVA = {
  eventTypes: ["page.view", "cart.item_added", "order.placed", "cart.abandoned", "api.request", "payment.failed", "checkout.error"],
  sources: ["storefront", "checkout"],
};
const ORBIT = {
  eventTypes: ["vehicle.gps_ping", "shipment.created", "shipment.delivered", "package.scanned", "delivery.delayed", "scanner.error"],
  sources: ["fleet", "dispatch", "warehouse"],
};
const f = (p: Partial<AiFilter>): AiFilter => ({ severities: [], eventTypes: [], sources: [], sinceMinutes: null, ...p });

describe("rule-based parser (the fallback)", () => {
  it.each([
    ["errors from checkout in the last hour", NOVA, f({ severities: ["error"], sources: ["checkout"], sinceMinutes: 60 })],
    ["checkout errors", NOVA, f({ severities: ["error"], sources: ["checkout"] })],
    ["failed payments today", NOVA, f({ eventTypes: ["payment.failed"], sinceMinutes: 1440 })],
    ["warnings in the last 15 minutes", NOVA, f({ severities: ["warn"], sinceMinutes: 15 })],
    ["delayed deliveries past 2 hours", ORBIT, f({ eventTypes: ["delivery.delayed"], sinceMinutes: 120 })],
    ["problems in the warehouse", ORBIT, f({ severities: ["warn", "error"], sources: ["warehouse"] })],
  ])("%s", (query, vocab, expected) => {
    expect(parseFilterRules(query, vocab).filter).toEqual(expected);
  });

  it("explains when it found nothing", () => {
    const { filter, notes } = parseFilterRules("show me something nice", NOVA);
    expect(filter).toEqual(f({}));
    expect(notes).toHaveLength(1);
  });
});

describe("sanitizeFilter", () => {
  it("drops values that don't exist for this tenant", () => {
    const { filter, dropped } = sanitizeFilter(
      f({ eventTypes: ["payment.failed", "invented.event"], sources: ["checkout", "fleet"] }),
      NOVA,
    );
    expect(filter.eventTypes).toEqual(["payment.failed"]);
    expect(filter.sources).toEqual(["checkout"]);
    expect(dropped).toEqual(["invented.event", "fleet"]); // "fleet" is ANOTHER tenant's source
  });

  it("the schema rejects anything outside the shape", () => {
    expect(AiFilterSchema.safeParse({ ...f({}), tenantId: "tnt_nova" }).success).toBe(false);
    expect(AiFilterSchema.safeParse(f({ sinceMinutes: 99999 })).success).toBe(false);
  });
});

describe("redactQuery", () => {
  it("removes emails, card-like numbers, IPs and tokens", () => {
    // A fake key, assembled at runtime so the source never contains a
    // key-shaped string (GitHub push protection would flag it).
    const fakeKey = ["sk", "live", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
    const out = redactQuery(`errors for jane@acme.com card 4242 4242 4242 4242 from 10.0.0.12 key ${fakeKey}`);
    expect(out).not.toMatch(/jane|4242|10\.0\.0|sk_live/);
    expect(out).toContain("[email]");
  });

  it("keeps ordinary numbers like time ranges", () => {
    expect(redactQuery("errors in the last 15 minutes")).toBe("errors in the last 15 minutes");
  });
});

describe("applying a filter", () => {
  it("narrows a metric with AND semantics and replaces the window", () => {
    const m = applyFilterToMetric(
      { aggregate: "count", eventTypes: ["order.placed", "payment.failed"], windowMinutes: 60 },
      f({ eventTypes: ["payment.failed"], sources: ["checkout"], sinceMinutes: 15 }),
    );
    expect(m).toEqual({ aggregate: "count", eventTypes: ["payment.failed"], sources: ["checkout"], windowMinutes: 15 });
  });

  it("an empty intersection matches nothing, not everything", () => {
    const m = applyFilterToMetric({ aggregate: "count", eventTypes: ["order.placed"], windowMinutes: 60 }, f({ eventTypes: ["payment.failed"] }));
    expect(m.eventTypes).toEqual([NO_MATCH]);
    expect(isNoMatch(m)).toBe(true);
    expect(isNoMatch({ aggregate: "count", windowMinutes: 5 })).toBe(false);
  });

  it("filters events, including by time", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    const e = { severity: "error", type: "checkout.error", source: "checkout", timestamp: now - 10 * 60_000 } as AnalyticsEvent;
    expect(matchesFilter(e, f({ severities: ["error"], sinceMinutes: 15 }), now)).toBe(true);
    expect(matchesFilter(e, f({ sinceMinutes: 5 }), now)).toBe(false);
    expect(matchesFilter(e, f({ sources: ["storefront"] }), now)).toBe(false);
  });

  it("describes a filter in plain words", () => {
    expect(describeFilter(f({ severities: ["error"], sources: ["checkout"], sinceMinutes: 60 }))).toBe(
      "Errors from checkout in the last hour",
    );
    expect(describeFilter(f({ eventTypes: ["payment.failed"], sinceMinutes: 1440 }))).toBe("payment.failed in the last 24 hours");
  });
});
