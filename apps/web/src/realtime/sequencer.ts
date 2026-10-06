import type { AnalyticsEvent } from "@pulse/shared";

export type FrameResult =
  | { kind: "apply"; events: AnalyticsEvent[]; nextSeq: number }
  | { kind: "duplicate" }
  | { kind: "gap"; expected: number; got: number };

/**
 * Decide what to do with a live frame, given the next sequence number we
 * expect. Frames hold consecutive events starting at `firstSeq`.
 *
 *   all already seen          -> duplicate (snapshot covered them)
 *   starts after what we need -> gap (we missed some: resync)
 *   overlaps                  -> apply only the unseen tail
 */
export function acceptFrame(nextSeq: number, firstSeq: number, events: AnalyticsEvent[]): FrameResult {
  const lastSeq = firstSeq + events.length - 1;
  if (lastSeq < nextSeq) return { kind: "duplicate" };
  if (firstSeq > nextSeq) return { kind: "gap", expected: nextSeq, got: firstSeq };
  return { kind: "apply", events: events.slice(nextSeq - firstSeq), nextSeq: lastSeq + 1 };
}
