// Juice (round 3 step 2, src/game/juice.ts): the rising run of right answers and where City Lights windows go; the
// gentle return note (src/state/welcome.ts).
import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { nextRun, pitchOf, RUN_GAP_MS, RUN_STEPS, windowSpots, type WindowHost } from '@/game/juice';
import { noteDue, returnNote } from '@/state/welcome';

describe('a run of right answers', () => {
  it('climbs a step for each right answer, holds at the top, and starts over after a miss or a pause', () => {
    let r = nextRun(undefined, true, 0);
    expect(r.n).toBe(1);
    expect(pitchOf(r.n)).toBe(1);
    r = nextRun(r, true, 1_000);
    expect(r.n).toBe(2);
    expect(pitchOf(2)).toBeCloseTo(2 ** (2 / 12));
    expect(pitchOf(99)).toBeCloseTo(2 ** (RUN_STEPS.at(-1)! / 12));
    expect(nextRun(r, false, 2_000).n).toBe(0);
    expect(nextRun(r, true, 1_000 + RUN_GAP_MS + 1).n).toBe(1);
  });
});

describe('City Lights windows', () => {
  const box = (id: string, solid = () => true): WindowHost => ({ id, x: 100, y: 50, w: 64, h: 80, solid });
  it('spreads windows over the buildings, the same every time, on solid pixels of their walls', () => {
    const a = windowSpots([box('s3'), box('lambda')], 10);
    expect(a).toHaveLength(10);
    expect(new Set(a.map((p) => p.host))).toEqual(new Set(['s3', 'lambda']));
    expect(windowSpots([box('lambda'), box('s3')], 10)).toEqual(a);
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(100 + 64 * 0.2 - 4);
      expect(p.y).toBeGreaterThanOrEqual(50 + 80 * 0.2 - 4);
      expect(p.y).toBeLessThanOrEqual(50 + 80 * 0.8);
    }
    expect(new Set(a.map((p) => `${p.x},${p.y}`)).size).toBe(10);
  });
  it('skips see-through pixels and stops when nothing is left', () => {
    expect(windowSpots([box('empty', () => false)], 5)).toEqual([]);
    expect(windowSpots([], 5)).toEqual([]);
    expect(windowSpots([box('s3')], 0)).toEqual([]);
  });
});

describe('the gentle return note', () => {
  const T = '2026-10-20T10:00:00.000Z';
  const now = Date.parse(T);
  const base = (extra: Partial<Progress> = {}): Progress => ({ version: 2, landmarks: { s3: { discovered: true, xp: 0 } }, updatedAt: T, ...extra });
  it('says what is waiting, positively, and only to a player coming back', () => {
    const p = base({ cards: { 's3-1': { ease: 2.5, interval: 1, reps: 1, due: now - 1000 } }, lights: { days: ['2026-10-18'], freezes: 0 } });
    expect(returnNote({ progress: p, region: 'us-east-1', today: '2026-10-20', now })).toBe('Welcome back! 1 card is ready · a learning day relights a window.');
    // Already learned today: not returning.
    expect(returnNote({ progress: { ...p, lights: { days: ['2026-10-20'], freezes: 0 } }, region: 'us-east-1', today: '2026-10-20', now })).toBeUndefined();
    // Nothing to say: no note.
    expect(returnNote({ progress: base(), region: 'us-east-1', today: '2026-10-20', now })).toBeUndefined();
  });
  it('names a season reward to claim, and shows once a day', () => {
    const p = base({ seasons: { 'harvest-streams': { points: 20, claimed: [0] } } });
    expect(returnNote({ progress: p, region: 'us-east-1', today: '2026-10-20', now })).toBe('Welcome back! 1 season reward to claim.');
    expect(noteDue(undefined, '2026-10-20')).toBe(true);
    expect(noteDue('2026-10-20', '2026-10-20')).toBe(false);
  });
});
