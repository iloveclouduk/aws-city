// City Coins (🪙), contract v2.14 Progress.wallet. Stars (⭐) are knowledge: they grow buildings and are never spent.
// Coins are what the player spends (Decorate, later combos and cosmetics), earned by doing things in the city: side
// jobs, mini-game rounds, workshop steps, drawing-board passes and finishing the day's shift. Pure, so it's tested
// without the store (tests/wallet.test.ts).
//
// Both counters only ever go up (spending adds to `spent`, a refund adds to `earned`), so two copies merge by taking
// the higher of each: the side panel and the tab never make coins go negative or hand them out twice. The one cost:
// coins earned on two surfaces in the same moment, before they sync, count once (the larger). They sync within a
// second through storage.local, so in play that's never more than a round's pay.
import type { Progress, Wallet } from '@/backend/contract';
import { FULL_ROUNDS_A_DAY } from '@/learning/gameStars';
import { dayKey } from './progress';

export type { Wallet };

/**
 * What each thing pays, in coins. Balanced so a casual session (the shift, a game round or two, a job) buys a
 * decoration: most cost 4 to 30 (src/state/buildmode.ts CATALOGUE), and a session pays about 40 to 70.
 */
export const COIN_PAY = {
  /** A City Clients side job, once ever per job. */
  job: 15,
  /** A business's level finished (on top of its last job). */
  jobLevel: 40,
  /** A mini-game round that scored, in full for the first FULL_ROUNDS_A_DAY rounds of a game a day (or a new best), half after. */
  round: 6,
  /** A workshop step that paid stars (each step once per mode, ever). */
  workshopStep: 5,
  /** Each service on a passing drawing-board design, once a day per service (at most 8 a design). */
  drawing: 5,
  /** Today's shift finished (worker 1A's shift summary pays it once a day). */
  shift: 30,
  /** v2.15: a service combo found for the first time (it goes into the Service Codex, once ever per combo). */
  combo: 20,
  /** Watch it done: a task whose stars were already paid today still pays a little, the first WATCH_PAID_A_DAY a day. */
  watch: 2,
} as const;

/** Watch it done's small pay (COIN_PAY.watch) counts this many repeats a day, then nothing. */
export const WATCH_PAID_A_DAY = 5;

/**
 * A mini-game round's coins: full (COIN_PAY.round) for the first FULL_ROUNDS_A_DAY rounds of a game a day or a new best,
 * half for the next HALF_ROUNDS_A_DAY, then none (the round still counts, its stars still pay): playing on is for fun
 * and the building, not a coin farm. `roundsToday` counts this round.
 */
export const HALF_ROUNDS_A_DAY = 10;
export function roundCoins(roundsToday: number, newBest: boolean, full = FULL_ROUNDS_A_DAY): number {
  if (newBest || roundsToday <= full) return COIN_PAY.round;
  return roundsToday <= full + HALF_ROUNDS_A_DAY ? Math.ceil(COIN_PAY.round / 2) : 0;
}

/** Days of `log` kept (the server allows 31). */
export const LOG_DAYS = 14;

const EMPTY: Wallet = { earned: 0, spent: 0 };
export const walletOf = (p: Progress): Wallet => p.wallet ?? EMPTY;

/** Coins the player can spend now. */
export const coins = (p: Progress) => Math.max(0, walletOf(p).earned - walletOf(p).spent);

/** Coins earned on `day` (the player's local date). */
export const coinsToday = (p: Progress, day = dayKey()) => walletOf(p).log?.find((l) => l.day === day)?.coins ?? 0;

const trimLog = (log: { day: string; coins: number }[]) => [...log].sort((a, b) => a.day.localeCompare(b.day)).slice(-LOG_DAYS);

const withWallet = (p: Progress, w: Wallet, now?: string): Progress => ({ ...p, wallet: w, ...(now ? { updatedAt: now } : {}) });

/** The progress after earning `n` coins on `day` (whole coins; nothing for 0 or less). */
export function earn(p: Progress, n: number, day = dayKey(), now = new Date().toISOString()): Progress {
  const k = Math.floor(n);
  if (!(k > 0)) return p;
  const w = walletOf(p);
  const log = w.log ?? [];
  const have = log.find((l) => l.day === day);
  const next = have ? log.map((l) => (l.day === day ? { day, coins: l.coins + k } : l)) : [...log, { day, coins: k }];
  return withWallet(p, { ...w, earned: w.earned + k, log: trimLog(next) }, now);
}

/** The progress after spending `n` coins, or undefined when there aren't enough. Spending 0 changes nothing. */
export function spend(p: Progress, n: number, now = new Date().toISOString()): Progress | undefined {
  const k = Math.floor(n);
  if (!(k > 0)) return p;
  if (coins(p) < k) return undefined;
  const w = walletOf(p);
  return withWallet(p, { ...w, spent: w.spent + k }, now);
}

