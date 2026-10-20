// The free monthly season roads (contract v2.15, src/state/season.ts; v2.16: open to all, overflow, freeze swap).
import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { claimable, claimStep, fillSeason, mergeSeasons, openSeasons, ROAD_AT, ROAD_END, roadOf, seasonCosmetics, seasonFor, SEASONS, SHIFT_POINTS, THEME_BONUS } from '@/state/season';
import { DROP_POOL } from '@/state/cosmetics';
import { cosmeticById } from '@/state/cosmetics';
import { serviceById } from '@/world/taxonomy';
import sprites from '../public/assets/city/sprites.json' with { type: 'json' };

const hasSprite = (name: string) => name in (sprites as { sprites: Record<string, unknown> }).sprites;

const T = '2026-10-20T10:00:00.000Z';
const base = (extra: Partial<Progress> = {}): Progress => ({ version: 2, landmarks: {}, updatedAt: T, ...extra });

describe('season roads', () => {
  it('has one season a month, each a road of free looks and freezes ending in its landmark', () => {
    expect(SEASONS.map((s) => s.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(SEASONS.map((s) => s.name)).toEqual(expect.arrayContaining(['Serverless Spring', 'Data Lake Summer']));
    for (const s of SEASONS) {
      const road = roadOf(s);
      expect(road.map((r) => r.at)).toEqual([...ROAD_AT]);
      expect(road.at(-1)!.reward).toEqual({ kind: 'cosmetic', id: s.landmark });
      for (const r of road) if (r.reward.kind === 'cosmetic') expect(cosmeticById(r.reward.id), `${s.id}: ${r.reward.id}`).toBeTruthy();
      for (const id of s.services) expect(serviceById(id), `${s.id}: ${id}`).toBeTruthy();
    }
    expect(seasonFor('2026-03-14').name).toBe('Serverless Spring');
    expect(seasonFor('2026-06-01').name).toBe('Data Lake Summer');
  });

  it('every reward is a sprite in the atlas', () => {
    for (const s of SEASONS) for (const r of roadOf(s)) if (r.reward.kind === 'cosmetic') for (const v of cosmeticById(r.reward.id)!.variants ?? []) expect(hasSprite(v), v).toBe(true);
  });

  it('a finished shift fills one road once a day, more when it grew a theme service', () => {
    const s = seasonFor('2026-10-20');
    let p = fillSeason(base(), s.id, '2026-10-20', ['s3'], T);
    expect(p.seasons?.[s.id]).toEqual({ points: SHIFT_POINTS, claimed: [], last: '2026-10-20' });
    // The same day, on any road: nothing more.
    expect(fillSeason(p, s.id, '2026-10-20', [], T)).toBe(p);
    expect(fillSeason(p, 'serverless-spring', '2026-10-20', [], T)).toBe(p);
    p = fillSeason(p, s.id, '2026-10-21', [s.services[0]], T);
    expect(p.seasons?.[s.id]?.points).toBe(SHIFT_POINTS * 2 + THEME_BONUS);
    expect(fillSeason(p, 'no-such-season', '2026-10-22')).toBe(p);
  });

  it('claims each reached step once; the cosmetics claimed are owned', () => {
    const id = 'serverless-spring';
    const p = base({ seasons: { [id]: { points: 30, claimed: [] } } });
    expect(claimable(p, id)).toEqual([0, 1, 2]);
    expect(claimStep(p, id, 3)).toBeUndefined();
    const r = claimStep(p, id, 1, T)!;
    expect(r.reward).toEqual({ kind: 'cosmetic', id: 'blossom' });
    expect(claimable(r.progress, id)).toEqual([0, 2]);
    expect(claimStep(r.progress, id, 1)).toBeUndefined();
    expect(claimStep(r.progress, id, 0)!.reward).toEqual({ kind: 'freeze' });
    expect(seasonCosmetics(r.progress)).toEqual(['blossom']);
  });

  it('opens every road to everyone: this month first, then the months before it (no City Hall level needed)', () => {
    const open = openSeasons(base(), '2026-10-20', 1).map((s) => s.id);
    expect(open).toHaveLength(12);
    expect(open.slice(0, 3)).toEqual(['harvest-streams', 'back-to-builders', 'ai-holiday']);
    expect(openSeasons(base(), '2026-01-05').map((s) => s.id).slice(0, 2)).toEqual(['snowy-security', 'winter-lights']);
  });

  it('a finished road never wastes a shift: its points flow into the next unfinished road', () => {
    const s = seasonFor('2026-10-20');
    // 5 short of the end: 5 go to this road, the rest to last month's.
    let p = fillSeason(base({ seasons: { [s.id]: { points: ROAD_END - 5, claimed: [] } } }), s.id, '2026-10-20', [], T);
    expect(p.seasons?.[s.id]?.points).toBe(ROAD_END);
    expect(p.seasons?.['back-to-builders']).toEqual({ points: SHIFT_POINTS - 5, claimed: [], last: '2026-10-20' });
    // The next day this road is full: all of it goes on.
    p = fillSeason(p, s.id, '2026-10-21', [], T);
    expect(p.seasons?.[s.id]?.points).toBe(ROAD_END);
    expect(p.seasons?.['back-to-builders']?.points).toBe(2 * SHIFT_POINTS - 5);
    // Still once a day across every road.
    expect(fillSeason(p, s.id, '2026-10-21', [], T)).toBe(p);
    // Every road finished: nothing to fill, the day is still marked.
    const all = base({ seasons: Object.fromEntries(SEASONS.map((x) => [x.id, { points: ROAD_END, claimed: [] }])) });
    const done = fillSeason(all, s.id, '2026-10-22', [], T);
    expect(done.seasons?.[s.id]).toEqual({ points: ROAD_END, claimed: [], last: '2026-10-22' });
  });

  it('a freeze step claimed with the freezes full gives a crate item not owned and not on this road instead', () => {
    const id = 'serverless-spring';
    const s = SEASONS.find((x) => x.id === id)!;
    const p = base({ seasons: { [id]: { points: 30, claimed: [] } } });
    // Freezes not full: a freeze, as ever.
    expect(claimStep(p, id, 0, T, { freezesFull: false })!.reward).toEqual({ kind: 'freeze' });
    const r = claimStep(p, id, 0, T, { freezesFull: true, owned: new Set(['snowman']) })!;
    expect(r.reward.kind).toBe('cosmetic');
    const got = r.reward.kind === 'cosmetic' ? r.reward.id : '';
    expect(DROP_POOL.some((c) => c.id === got && c.kind === 'decor')).toBe(true);
    expect([s.glow, ...s.decor, s.landmark, 'snowman']).not.toContain(got);
    expect(r.progress.seasons?.[id]).toEqual({ points: 30, claimed: [0], extra: [got] });
    expect(seasonCosmetics(r.progress)).toEqual([got]);
    // Every crate item owned: the freeze stays a freeze (nothing else to give).
    expect(claimStep(p, id, 0, T, { freezesFull: true, owned: new Set(DROP_POOL.map((c) => c.id)) })!.reward).toEqual({ kind: 'freeze' });
  });

  it('merges: the higher points, steps claimed in either, the later day paid', () => {
    const m = mergeSeasons({ a: { points: 30, claimed: [0], last: '2026-10-01', extra: ['maple'] } }, { a: { points: 20, claimed: [1], last: '2026-10-03', extra: ['blossom'] }, b: { points: 5, claimed: [] } });
    expect(m).toEqual({ a: { points: 30, claimed: [0, 1], last: '2026-10-03', extra: ['blossom', 'maple'] }, b: { points: 5, claimed: [] } });
  });
});
