/**
 * Mulberry32: a tiny seeded PRNG. Same seed -> same sequence, so demo data
 * is identical on every boot and every machine (great for screenshots/tests).
 */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    between: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    /** Pick an item where each has a relative `weight`. */
    weighted<T extends { weight: number }>(items: readonly T[]): T {
      const total = items.reduce((s, i) => s + i.weight, 0);
      let r = next() * total;
      for (const item of items) {
        r -= item.weight;
        if (r <= 0) return item;
      }
      const last = items[items.length - 1];
      if (!last) throw new Error("weighted() called with no items");
      return last;
    },
  };
}
export type Rng = ReturnType<typeof createRng>;
