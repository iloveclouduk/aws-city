// The Daily Supply Drop (contract v2.15, src/state/drops.ts; v2.16 real odds, no duplicates, spares, overtime) and the
// cosmetics it gives (src/state/cosmetics.ts).
import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { DROP_ODDS, DROP_POOL, dropOdds, dropReady, MAX_SPARES, mergeDrops, openDrop, overtimeReady, rollDrop } from '@/state/drops';
import { ownedCosmetics } from '@/state/rewards';
import { COSMETICS } from '@/state/cosmetics';
import sprites from '../public/assets/city/sprites.json' with { type: 'json' };

const T = '2026-10-20T10:00:00.000Z';
const base = (extra: Partial<Progress> = {}): Progress => ({ version: 2, landmarks: {}, updatedAt: T, ...extra });
const atlas = (sprites as { sprites: Record<string, unknown> }).sprites;

describe('cosmetics', () => {
  it('are looks only: decorations with real sprites, or window colours; ids unique', () => {
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    for (const c of COSMETICS) {
      expect(['decor', 'glow']).toContain(c.kind);
      if (c.kind === 'decor') for (const v of c.variants ?? []) expect(v in atlas, v).toBe(true);
      else expect(c.color).toBeTypeOf('number');
    }
  });
});

describe('the Daily Supply Drop', () => {
  it('shows its odds, which add up to 100, and never holds a monument (those are earned elsewhere)', () => {
    expect(Object.values(DROP_ODDS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(DROP_POOL.some((c) => c.id.startsWith('mon-'))).toBe(false);
    for (const r of ['common', 'rare', 'epic'] as const) expect(DROP_POOL.some((c) => c.rarity === r), r).toBe(true);
  });

  it('is ready once the shift is done, one a day', () => {
    expect(dropReady(base(), '2026-10-20', false)).toBe(false);
    expect(dropReady(base(), '2026-10-20', true)).toBe(true);
    const r = openDrop(base(), '2026-10-20', T)!;
    expect(r.item).toBeTruthy();
    expect(r.progress.drops).toEqual({ last: '2026-10-20', owned: [r.item!.id] });
    expect(dropReady(r.progress, '2026-10-20', true)).toBe(false);
    expect(openDrop(r.progress, '2026-10-20')).toBeUndefined();
    expect(dropReady(r.progress, '2026-10-21', true)).toBe(true);
  });

  it('holds a cosmetic only (no coins or stars), the same one on every surface, and never one already owned', () => {
    const r = openDrop(base({ wallet: { earned: 5, spent: 0 } }), '2026-10-20', T)!;
    expect(r.progress.wallet).toEqual({ earned: 5, spent: 0 });
    expect(r.progress.landmarks).toEqual({});
    expect(rollDrop([], '2026-10-20')?.item).toEqual(r.item);
    let p = base();
    const got = new Set<string>();
    for (let d = 0; d < DROP_POOL.length; d++) {
      const o = openDrop(p, new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10), T)!;
      expect(o.item).toBeTruthy();
      expect(got.has(o.item!.id)).toBe(false);
      got.add(o.item!.id);
      p = o.progress;
    }
    expect(got.size).toBe(DROP_POOL.length);
  });

  it('never gives what a season road, a Codex set or a purchase already gave (v2.16)', () => {
    // A finished October road gave a maple, a snowy pine, the open-air stage and golden windows; a hedge maze was bought.
    const road = base({ seasons: { 'harvest-streams': { points: 100, claimed: [0, 1, 2, 3, 4, 5, 6, 7] } }, drops: { owned: [], bought: ['hedge-maze'] } });
    const owned = ownedCosmetics(road);
    for (const id of ['maple', 'snowy-pine', 'amphitheatre', 'glow-gold', 'hedge-maze']) expect(owned.has(id), id).toBe(true);
    for (let d = 0; d < 60; d++) {
      const day = new Date(Date.UTC(2026, 9, 1 + d)).toISOString().slice(0, 10);
      const o = openDrop(road, day, T)!;
      expect(owned.has(o.item!.id), `${day}: ${o.item!.id}`).toBe(false);
    }
  });

  it('shows the real odds over what is left, which always add up to 100', () => {
    expect(dropOdds(base())).toEqual({ odds: DROP_ODDS, left: DROP_POOL.length, spare: false });
    // Every epic owned: the odds are over common and rare only.
    const noEpic = base({ drops: { owned: DROP_POOL.filter((c) => c.rarity === 'epic').map((c) => c.id) } });
    const o = dropOdds(noEpic);
    expect(o.odds.epic).toBe(0);
    expect(o.odds.common + o.odds.rare).toBe(100);
    expect(o.odds.common).toBe(Math.round((DROP_ODDS.common / (DROP_ODDS.common + DROP_ODDS.rare)) * 100));
    // And the crate keeps to them: no epic is rolled.
    for (let d = 0; d < 40; d++) expect(openDrop(noEpic, new Date(Date.UTC(2026, 9, 1 + d)).toISOString().slice(0, 10), T)!.item!.rarity).not.toBe('epic');
  });

  it('once every crate item is owned it holds a spare copy of a decoration (one more in each city), up to MAX_SPARES each', () => {
    const all = DROP_POOL.map((c) => c.id);
    let p = base({ drops: { owned: all } });
    expect(dropOdds(p)).toMatchObject({ left: 0, spare: true });
    const decor = DROP_POOL.filter((c) => c.kind === 'decor').length;
    for (let d = 0; d < decor * MAX_SPARES; d++) {
      const o = openDrop(p, new Date(Date.UTC(2027, 0, 1 + d)).toISOString().slice(0, 10), T)!;
      expect(o.spare).toBe(true);
      expect(o.item!.kind).toBe('decor');
      p = o.progress;
    }
    expect(Object.values(p.drops!.spares!).every((n) => n === MAX_SPARES)).toBe(true);
    expect(p.drops!.owned).toEqual(all);
    // Every spare won too: confetti.
    expect(openDrop(p, '2030-01-01', T)!.item).toBeUndefined();
    expect(rollDrop(all, '2030-01-01', p.drops!.spares)).toBeUndefined();
  });

  it('the overtime crate is its own, once a day, and holds a different item from the day’s crate', () => {
    const day = '2026-10-20';
    const first = openDrop(base(), day, T)!;
    expect(overtimeReady(first.progress, day, false)).toBe(false);
    expect(overtimeReady(first.progress, day, true)).toBe(true);
    const ot = openDrop(first.progress, day, T, { overtime: true })!;
    expect(ot.item!.id).not.toBe(first.item!.id);
    expect(ot.progress.drops).toMatchObject({ last: day, overtime: day });
    expect(openDrop(ot.progress, day, T, { overtime: true })).toBeUndefined();
    expect(overtimeReady(ot.progress, day, true)).toBe(false);
  });

  it('merges: the later day opened, everything either owns', () => {
    expect(mergeDrops({ last: '2026-10-01', owned: ['snowman'] }, { last: '2026-10-03', owned: ['maple', 'snowman'] })).toEqual({ last: '2026-10-03', owned: ['maple', 'snowman'] });
    expect(mergeDrops({ owned: [], overtime: '2026-10-02', bought: ['maple'], spares: { maple: 1 } }, { owned: [], bought: ['blossom'], spares: { maple: 2, snowman: 1 } })).toEqual({
      owned: [],
      overtime: '2026-10-02',
      bought: ['blossom', 'maple'],
      spares: { maple: 2, snowman: 1 },
    });
  });
});
