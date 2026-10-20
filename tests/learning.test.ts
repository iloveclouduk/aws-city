import { describe, expect, it } from 'vitest';
import { isDue, review, xpFor } from '@/learning/srs';
import { scoreDiagram, scorePuzzle } from '@/learning/scoring';
import type { Puzzle } from '@/world/content';

describe('SM-2 lite', () => {
  const now = 1_000_000;
  it('again brings a card back within minutes and resets reps', () => {
    const s = review({ interval: 10, ease: 2.5, due: now, reps: 4 }, 'again', now);
    expect(s.reps).toBe(0);
    expect(s.due - now).toBe(60_000);
  });
  it('good grows intervals 1 → 3 → ×ease', () => {
    const a = review(undefined, 'good', now);
    const b = review(a, 'good', now);
    const c = review(b, 'good', now);
    expect([a.interval, b.interval, c.interval]).toEqual([1, 3, Math.round(3 * 2.5)]);
    expect(isDue(c, now)).toBe(false);
  });
  it('new cards are worth more XP than reviews', () => {
    expect(xpFor(undefined, 'good')).toBeGreaterThan(xpFor({ interval: 1, ease: 2.5, due: 0, reps: 1 }, 'good'));
  });
  it('Again then Good on a seen card pays a review, not the new-card stars again', () => {
    const again = review(undefined, 'again', 0);
    expect(xpFor(again, 'good')).toBe(xpFor({ interval: 1, ease: 2.5, due: 0, reps: 1 }, 'good'));
  });
});

describe('puzzle scoring', () => {
  const p: Puzzle = {
    id: 't', title: 't', districtId: 'compute', tier: 1, story: '', requirements: [], why: '',
    required: ['s3', 'lambda'], optional: ['sqs'], distractors: ['ec2'], flow: ['s3', 'lambda'],
    pillarBonus: {
      operational: { services: [], tip: 'a' }, security: { services: ['iam'], tip: 'b' }, reliability: { services: ['sqs'], tip: 'c' },
      performance: { services: [], tip: 'd' }, cost: { services: ['lambda'], tip: 'e' }, sustainability: { services: ['lambda'], tip: 'f' },
    },
  };
  it('passes a complete design and rewards pillar services', () => {
    const base = scorePuzzle(p, ['s3', 'lambda']);
    const better = scorePuzzle(p, ['s3', 'lambda', 'sqs', 'iam']);
    expect(base.passed).toBe(true);
    expect(better.score).toBeGreaterThan(base.score);
    expect(better.pillars.reliability).toBe(100);
  });
  it('fails when a required service is missing and penalises distractors', () => {
    expect(scorePuzzle(p, ['s3']).passed).toBe(false);
    expect(scorePuzzle(p, ['s3', 'lambda', 'ec2']).score).toBeLessThan(scorePuzzle(p, ['s3', 'lambda']).score);
  });
});

describe('diagram scoring', () => {
  const p: Puzzle = {
    id: 'd', title: 'd', districtId: 'compute', tier: 1, story: '', requirements: [], why: '',
    required: ['s3', 'lambda'], optional: ['sqs'], distractors: ['ec2'], flow: ['s3', 'lambda'],
    pillarBonus: {
      operational: { services: [], tip: 'a' }, security: { services: [], tip: 'b' }, reliability: { services: ['sqs'], tip: 'c' },
      performance: { services: [], tip: 'd' }, cost: { services: ['lambda'], tip: 'e' }, sustainability: { services: [], tip: 'f' },
    },
    diagram: {
      cols: 4, rows: 2, groups: [], rejects: { ec2: 'no' },
      nodes: [
        { id: 'u', actor: 'users', x: 0, y: 0, role: 'Users' },
        { id: 'in', service: 's3', x: 1, y: 0, role: 'In' },
        { id: 'q', service: 'sqs', x: 2, y: 1, role: 'Buffer' },
        { id: 'fn', service: 'lambda', x: 2, y: 0, role: 'Fn' },
        { id: 'out', service: 's3', x: 3, y: 0, role: 'Out' },
      ],
      edges: [],
    },
  };
  const all = { in: 's3', fn: 'lambda', out: 's3' };
  it('an all-correct diagram scores exactly like the same services picked by hand', () => {
    expect(scoreDiagram(p, { placements: all, distractorDrops: [], misdrops: 0 })).toEqual(scorePuzzle(p, ['s3', 'lambda']));
  });
  it('a service with two spots counts only once both are filled', () => {
    const r = scoreDiagram(p, { placements: { in: 's3', fn: 'lambda' }, distractorDrops: [], misdrops: 0 });
    expect(r.missing).toEqual(['s3']);
    expect(r.passed).toBe(false);
  });
  it('a bonus spot raises its pillar; a distractor counts once; wrong drops and shown cards cost points', () => {
    const base = scoreDiagram(p, { placements: all, distractorDrops: [], misdrops: 0 });
    expect(scoreDiagram(p, { placements: { ...all, q: 'sqs' }, distractorDrops: [], misdrops: 0 }).pillars.reliability).toBe(100);
    expect(scoreDiagram(p, { placements: all, distractorDrops: ['ec2', 'ec2'], misdrops: 0 })).toEqual(scoreDiagram(p, { placements: all, distractorDrops: ['ec2'], misdrops: 0 }));
    expect(scoreDiagram(p, { placements: all, distractorDrops: [], misdrops: 2 }).score).toBe(base.score - 6);
    expect(scoreDiagram(p, { placements: all, distractorDrops: [], misdrops: 0, reveals: 10 }).score).toBe(base.score - 12);
  });
  it('a bonus service the brief does not need costs points', () => {
    const lean = scoreDiagram(p, { placements: { ...all, q: 'sqs' }, distractorDrops: [], misdrops: 0 });
    const over = scoreDiagram({ ...p, unneeded: ['sqs'] }, { placements: { ...all, q: 'sqs' }, distractorDrops: [], misdrops: 0 });
    expect(over.score).toBe(lean.score - 6);
    expect(over.tips[0].tip).toContain('didn’t need');
  });
});


