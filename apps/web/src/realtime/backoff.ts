/**
 * Exponential backoff with "full jitter" (AWS Architecture Blog, 2015):
 *   delay = random(0, min(cap, base * 2^attempt))
 *
 * Exponential: a server that's down isn't hammered by retries.
 * Jitter: after a deploy, thousands of clients don't all reconnect in the
 * same millisecond (the "thundering herd").
 */
export function backoffDelay(
  attempt: number,
  { baseMs = 500, capMs = 30_000, random = Math.random }: { baseMs?: number; capMs?: number; random?: () => number } = {},
): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** attempt);
  // Never retry instantly: at least 250ms (or the ceiling, if it's smaller).
  return Math.max(Math.min(250, ceiling), Math.round(random() * ceiling));
}
