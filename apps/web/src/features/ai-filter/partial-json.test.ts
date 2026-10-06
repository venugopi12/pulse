import { describe, expect, it } from "vitest";
import { parsePartialJson } from "./partial-json";

describe("parsePartialJson", () => {
  it("parses complete JSON unchanged", () => {
    expect(parsePartialJson('{"a":[1,2],"b":"x"}')).toEqual({ a: [1, 2], b: "x" });
  });

  it("closes an open string, array and object", () => {
    expect(parsePartialJson('{"severities":["error"],"sources":["chec')).toEqual({
      severities: ["error"],
      sources: ["chec"],
    });
  });

  it("drops a half-written key", () => {
    expect(parsePartialJson('{"severities":["warn"],"sinceMi')).toEqual({ severities: ["warn"] });
  });

  it("drops a dangling colon or comma", () => {
    expect(parsePartialJson('{"severities":["warn"],')).toEqual({ severities: ["warn"] });
    expect(parsePartialJson('{"sinceMinutes":')).toEqual({});
  });

  it("handles escaped quotes inside strings", () => {
    expect(parsePartialJson('{"notes":["say \\"hi')).toEqual({ notes: ['say "hi'] });
  });

  it("returns a valid value for every prefix of a real answer", () => {
    const full = '{"severities":["error"],"eventTypes":["payment.failed"],"sources":["checkout"],"sinceMinutes":60,"notes":[]}';
    for (let i = 1; i <= full.length; i++) {
      const v = parsePartialJson(full.slice(0, i));
      expect(v === null || typeof v === "object").toBe(true);
    }
    expect(parsePartialJson(full)).toEqual(JSON.parse(full));
  });

  it("returns null for nothing usable", () => {
    expect(parsePartialJson("")).toBeNull();
  });
});
