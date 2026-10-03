/** A source of numbers in [0, 1). Always injected so results are reproducible. */
export type Rng = () => number;

/**
 * Small, fast, seeded PRNG (mulberry32). Use one seed per lesson or session so the
 * same inputs always produce the same callbacks and orderings.
 */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