describe('fair card rewards and quest practice', async () => {
  const { backIn, questPracticeDeck } = await import('@/learning/srs');
  const { useCity } = await import('@/state/store');
  const { cardsFor } = await import('@/world/content');
  const { REMEMBERED_STARS } = await import('@/state/mastery');
  const { mergeProgress } = await import('@/state/progress');
  const { isoWeekUtc } = await import('@/state/events');
  const DAY = 86_400_000;
  const s = () => useCity.getState();
  const s3 = cardsFor('s3');
  const later = (n: number) => Object.fromEntries(s3.slice(0, n).map((c, i) => [c.id, { interval: 3, ease: 2.5, due: Date.now() + (i + 1) * DAY, reps: 2 }]));
  const withQuest = (cards: Record<string, { interval: number; ease: number; due: number; reps: number }>, count = 0) => {
    s().resetSession();
    const p = s().progress;
    useCity.setState({ progress: { ...p, landmarks: { s3: { discovered: true, xp: 0 } }, cards, quests: { 'storage-static-site': { status: 'active', step: 1, count } } } });
  };

  it('Again pays nothing, and says when a card comes back', () => {
    expect(xpFor(undefined, 'again')).toBe(0);
    expect(xpFor({ interval: 1, ease: 2.5, due: 0, reps: 1 }, 'again')).toBe(0);
    expect(backIn({ interval: 3, ease: 2.5, due: 3 * DAY, reps: 2 }, 0)).toBe('in 3 days');
    expect(backIn({ interval: 1, ease: 2.5, due: DAY, reps: 1 }, 0)).toBe('tomorrow');
    expect(backIn({ interval: 0, ease: 2.5, due: 60_000, reps: 0 }, 0)).toBe('in a minute');
  });

  it('a quest cards step that due cards cannot meet is topped up with practice cards, soonest first, skipping ones just done', () => {
    withQuest(later(s3.length));
    const p = s().progress;
    // nothing is due: all five come from practice, soonest first
    expect(questPracticeDeck(p, 's3', 0).map((c) => c.id)).toEqual(s3.slice(0, 5).map((c) => c.id));
    expect(questPracticeDeck(p, 's3', 5)).toEqual([]);
    expect(questPracticeDeck(p, 's3', 0, new Set([s3[0]!.id]))[0]!.id).toBe(s3[1]!.id);
    expect(questPracticeDeck(p, 'lambda', 0)).toEqual([]);
  });

  it('every grade counts toward a cards step; practice pays review stars but keeps the schedule', () => {
    withQuest(later(s3.length), 3);
    const before = s().progress.cards![s3[0]!.id];
    expect(s().reviewCard(s3[0]!.id, 'again', { practice: true })).toEqual({ stars: 0, remembered: false });
    expect(s().progress.quests!['storage-static-site']!.count).toBe(4);
    expect(s().reviewCard(s3[1]!.id, 'good', { practice: true }).stars).toBe(2);
    expect(s().progress.cards![s3[0]!.id]).toEqual(before);
    // the fifth card finishes the step
    expect(s().progress.quests!['storage-static-site']!.step).toBe(2);
  });

  it('pays the remembered bonus once per card, even after an Again', () => {
    withQuest({ [s3[0]!.id]: { interval: 3, ease: 2.5, due: 0, reps: 2 } });
    const id = s3[0]!.id;
    const first = s().reviewCard(id, 'good');
    expect(first).toEqual({ stars: 2 + REMEMBERED_STARS, remembered: true });
    expect(s().progress.cards![id]!.remembered).toBe(true);
    s().reviewCard(id, 'again');
    expect(s().progress.cards![id]!.remembered).toBe(true);
    s().reviewCard(id, 'good');
    s().reviewCard(id, 'good');
    expect(s().reviewCard(id, 'easy').remembered).toBe(false);
  });

  it('recordGame keeps best, counts scored rounds, and keeps this week\'s timed best (relaxed rounds excluded)', () => {
    s().resetSession();
    s().recordGame('shield', 0);
    s().recordGame('shield', 30, { timed: false });
    s().recordGame('shield', 12);
    expect(s().progress.games!.shield).toEqual({ best: 30, plays: 3, scored: 2, bestTimed: 12, bestWeek: isoWeekUtc() });
    // an old save's plays stand in for scored rounds
    const p = s().progress;
    useCity.setState({ progress: { ...p, games: { fishing: { best: 3, plays: 4 } } } });
    s().recordGame('fishing', 0);
    expect(s().progress.games!.fishing).toMatchObject({ plays: 5, scored: 4 });
  });

  it('merges remembered cards and weekly timed bests', () => {
    const base = { version: 2 as const, landmarks: {}, updatedAt: '2026-10-18T00:00:00Z' };
    const a = { ...base, cards: { x: { interval: 8, ease: 2.5, due: 5, reps: 3, remembered: true as const } }, games: { g: { best: 9, plays: 3, scored: 2, bestTimed: 9, bestWeek: '2026-W41' } } };
    const b = { ...base, cards: { x: { interval: 0, ease: 2.3, due: 9, reps: 4 } }, games: { g: { best: 5, plays: 5, bestTimed: 4, bestWeek: '2026-W42' } } };
    const m = mergeProgress(a, b);
    expect(m.cards!.x).toEqual({ interval: 0, ease: 2.3, due: 9, reps: 4, remembered: true });
    // b was saved before v2.12 (no `scored`): its 5 plays stand in for its scored rounds.
    expect(m.games!.g).toEqual({ best: 9, plays: 5, scored: 5, bestTimed: 4, bestWeek: '2026-W42' });
    expect(mergeProgress(b, a)).toEqual(m);
  });

  it('a copy without `scored` counts its plays when merging, so an old save never loses rounds', () => {
    const base = { version: 2 as const, landmarks: {}, updatedAt: '2026-10-18T00:00:00Z' };
    const newer = { ...base, games: { g: { best: 3, plays: 4, scored: 1 } } };
    const older = { ...base, games: { g: { best: 2, plays: 3 } } };
    expect(mergeProgress(newer, older).games!.g).toEqual({ best: 3, plays: 4, scored: 3 });
    expect(mergeProgress(older, newer).games!.g).toEqual({ best: 3, plays: 4, scored: 3 });
    expect(mergeProgress(newer, { ...base, games: { g: { best: 3, plays: 9, scored: 6 } } }).games!.g.scored).toBe(6);
    expect(mergeProgress(older, older).games!.g).toEqual({ best: 2, plays: 3 }); // neither side has it: still absent
  });
});

