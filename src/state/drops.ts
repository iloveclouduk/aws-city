// The Daily Supply Drop (contract v2.15 Progress.drops): once the day's shift is done, one crate to open, once a day
// (v2.16: and a bonus crate for the day's overtime goal). It holds one cosmetic (a decoration or a window colour) and
// nothing else: no coins, no stars, nothing to buy. It never holds something the player already owns, however it was
// won (a crate, a season road, a Codex set, a purchase), and the odds shown (dropOdds) are the real ones over what's
// left. Once every crate item is owned it holds a spare: one more copy of a decoration the city may place (each up to
// MAX_SPARES), so a crate is never empty for long. The roll is seeded by the day and what's owned, so the side panel and
// the tab open the same crate. Pure (tests/drops.test.ts).
import type { Progress, SupplyDrops } from '@/backend/contract';
import { DROP_POOL, type Cosmetic, type Rarity } from './cosmetics';
import { dropsOf, ownedCosmetics } from './rewards';

export { DROP_POOL, dropsOf };

/** How often each rarity comes up while all three have items left, in percent (dropOdds gives the odds now). */
export const DROP_ODDS: Record<Rarity, number> = { common: 70, rare: 25, epic: 5 };
/** Extra copies of one decoration a city may place, won as spares once every crate item is owned. */
export const MAX_SPARES = 3;

/** A crate is ready: today's shift is done and none was opened today. */
export const dropReady = (p: Progress, today: string, shiftDone: boolean) => shiftDone && dropsOf(p).last !== today;
/** The overtime crate is ready: today's overtime goal is done and its crate wasn't opened today. */
export const overtimeReady = (p: Progress, today: string, overtimeDone: boolean) => overtimeDone && dropsOf(p).overtime !== today;

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
const RARITIES: Rarity[] = ['common', 'rare', 'epic'];

/** Crate items not owned yet. */
const left = (owned: ReadonlySet<string>) => DROP_POOL.filter((c) => !owned.has(c.id));

/** Decorations a spare can add a copy of: owned crate decorations still under MAX_SPARES. */
const spareable = (owned: ReadonlySet<string>, spares: Record<string, number>) => DROP_POOL.filter((c) => c.kind === 'decor' && owned.has(c.id) && (spares[c.id] ?? 0) < MAX_SPARES);

export interface DropOdds {
  /** Percent per rarity over what's left (0 for a rarity with nothing left; the rest scaled up to 100). */
  odds: Record<Rarity, number>;
  /** Crate items left to win. */
  left: number;
  /** Nothing left to win: the crate holds a spare copy of a decoration (or, once every spare is won, confetti). */
  spare: boolean;
}

/** The real odds of the next crate for this player (what the crate shows). */
export function dropOdds(p: Progress): DropOdds {
  const rest = left(ownedCosmetics(p));
  const w = RARITIES.map((r) => (rest.some((c) => c.rarity === r) ? DROP_ODDS[r] : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  const odds = { common: 0, rare: 0, epic: 0 } as Record<Rarity, number>;
  if (sum) {
    const pct = w.map((x) => Math.round((x / sum) * 100));
    // Rounding: the largest takes the remainder, so they add up to 100.
    const big = pct.indexOf(Math.max(...pct));
    pct[big]! += 100 - pct.reduce((a, b) => a + b, 0);
    RARITIES.forEach((r, i) => (odds[r] = pct[i]!));
  }
  return { odds, left: rest.length, spare: rest.length === 0 };
}

export interface DropRoll {
  item: Cosmetic;
  /** A spare copy of a decoration already owned (one more may stand in each city). */
  spare?: boolean;
}

/**
 * What a crate holds for a player owning `owned` (every source: rewards.ts ownedCosmetics): a rarity by the odds over
 * what's left, then an item of it; once nothing is left, a spare. Undefined only when every spare is won too.
 * `salt` tells the day's crates apart (the overtime crate).
 */
export function rollDrop(owned: Iterable<string>, today: string, spares: Record<string, number> = {}, salt = ''): DropRoll | undefined {
  const have = new Set(owned);
  const rest = left(have);
  if (rest.length) {
    const w = RARITIES.map((r) => (rest.some((c) => c.rarity === r) ? DROP_ODDS[r] : 0));
    let r = hash(`${today}${salt}|${have.size}`) % w.reduce((a, b) => a + b, 0);
    const i = w.findIndex((x) => (r -= x) < 0);
    const pool = rest.filter((c) => c.rarity === RARITIES[i]);
    return { item: pool[hash(`${today}${salt}:${RARITIES[i]}`) % pool.length]! };
  }
  const extra = spareable(have, spares);
  if (!extra.length) return undefined;
  return { item: extra[hash(`${today}${salt}:spare|${Object.values(spares).reduce((a, b) => a + b, 0)}`) % extra.length]!, spare: true };
}

/**
 * The progress after opening today's crate (`overtime`: the overtime goal's bonus crate), and what it held. Undefined:
 * that crate was already opened today.
 */
export function openDrop(p: Progress, today: string, now = new Date().toISOString(), opts: { overtime?: boolean } = {}): { progress: Progress; item?: Cosmetic; spare?: boolean } | undefined {
  const d = dropsOf(p);
  if (opts.overtime ? d.overtime === today : d.last === today) return undefined;
  const roll = rollDrop(ownedCosmetics(p), today, d.spares, opts.overtime ? ':ot' : '');
  const next: SupplyDrops = { ...d, ...(opts.overtime ? { overtime: today } : { last: today }) };
  if (roll?.spare) next.spares = { ...d.spares, [roll.item.id]: (d.spares?.[roll.item.id] ?? 0) + 1 };
  else if (roll) next.owned = [...d.owned, roll.item.id];
  return { progress: { ...p, drops: next, updatedAt: now }, item: roll?.item, ...(roll?.spare ? { spare: true } : {}) };
}

/** Two copies: the later day opened (each crate), everything either one owns or bought, the higher spare count per decoration. */
export function mergeDrops(a: SupplyDrops | undefined, b: SupplyDrops | undefined): SupplyDrops | undefined {
  if (!a || !b) return a ?? b;
  const later = (x?: string, y?: string) => [x, y].filter(Boolean).sort().at(-1);
  const last = later(a.last, b.last);
  const overtime = later(a.overtime, b.overtime);
  const bought = [...new Set([...(a.bought ?? []), ...(b.bought ?? [])])].sort();
  const spares: Record<string, number> = { ...a.spares };
  for (const [k, n] of Object.entries(b.spares ?? {})) spares[k] = Math.max(spares[k] ?? 0, n);
  return {
    ...(last ? { last } : {}),
    owned: [...new Set([...a.owned, ...b.owned])].sort(),
    ...(overtime ? { overtime } : {}),
    ...(bought.length ? { bought } : {}),
    ...(Object.keys(spares).length ? { spares } : {}),
  };
}
