import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { BADGES, earnedBadges, newBadges } from '@/state/badges';
import { cityPoints, cityRank, LEVEL_POINTS, mayorOf, nextRankLine, RANKS, TOKEN_POINTS } from '@/state/rank';
import { afterQuests } from '@/state/next';
import { WORKSHOPS } from '@/world/workshops';
import { TIER_XP } from '@/world/places';

// The Mayor's city rank grows only with learning (building levels) and walking (golden tokens); badges read progress.
const city = (xp: Record<string, number>, region = 'us-west-2', extra: Partial<Progress> = {}): Progress =>
  ({ version: 2, landmarks: {}, cities: { [region]: { landmarks: Object.fromEntries(Object.entries(xp).map(([id, x]) => [id, { discovered: true, xp: x }])) } }, updatedAt: '', ...extra }) as Progress;

describe('city rank', () => {
  it('counts building levels and tokens in this city only', () => {
    const p = city({ lambda: TIER_XP[2], s3: TIER_XP[1] }, 'us-west-2', { finds: { 'us-west-2:0': '2026-10-17', 'eu-west-1:0': '2026-10-17' } });
    expect(cityPoints(p, 'us-west-2')).toBe(3 * LEVEL_POINTS + TOKEN_POINTS);
    expect(cityPoints(p, 'eu-west-1')).toBe(TOKEN_POINTS);
  });

  it('climbs Village → Town → … and says what the next rank needs', () => {
    expect(cityRank(city({}), 'us-west-2').rank.id).toBe('village');
    const r = cityRank(city({ lambda: TIER_XP[4], s3: TIER_XP[1] }), 'us-west-2');
    expect(r.rank.id).toBe('village');
    expect(r.next?.id).toBe('town');
    expect(nextRankLine(r)).toBe('10 more points to Town: each building level is 10, each golden token 5.');
    expect(cityRank(city({ lambda: TIER_XP[4], s3: TIER_XP[2] }), 'us-west-2').rank.id).toBe('town');
    const six = Object.fromEntries(['lambda', 's3', 'ec2', 'dynamodb', 'sqs', 'vpc'].map((id) => [id, TIER_XP[4]]));
    expect(cityRank(city(six), 'us-west-2').rank.id).toBe('town');
    const seven = Object.fromEntries(['lambda', 's3', 'ec2', 'dynamodb', 'sqs', 'vpc', 'rds'].map((id) => [id, TIER_XP[4]]));
    expect(cityRank(city(seven), 'us-west-2').rank.id).toBe('city');
    expect(RANKS.map((x) => x.at)).toEqual([0, 60, 250, 700, 1400, 2200]);
    expect(RANKS.map((x) => x.at)).toEqual([...RANKS.map((x) => x.at)].sort((a, b) => a - b));
    expect(mayorOf('us-west-2')).toBe('Mayor of Oregon');
  });

  it('has a sixth rank above Megacity (contract v2.12 sends it as Global City)', () => {
    const top = RANKS.at(-1)!;
    expect(top).toMatchObject({ id: 'global', name: 'Global City' });
    expect(nextRankLine({ rank: top, points: 2300, pct: 1 })).toMatch(/^Global City: the top rank/);
  });
});

describe('after every quest (src/state/next.ts)', () => {
  it('offers putting up a new building before growing the ones already up', () => {
    const p = city({ lambda: TIER_XP[1] });
    expect(afterQuests({ ...p, workshops: Object.fromEntries(WORKSHOPS.map((w) => [w.id, { steps: {}, done: '2026-10-17' }])) }, 'us-west-2')?.kind).toBe('build');
  });
});

describe('badges', () => {
  it('have unique ids and read straight from progress', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    expect(earnedBadges(city({}))).toEqual([]);
    const p = city({ lambda: TIER_XP[4] }, 'us-west-2', { streak: { days: 3, last: '2026-10-17', best: 3 }, workshops: { w: { steps: { a: 'real' } } } });
    expect(earnedBadges(p)).toEqual(expect.arrayContaining(['first-building', 'practitioner', 'master', 'streak-3', 'first-workshop-step', 'real-step']));
    expect(earnedBadges(p)).not.toContain('first-crown');
  });

  it('newBadges names only what changed', () => {
    const before = city({ lambda: TIER_XP[1] });
    const after = city({ lambda: TIER_XP[2] });
    expect(newBadges(before, after)).toEqual(['practitioner']);
    expect(newBadges(after, after)).toEqual([]);
  });
});