describe('the daily ledger (src/learning/dailyLedger.ts)', async () => {
  const { countDaily, deviceLedger, memoryLedger, takeDaily, usedToday } = await import('@/learning/dailyLedger');
  it('takes a key up to its limit a day, and a new day starts again (keeping only today)', () => {
    const l = memoryLedger();
    expect([1, 2, 3, 4].map(() => takeDaily('chat:s3', 3, '2026-10-18', l))).toEqual([true, true, true, false]);
    expect(takeDaily('chat:lambda', 3, '2026-10-18', l)).toBe(true);
    expect(usedToday('chat:s3', '2026-10-18', l)).toBe(4);
    expect(countDaily('chat:s3', '2026-10-19', l)).toBe(0);
    expect(l.load()).toEqual({ day: '2026-10-19', n: { 'chat:s3': 1 } });
  });

  it('lives on the device, so a reload (a fresh read) keeps the count', () => {
    const store = new Map<string, string>();
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const was = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
    try {
      expect(takeDaily('try:p1', 1, '2026-10-18')).toBe(true);
      expect(deviceLedger.load()).toEqual({ day: '2026-10-18', n: { 'try:p1': 1 } });
      expect(takeDaily('try:p1', 1, '2026-10-18')).toBe(false);
      store.set('awscity.daily', 'not json');
      expect(takeDaily('try:p1', 1, '2026-10-18')).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: was, configurable: true });
    }
  });
});
