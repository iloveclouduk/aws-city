import { describe, expect, it } from 'vitest';
import { GAMES, isoWeek, isoWeekUtc, weeklyChallenge } from '@/state/events';

describe('weekly challenge', () => {
  it('reads the ISO week (the Thursday decides the year)', () => {
    expect(isoWeek(new Date(2026, 9, 17))).toBe('2026-W42');
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53');
    expect(isoWeek(new Date(2026, 0, 1))).toBe('2026-W01');
  });

  it('bestWeek and the boards use the UTC week (server/src/social.ts isoWeekUtc), whatever the local time zone', async () => {
    const { isoWeekUtc: serverWeek } = await import('../server/src/social');
    // Sunday 23:30 in UTC−5 is already Monday (the next ISO week) in UTC: the board's week, not the local one.
    const lateSunday = new Date('2026-10-19T04:30:00Z');
    expect(isoWeekUtc(lateSunday)).toBe('2026-W43');
    for (const iso of ['2026-10-19T04:30:00Z', '2026-10-18T23:59:59Z', '2027-01-01T00:00:00Z', '2026-12-28T00:00:00Z', '2026-01-01T12:00:00Z'])
      expect(isoWeekUtc(new Date(iso)), iso).toBe(serverWeek(new Date(iso)));
  });

  it('picks the same game for everyone in a week, and every game comes round', () => {
    expect(weeklyChallenge('2026-W42')).toEqual(weeklyChallenge('2026-W42'));
    const seen = new Set(Array.from({ length: GAMES.length }, (_, i) => weeklyChallenge(`2026-W${String(i + 1).padStart(2, '0')}`).game));
    expect(seen.size).toBe(GAMES.length);
  });
});
