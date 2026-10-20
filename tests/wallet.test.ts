// City Coins (contract v2.14, src/state/wallet.ts): earning, spending, the merge and the one-time decor refund.
import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { charge, COIN_PAY, coins, coinsToday, earn, HALF_ROUNDS_A_DAY, LOG_DAYS, mergeWallet, migrateWallet, payShift, refund, roundCoins, spend } from '@/state/wallet';
import { FULL_ROUNDS_A_DAY } from '@/learning/gameStars';
import { mergeProgress } from '@/state/progress';
import { CATALOGUE } from '@/state/buildmode';

const T0 = '2026-10-19T10:00:00.000Z';
const base = (extra: Partial<Progress> = {}): Progress => ({ version: 2, landmarks: { s3: { discovered: true, xp: 300 } }, updatedAt: T0, ...extra });

describe('the wallet', () => {
  it('earns into today, spends only what it has, and never touches stars', () => {
    let p = earn(base(), 15, '2026-10-19', T0);
    p = earn(p, 6, '2026-10-19', T0);
    p = earn(p, 5, '2026-10-20', T0);
    expect(coins(p)).toBe(26);
    expect(coinsToday(p, '2026-10-19')).toBe(21);
    expect(coinsToday(p, '2026-10-20')).toBe(5);
    expect(coinsToday(p, '2026-10-21')).toBe(0);
    expect(spend(p, 27)).toBeUndefined();
    const q = spend(p, 20, T0)!;
    expect(coins(q)).toBe(6);
    expect(q.wallet).toMatchObject({ earned: 26, spent: 20 });
    expect(q.landmarks.s3.xp).toBe(300);
    // Nothing for nothing: 0, negatives and fractions below 1 change nothing.
    expect(earn(p, 0)).toBe(p);
    expect(earn(p, -4)).toBe(p);
    expect(spend(p, 0)).toBe(p);
  });

  it('keeps the last two weeks of daily coins', () => {
    let p = base();
    for (let d = 1; d <= 20; d++) p = earn(p, d, `2026-10-${String(d).padStart(2, '0')}`, T0);
    expect(p.wallet!.log).toHaveLength(LOG_DAYS);
    expect(p.wallet!.log![0].day).toBe('2026-10-07');
    expect(p.wallet!.earned).toBe(210);
  });

  it('refunds add to earned and charges add to spent, so both counters only go up', () => {
    const p = spend(earn(base(), 50, '2026-10-19', T0), 40, T0)!;
    const r = refund(p, 10, T0);
    expect(r.wallet).toMatchObject({ earned: 60, spent: 40 });
    expect(coinsToday(r, '2026-10-19')).toBe(50); // a refund isn't earned today
    // Taking a refund back never spends more than there is.
    expect(charge(r, 100, T0).wallet).toMatchObject({ earned: 60, spent: 60 });
  });

  it('merges as the higher of each counter and of each day, in any order', () => {
    const a = { earned: 100, spent: 30, log: [{ day: '2026-10-18', coins: 40 }, { day: '2026-10-19', coins: 10 }] };
    const b = { earned: 90, spent: 45, log: [{ day: '2026-10-19', coins: 25 }], refunded: 12 };
    const m = mergeWallet(a, b);
    expect(m).toEqual({ earned: 100, spent: 45, log: [{ day: '2026-10-18', coins: 40 }, { day: '2026-10-19', coins: 25 }], refunded: 12 });
    expect(mergeWallet(b, a)).toEqual(m);
    expect(mergeWallet(undefined, a)).toBe(a);
    // Never negative: each copy spent no more than it earned, so the merge can't either.
    expect(m!.spent).toBeLessThanOrEqual(m!.earned);
    expect(mergeProgress(base({ wallet: a }), base({ wallet: b })).wallet).toEqual(m);
  });

  it('a spend on one surface survives a merge with a copy that never saw it', () => {
    const shared = earn(base(), 100, '2026-10-19', T0);
    const panel = spend(shared, 30, '2026-10-19T10:01:00.000Z')!;
    const m = mergeProgress(shared, panel);
    expect(coins(m)).toBe(70);
  });

  it('a finished shift pays once a day, even after the panel and the tab merge', () => {
    const day = '2026-10-19';
    const panel = payShift(base(), day, T0);
    expect(coins(panel)).toBe(COIN_PAY.shift);
    expect(coinsToday(panel, day)).toBe(COIN_PAY.shift);
    expect(payShift(panel, day, T0)).toBe(panel);
    // The tab sees the panel's copy: the day is marked, so it doesn't pay again.
    const tab = mergeProgress(base(), panel);
    expect(payShift(tab, day, T0)).toBe(tab);
    // The next day pays again; the later day wins a merge.
    const next = payShift(panel, '2026-10-20', T0);
    expect(coins(next)).toBe(2 * COIN_PAY.shift);
    expect(mergeWallet(next.wallet, panel.wallet)?.shift).toBe('2026-10-20');
  });
});

