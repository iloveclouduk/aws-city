// Helpers every station reducer shares. Pure: the UI passes a seed, so a round deals the same way every time it's
// replayed with that seed (and tests can script a player).
import { mulberry32 } from '@/game/rng';

/** Indices 0..n-1 in a seeded order (Fisher-Yates). */
export function shuffledIndices(n: number, seed: number): number[] {
  const rnd = mulberry32(seed);
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A seeded order that never comes out already right (so an order puzzle always has work to do). */
export function unsolvedOrder(n: number, seed: number): number[] {
  const out = shuffledIndices(n, seed);
  if (n > 1 && out.every((v, i) => v === i)) out.push(out.shift()!);
  return out;
}

/** The clock ran out. Every station's reducer takes it; Games without a clock never sends it. */
export interface TimeUp {
  type: 'timeUp';
}
