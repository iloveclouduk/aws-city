// S3 Lake's catch (pure: no Phaser, no store): a round deals a mix of storage classes, never more than `max` of one,
// so a round of five isn't four "Standard" fish. Swaps keep the dealt tiers (a swap comes from the same tier when it can).

/**
 * `dealt` with any class past `max` swapped for unused fish of the other classes from `pool`, in the dealt tier range.
 * Keeps the order; a class only stays over `max` when the pool has nothing else to give.
 */
export function mixCatch<T extends { answer: string; tier: number }>(dealt: T[], pool: readonly T[], max = 2, rand: () => number = Math.random): T[] {
  const out = [...dealt];
  const tiers = dealt.map((d) => d.tier);
  const [lo, hi] = [Math.min(...tiers), Math.max(...tiers)];
  const count = (a: string) => out.filter((x) => x.answer === a).length;
  for (let i = 0; i < out.length; i++) {
    if (count(out[i].answer) <= max) continue;
    const spare = pool.filter((p) => p.tier >= lo && p.tier <= hi && !out.includes(p) && count(p.answer) < max);
    if (!spare.length) break;
    const same = spare.filter((p) => p.tier === out[i].tier);
    const from = same.length ? same : spare;
    out[i] = from[Math.floor(rand() * from.length)];
  }
  return out;
}
