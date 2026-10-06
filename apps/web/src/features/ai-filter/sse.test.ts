import { describe, expect, it } from "vitest";
import { createSseParser } from "./sse";

const STREAM =
  'data: {"type":"delta","text":"{\\"sev"}\n\n' +
  'data: {"type":"delta","text":"erities\\":[]}"}\n\n' +
  ": comment lines are ignored\n\n" +
  'event: x\r\ndata: {"type":"error","message":"boom"}\r\n\r\n';

function collect(chunks: string[]): string[] {
  const out: string[] = [];
  const parser = createSseParser((d) => out.push(d));
  for (const c of chunks) parser.feed(c);
  return out;
}

describe("createSseParser", () => {
  it("parses whole events", () => {
    expect(collect([STREAM])).toEqual([
      '{"type":"delta","text":"{\\"sev"}',
      '{"type":"delta","text":"erities\\":[]}"}',
      '{"type":"error","message":"boom"}',
    ]);
  });

  it("gives the same result however the network splits the bytes", () => {
    const expected = collect([STREAM]);
    for (let size = 1; size <= 17; size++) {
      const chunks: string[] = [];
      for (let i = 0; i < STREAM.length; i += size) chunks.push(STREAM.slice(i, i + size));
      expect(collect(chunks)).toEqual(expected);
    }
  });

  it("holds an unfinished event until its blank line arrives", () => {
    const out: string[] = [];
    const parser = createSseParser((d) => out.push(d));
    parser.feed('data: {"a":1}\n');
    expect(out).toEqual([]);
    parser.feed("\n");
    expect(out).toEqual(['{"a":1}']);
  });
});