describe('the one-time refund of decorations bought with stars', () => {
  const props = [{ id: 'd1', kind: 'deco:oak', x: 1, y: 1, at: '2026-10-18' }];
  const old = base({ decor: { 'us-west-2': { updatedAt: T0, props, spent: 25 }, 'eu-west-1': { updatedAt: T0, props: [], spent: 5 } } });

  it('gives the stars back as coins, keeps the decorations and drops the old field', () => {
    const p = migrateWallet(old);
    expect(coins(p)).toBe(30);
    expect(p.wallet).toEqual({ earned: 30, spent: 0, refunded: 30, refundedBy: { 'us-west-2': 25, 'eu-west-1': 5 } });
    expect(p.decor!['us-west-2']).toEqual({ updatedAt: '2026-10-19T10:00:00.001Z', props });
    expect(p.decor!['eu-west-1'].spent).toBeUndefined();
    expect(migrateWallet(p)).toBe(p);
    // Stars are untouched.
    expect(p.landmarks.s3.xp).toBe(300);
  });

  it('never pays twice: an older copy still carrying `spent` merges back in without a second refund', () => {
    const p = migrateWallet(old);
    const merged = migrateWallet(mergeProgress(p, old));
    expect(coins(merged)).toBe(30);
    expect(migrateWallet(mergeProgress(old, p))).toEqual(merged);
  });

  it('an older client that spent more stars afterwards gets only the new ones back', () => {
    const p = migrateWallet(old);
    const later = base({ decor: { 'us-west-2': { updatedAt: '2026-10-19T12:00:00.000Z', props, spent: 37 }, 'eu-west-1': { updatedAt: '2026-10-19T12:00:00.000Z', props: [], spent: 5 } } });
    expect(coins(migrateWallet(mergeProgress(p, later)))).toBe(42);
  });

  it('counts the refund city by city: an older client buying more in one city is refunded those, even when the other city has no old field left (v2.16)', () => {
    const p = migrateWallet(old);
    // An older client spent 15 more stars in eu-west-1; us-west-2's copy no longer carries `spent` (already migrated).
    const later = base({ decor: { 'eu-west-1': { updatedAt: '2026-10-19T12:00:00.000Z', props: [], spent: 20 } } });
    const m = migrateWallet(mergeProgress(p, later));
    expect(coins(m)).toBe(45);
    expect(m.wallet?.refundedBy).toEqual({ 'us-west-2': 25, 'eu-west-1': 20 });
    // Before v2.16 the total (20) was compared with everything refunded (30): those 15 stars were lost.
    expect(migrateWallet(m)).toBe(m);
  });

  it('a v2.15 wallet (a total only) refunds against that total once, then city by city', () => {
    const v215 = base({ wallet: { earned: 30, spent: 0, refunded: 30 }, decor: { 'us-west-2': { updatedAt: T0, props, spent: 25 }, 'eu-west-1': { updatedAt: T0, props: [], spent: 9 } } });
    const m = migrateWallet(v215);
    expect(coins(m)).toBe(34);
    expect(m.wallet?.refundedBy).toEqual({ 'us-west-2': 25, 'eu-west-1': 9 });
  });

  it('merges the per-city refunds by the higher of each', () => {
    expect(mergeWallet({ earned: 1, spent: 0, refundedBy: { a: 3, b: 1 } }, { earned: 1, spent: 0, refundedBy: { b: 4 } })?.refundedBy).toEqual({ a: 3, b: 4 });
  });

  it('leaves a save without old decorations alone', () => {
    const p = base({ decor: { 'us-west-2': { updatedAt: T0, props } } });
    expect(migrateWallet(p)).toBe(p);
  });
});

describe('the pay table', () => {
  it('a casual session (the shift, two rounds, a job) buys a decoration, and most decorations cost less than one', () => {
    const session = COIN_PAY.shift + 2 * COIN_PAY.round + COIN_PAY.job;
    const prices = CATALOGUE.map((it) => it.price).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    expect(session).toBeGreaterThanOrEqual(median);
    expect(session).toBeLessThan(prices.at(-1)!); // the biggest ones are worth saving up for
  });
});

describe('mini-game round coins', () => {
  it('pay in full for the first rounds a day or a new best, half for the next few, then nothing', () => {
    const paid = Array.from({ length: 20 }, (_, i) => roundCoins(i + 1, false));
    expect(paid.slice(0, FULL_ROUNDS_A_DAY).every((c) => c === COIN_PAY.round)).toBe(true);
    expect(paid.slice(FULL_ROUNDS_A_DAY, FULL_ROUNDS_A_DAY + HALF_ROUNDS_A_DAY).every((c) => c === Math.ceil(COIN_PAY.round / 2))).toBe(true);
    expect(paid.slice(FULL_ROUNDS_A_DAY + HALF_ROUNDS_A_DAY).every((c) => c === 0)).toBe(true);
    // A day's most from one game, however long it's played.
    expect(paid.reduce((a, b) => a + b, 0)).toBe(FULL_ROUNDS_A_DAY * COIN_PAY.round + HALF_ROUNDS_A_DAY * Math.ceil(COIN_PAY.round / 2));
    // A new best always pays in full.
    expect(roundCoins(50, true)).toBe(COIN_PAY.round);
  });
});
