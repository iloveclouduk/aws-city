// City Lights, the forgiving streak (contract v2.15, src/state/lights.ts; v2.16 freeze counters).
import { describe, expect, it } from 'vitest';
import type { CityLights } from '@/backend/contract';
import { addFreeze, FREEZE_EVERY, freezeCounters, heldFreezes, KEEP_DAYS, lightDay, lightsLine, lightsOf, lightsView, MAX_FREEZES, mergeLights, windowStates } from '@/state/lights';
import { mergeProgress } from '@/state/progress';

const days = (from: string, n: number) => {
  let l: CityLights | undefined;
  const [y, m, d] = from.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    const t = new Date(Date.UTC(y!, m! - 1, d! + i));
    l = lightDay(l, t.toISOString().slice(0, 10));
  }
  return l!;
};

describe('City Lights', () => {
  it('lights one window a learning day; the same day changes nothing', () => {
    const a = lightDay(undefined, '2026-10-01');
    expect(a).toEqual({ days: ['2026-10-01'], total: 1, freezes: 0, freezesEarned: 0, freezesUsed: 0 });
    expect(lightDay(a, '2026-10-01')).toBe(a);
    const v = lightsView(lightDay(a, '2026-10-02'), '2026-10-02');
    expect(v).toMatchObject({ total: 2, glowing: 2, dim: 0, tonight: true, run: 2 });
  });

  it('earns a freeze every 7 learning days, at most 3', () => {
    expect(days('2026-10-01', FREEZE_EVERY - 1).freezes).toBe(0);
    expect(days('2026-10-01', FREEZE_EVERY).freezes).toBe(1);
    expect(days('2026-08-01', FREEZE_EVERY * 5).freezes).toBe(MAX_FREEZES);
    expect(addFreeze(days('2026-08-01', FREEZE_EVERY * 5)).full).toBe(true);
    expect(addFreeze(undefined)).toEqual({ lights: { days: [], freezes: 1, freezesEarned: 1, freezesUsed: 0 }, full: false });
    // Counters: 5 earned by playing would be more than 3 held, so the ones past the cap were never earned.
    expect(freezeCounters(days('2026-08-01', FREEZE_EVERY * 5))).toEqual({ earned: MAX_FREEZES, used: 0 });
  });

  it('a missed day dims one window and the next learning day relights it: nothing is ever taken away', () => {
    const l = lightDay(lightDay(undefined, '2026-10-01'), '2026-10-02');
    // Two days missed, not back yet: two windows dim, the total stays.
    const away = lightsView(l, '2026-10-05');
    expect(away).toMatchObject({ total: 2, dim: 2, glowing: 0, tonight: false, run: 0 });
    expect(lightsLine(away)).toMatch(/learn today to relight one/);
    // Back: tonight's window lights and relights one.
    const back = lightsView(lightDay(l, '2026-10-05'), '2026-10-05');
    expect(back).toMatchObject({ total: 3, dim: 1, glowing: 2, tonight: true });
    // Another day: the last dim one relights.
    const later = lightsView(lightDay(lightDay(l, '2026-10-05'), '2026-10-06'), '2026-10-06');
    expect(later).toMatchObject({ total: 4, dim: 0, glowing: 4 });
  });

  it('a freeze held covers a missed day, so no window dims (and the run holds)', () => {
    const l = days('2026-10-01', 7); // 1 freeze
    expect(lightsView(l, '2026-10-09')).toMatchObject({ dim: 0, frozen: 1, freezes: 0, run: 8 });
    const back = lightDay(l, '2026-10-09');
    expect(back.freezes).toBe(0);
    expect(back.usedFreezes).toEqual(['2026-10-08']);
    expect(lightsView(back, '2026-10-09')).toMatchObject({ dim: 0, frozen: 1, run: 9, total: 8 });
  });

  it('keeps the last 60 days and never loses the total', () => {
    const l = days('2026-01-01', 80);
    expect(l.days).toHaveLength(KEEP_DAYS);
    expect(lightsView(l, '2026-03-21').total).toBe(80);
  });

  it('a save from before v2.15 takes its windows from the streak', () => {
    expect(lightsOf({ streak: { days: 3, last: '2026-10-10', best: 9 } })).toEqual({ days: ['2026-10-08', '2026-10-09', '2026-10-10'], total: 3, freezes: 0 });
    expect(lightsOf({})).toEqual({ days: [], freezes: 0 });
  });

  it('draws at most the cap: glowing first, then the dimmed and the frozen', () => {
    expect(windowStates({ total: 5, glowing: 3, dim: 2, frozen: 1, freezes: 0, tonight: false, run: 0, toFreeze: 2 })).toEqual(['lit', 'lit', 'lit', 'dim', 'dim', 'frozen']);
    expect(windowStates({ total: 100, glowing: 100, dim: 0, frozen: 0, freezes: 0, tonight: true, run: 1, toFreeze: 1 }, 60)).toHaveLength(60);
  });

  it('merges two copies: every day lit in either, the higher total, the higher of each freeze counter', () => {
    // Two copies from before v2.16: b spent one of a's two freezes on 30 September.
    const a: CityLights = { days: ['2026-10-01', '2026-10-02'], total: 9, freezes: 2 };
    const b: CityLights = { days: ['2026-10-02', '2026-10-03'], total: 3, freezes: 1, usedFreezes: ['2026-09-30'] };
    expect(mergeLights(a, b)).toEqual({ days: ['2026-10-01', '2026-10-02', '2026-10-03'], total: 9, freezes: 1, freezesEarned: 2, freezesUsed: 1, usedFreezes: ['2026-09-30'] });
    expect(mergeLights(a, undefined)).toBe(a);
    const T = '2026-10-03T00:00:00.000Z';
    expect(mergeProgress({ version: 2, landmarks: {}, lights: a, updatedAt: T }, { version: 2, landmarks: {}, lights: b, updatedAt: T }).lights?.days).toHaveLength(3);
  });

  it('a freeze earned on one surface and one spent on the other both count (the same-day merge kept neither before v2.16)', () => {
    const base = days('2026-10-01', FREEZE_EVERY); // one freeze held
    expect(heldFreezes(base)).toBe(1);
    // The panel claims a season road's freeze (2 held); the tab, the same day, does nothing.
    const panel = addFreeze(base).lights;
    expect(heldFreezes(mergeLights(base, panel)!)).toBe(2);
    expect(heldFreezes(mergeLights(panel, base)!)).toBe(2);
    // The tab, after a missed day, spends one; the panel earned one: 1 + 1 − 1 = 1 held.
    const tab = lightDay(base, '2026-10-09');
    expect(heldFreezes(tab)).toBe(0);
    const m = mergeLights(tab, panel)!;
    expect(heldFreezes(m)).toBe(1);
    expect(m.freezes).toBe(1);
    expect(mergeLights(panel, tab)).toEqual(m);
  });
});
