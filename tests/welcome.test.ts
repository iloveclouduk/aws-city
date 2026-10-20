// The gentle return note (src/state/welcome.ts): one positive line a day, only for a player returning (nothing learned
// today), saying what's waiting and never what was missed.
import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { noteDue, returnNote } from '@/state/welcome';
import { cardsFor } from '@/world/content';
import { seasonFor } from '@/state/season';

const TODAY = '2026-10-20';
const NOW = Date.parse('2026-10-20T09:00:00Z');
const REGION = 'us-west-2';
const base = (over: Partial<Progress> = {}): Progress => ({ version: 2, landmarks: {}, updatedAt: '2026-10-19T00:00:00.000Z', ...over });
const s3 = { cities: { [REGION]: { landmarks: { s3: { discovered: true, xp: 0 } } } } };
const due = (n: number) => Object.fromEntries(cardsFor('s3').slice(0, n).map((c) => [c.id, { interval: 1, ease: 2.5, due: NOW - 1, reps: 1 }]));
const note = (p: Progress, over = {}) => returnNote({ progress: p, region: REGION, today: TODAY, now: NOW, ...over });

describe('the return note', () => {
  it('says what is waiting: cards ready, then a season reward to claim, at most two things', () => {
    const season = seasonFor(TODAY).id;
    const p = base({ ...s3, cards: due(3), lights: { days: ['2026-10-19'], freezes: 0 }, seasons: { [season]: { points: 10, claimed: [] } } });
    expect(note(p)).toBe('Welcome back! 3 cards are ready · 1 season reward to claim.');
    expect(note(base({ ...s3, cards: due(1), lights: { days: ['2026-10-19'], freezes: 0 } }))).toBe('Welcome back! 1 card is ready.');
  });

  it('a picked road is the one it reads', () => {
    const p = base({ lights: { days: ['2026-10-19'], freezes: 0 }, seasons: { 'serverless-spring': { points: 30, claimed: [] } } });
    expect(note(p)).toBeUndefined();
    expect(note(p, { season: 'serverless-spring' })).toBe('Welcome back! 3 season rewards to claim.');
  });

  it('a dimmed window is said kindly: a learning day relights it (never "you lost")', () => {
    const p = base({ lights: { days: ['2026-10-10'], freezes: 0 } });
    const line = note(p)!;
    expect(line).toBe('Welcome back! a learning day relights a window.');
    expect(line).not.toMatch(/lost|miss|streak/i);
  });

  it('says nothing to a player who already learned today, or when nothing is waiting', () => {
    expect(note(base({ ...s3, cards: due(3), lights: { days: [TODAY], freezes: 0 } }))).toBeUndefined();
    expect(note(base({ lights: { days: ['2026-10-19'], freezes: 0 } }))).toBeUndefined();
  });

  it('shows at most once a day', () => {
    expect(noteDue(undefined, TODAY)).toBe(true);
    expect(noteDue(TODAY, TODAY)).toBe(false);
    expect(noteDue('2026-10-19', TODAY)).toBe(true);
  });
});
