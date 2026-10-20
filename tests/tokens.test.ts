import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { mergeProgress } from '@/state/progress';
import { foundIn, tokenFact, tokenMessage, tokensFor, TOKEN_POINTS, TOKEN_SPACING, TOKENS_PER_CITY } from '@/world/tokens';
import { findPath } from '@/game/pathfinding';
import { somePlans } from './support/plans';

const streets = Array.from({ length: 40 }, (_, x) => [{ x, y: 10 }, { x: 10, y: x }, { x, y: 30 }]).flat();

describe('golden tokens (src/world/tokens.ts)', () => {
  it('hides six per city on street tiles, spread apart', () => {
    const t = tokensFor('us-west-2', streets);
    expect(t).toHaveLength(TOKENS_PER_CITY);
    for (const a of t) expect(streets.some((s) => s.x === a.x && s.y === a.y)).toBe(true);
    for (const a of t) for (const b of t) if (a !== b) expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(TOKEN_SPACING);
    expect(new Set(t.map((x) => x.certId)).size).toBe(TOKENS_PER_CITY);
  });

  it('is the same for a Region every time (whatever order the tiles come in), and different between Regions', () => {
    const a = tokensFor('us-west-2', streets);
    expect(tokensFor('us-west-2', [...streets].reverse())).toEqual(a);
    expect(tokensFor('eu-west-2', streets).map((x) => `${x.x},${x.y}`)).not.toEqual(a.map((x) => `${x.x},${x.y}`));
    expect(a.map((x) => x.id)).toEqual(['us-west-2:0', 'us-west-2:1', 'us-west-2:2', 'us-west-2:3', 'us-west-2:4', 'us-west-2:5']);
  });

  it('counts finds per city, and each token tells a real certification', () => {
    const p = { finds: { 'us-west-2:0': '2026-10-13', 'us-west-2:4': '2026-10-13', 'eu-west-2:1': '2026-10-12' } } as unknown as Progress;
    expect(foundIn(p, 'us-west-2')).toBe(2);
    expect(foundIn(p, 'eu-west-2')).toBe(1);
    expect(tokenFact('cloud-practitioner')).toMatch(/^AWS Certified Cloud Practitioner \(CLF-C02\): a Foundational certification\.$/);
  });

  it('a find is one short line: the count and the reward, never an exam code', () => {
    expect(tokenMessage(1, 6)).toBe(`✨ Golden token! 1 of 6 · +${TOKEN_POINTS} points`);
    expect(tokenMessage(6, 6)).toBe(`🏆 All 6 golden tokens found! +${TOKEN_POINTS} points`);
    for (let n = 1; n <= 6; n++) {
      expect(tokenMessage(n, 6)).not.toMatch(/\n|\b[A-Z]{3}-[A-Z]\d{2}\b/);
      expect(tokenMessage(n, 6).length).toBeLessThanOrEqual(40);
    }
  });

  it('a find stays found across surfaces, dated the first time (Progress v2.9 merge)', () => {
    const base = { version: 2 as const, landmarks: {}, updatedAt: '2026-10-13T00:00:00Z' };
    const m = mergeProgress({ ...base, finds: { 'us-west-2:0': '2026-10-13' } }, { ...base, finds: { 'us-west-2:0': '2026-10-11', 'us-west-2:3': '2026-10-12' } });
    expect(m.finds).toEqual({ 'us-west-2:0': '2026-10-11', 'us-west-2:3': '2026-10-12' });
    expect(mergeProgress(base, base).finds).toBeUndefined();
  });
});

describe.each(somePlans().map((s) => [s.name, s] as const))('golden tokens on the real streets of %s', (_n, s) => {
  it('six on sidewalks Kai can walk to from the gate, spread apart', () => {
    const p = s.plan;
    const walk = (x: number, y: number) => !p.isFootprint(x, y) && !p.isWater?.(x, y);
    const sidewalks: { x: number; y: number }[] = [];
    for (let y = 0; y < p.size; y++)
      for (let x = 0; x < p.size; x++)
        if (walk(x, y) && !p.isRoad({ x, y }) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => p.isRoad({ x: x + dx, y: y + dy }))) sidewalks.push({ x, y });
    const t = tokensFor(s.region, sidewalks);
    expect(t).toHaveLength(TOKENS_PER_CITY);
    for (const a of t) expect(findPath(p.gate, a, p.size, p.size, walk).length, `${a.x},${a.y}`).toBeGreaterThan(0);
    for (const a of t) for (const b of t) if (a !== b) expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(TOKEN_SPACING);
  });
});