/** Coins given back (a removed decoration's half price, an undone purchase): added to `earned`, never off `spent`. Not logged as earned today. */
export function refund(p: Progress, n: number, now = new Date().toISOString()): Progress {
  const k = Math.floor(n);
  if (!(k > 0)) return p;
  const w = walletOf(p);
  return withWallet(p, { ...w, earned: w.earned + k }, now);
}

/** Takes back coins that were given back (undoing a removal): at most what's left to spend, so `spent` never passes `earned`. */
export function charge(p: Progress, n: number, now = new Date().toISOString()): Progress {
  const k = Math.min(Math.floor(n), coins(p));
  if (!(k > 0)) return p;
  const w = walletOf(p);
  return withWallet(p, { ...w, spent: w.spent + k }, now);
}

/** Two copies of a wallet: the higher of each counter, and of each day's coins (the last LOG_DAYS days). */
export function mergeWallet(a: Wallet | undefined, b: Wallet | undefined): Wallet | undefined {
  if (!a || !b) return a ?? b;
  const days = new Map<string, number>();
  for (const l of [...(a.log ?? []), ...(b.log ?? [])]) days.set(l.day, Math.max(days.get(l.day) ?? 0, l.coins));
  const out: Wallet = { earned: Math.max(a.earned, b.earned), spent: Math.max(a.spent, b.spent) };
  if (days.size) out.log = trimLog([...days].map(([day, c]) => ({ day, coins: c })));
  const refunded = Math.max(a.refunded ?? 0, b.refunded ?? 0);
  if (refunded) out.refunded = refunded;
  const by = { ...a.refundedBy };
  for (const [r, n] of Object.entries(b.refundedBy ?? {})) by[r] = Math.max(by[r] ?? 0, n);
  if (Object.keys(by).length) out.refundedBy = by;
  const shift = [a.shift, b.shift].filter(Boolean).sort().pop();
  if (shift) out.shift = shift;
  return out;
}

/** The progress after today's finished shift pays COIN_PAY.shift: once a day (`wallet.shift` remembers the day), else unchanged. */
export function payShift(p: Progress, day = dayKey(), now = new Date().toISOString()): Progress {
  if (walletOf(p).shift === day) return p;
  const paid = earn(p, COIN_PAY.shift, day, now);
  return withWallet(paid, { ...walletOf(paid), shift: day }, now);
}

/**
 * Decorations cost stars before v2.14 (CityDecor.spent). Stars are never spent now, so the stars they cost come back as
 * coins, once: v2.16 remembers how many were given back city by city (`refundedBy`), so a copy that still carries an old
 * `spent` (another surface, the server, an older client still buying with stars) only ever refunds what's new in that
 * city. A wallet from v2.14/2.15 has only the total (`refunded`): its first v2.16 migration refunds against that total
 * once, then counts per city. The old field is dropped, and each city's `updatedAt` moves on a millisecond so the
 * cleaned copy wins the next merge.
 */
export function migrateWallet(p: Progress): Progress {
  const cities = Object.entries(p.decor ?? {});
  if (!cities.some(([, c]) => c.spent !== undefined)) return p;
  const spentIn = (c: { spent?: number }) => Math.max(0, Math.floor(c.spent ?? 0));
  const w = walletOf(p);
  const by: Record<string, number> = { ...w.refundedBy };
  let back = 0;
  if (w.refundedBy) {
    for (const [r, c] of cities) {
      if (c.spent === undefined) continue;
      back += Math.max(0, spentIn(c) - (by[r] ?? 0));
      by[r] = Math.max(by[r] ?? 0, spentIn(c));
    }
  } else {
    const stars = cities.reduce((n, [, c]) => n + spentIn(c), 0);
    back = Math.max(0, stars - (w.refunded ?? 0));
    for (const [r, c] of cities) if (c.spent !== undefined) by[r] = spentIn(c);
  }
  const decor = Object.fromEntries(
    cities.map(([r, c]) => {
      if (c.spent === undefined) return [r, c];
      const { spent: _old, ...rest } = c;
      return [r, { ...rest, updatedAt: new Date(Date.parse(c.updatedAt) + 1).toISOString() }];
    }),
  );
  const refunded = Math.max(w.refunded ?? 0, Object.values(by).reduce((n, x) => n + x, 0));
  return { ...p, decor, wallet: { ...w, earned: w.earned + back, ...(refunded ? { refunded } : {}), ...(Object.keys(by).length ? { refundedBy: by } : {}) } };
}
