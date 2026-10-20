// Today's shift (src/state/next.ts): one next action with a label that says exactly what happens, the Go labels per
// quest step kind, buildings ready to upgrade, the order board, the end-of-shift summary, and the ✓ step-done moment.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Progress } from '@/backend/contract';
import {
  actionText,
  afterQuests,
  bumpShift,
  DUE_MIN,
  nextAction,
  openJobs,
  planNext,
  readyToUpgrade,
  setNextRunner,
  shiftSummary,
  stepAction,
  stepButton,
  stepWhere,
  type NextPlan,
} from '@/state/next';
import { CLIENTS } from '@/world/clients';
import { cardsFor, QUESTS, type QuestStep } from '@/world/content';
import { TIER_XP } from '@/world/places';
import { SERVICES } from '@/world/taxonomy';
import { coinsToday } from '@/state/wallet';
import { offered } from '@/world/regions';
import { WORKSHOPS } from '@/world/workshops';
import FACTS from '../shared/region-facts.json' with { type: 'json' };
import { overtimeGoal, SHIFT_MAX, todayDone, todayGoals, type DayLog } from '@/state/progress';

const REGION = 'us-west-2';
const NOW = Date.parse('2026-10-19T09:00:00Z');
const DAY = 86_400_000;
const base = (over: Partial<Progress> = {}): Progress => ({ version: 2, landmarks: {}, updatedAt: '2026-10-19T00:00:00.000Z', ...over });
/** Buildings put up in the city, with these stars. */
const built = (xp: Record<string, number>) => ({ cities: { [REGION]: { landmarks: Object.fromEntries(Object.entries(xp).map(([id, x]) => [id, { discovered: true, xp: x }])) } } });
const allDone = Object.fromEntries(QUESTS.map((q) => [q.id, { status: 'done' as const, step: q.steps.length }]));
const plan = (p: Progress, over = {}) => planNext({ progress: p, cityRegion: REGION, now: NOW, ...over });
/** `n` reviewed s3 cards due now. */
const dueCards = (n: number, due = NOW - 1) => Object.fromEntries(cardsFor('s3').slice(0, n).map((c) => [c.id, { interval: 1, ease: 2.5, due, reps: 1 }]));

describe('the next action', () => {
  it('a brand-new player starts the first quest', () => {
    expect(plan(base())).toMatchObject({ kind: 'quest', label: `Start: ${QUESTS[0].title}`, questId: QUESTS[0].id });
  });

  it('an active quest step comes first, labelled with exactly what happens', () => {
    const q = QUESTS[0];
    const at = (i: number, count = 0) => plan(base({ quests: { [q.id]: { status: 'active', step: i, count } }, cards: dueCards(5) }));
    expect(at(0)).toMatchObject({ kind: 'step', label: 'Walk to S3 Lake', serviceId: 's3' });
    expect(at(0).kind === 'step' && at(0)).not.toHaveProperty('where', expect.anything());
    const cards = q.steps[1] as Extract<QuestStep, { kind: 'cards' }>;
    expect(at(1, 1)).toMatchObject({ kind: 'step', label: `Review ${cards.count - 1} S3 Lake cards`, where: 'Learn' });
    const puzzle = q.steps.findIndex((s) => s.kind === 'puzzle');
    expect(at(puzzle).label).toMatch(/^Solve: /);
    const deploy = q.steps.findIndex((s) => s.kind === 'deploy');
    expect(at(deploy)).toMatchObject({ label: 'Approve it in Deploy', where: 'Deploy' });
  });

  it('then cards due again (at least DUE_MIN), then a new quest', () => {
    const quests = { [QUESTS[0].id]: { status: 'done' as const, step: 9 } };
    const p = base({ quests, ...built({ s3: 0 }) });
    expect(plan({ ...p, cards: dueCards(DUE_MIN - 1) }).kind).toBe('quest');
    expect(plan({ ...p, cards: dueCards(DUE_MIN) })).toMatchObject({ kind: 'review', label: `Review ${DUE_MIN} cards`, where: 'Learn', serviceId: 's3' });
    // Not due yet: no review.
    expect(plan({ ...p, cards: dueCards(5, NOW + DAY) }).kind).toBe('quest');
  });

  it('every quest done: a building one action from its next level, then a job, then the after-quests offers', () => {
    const near = TIER_XP[2] - 6; // 6 stars short of Practitioner: two new cards
    const p = base({ quests: allDone, ...built({ ec2: near }) });
    expect(plan(p)).toMatchObject({ kind: 'upgrade', label: 'Upgrade EC2 Factory: 2 reviews to Practitioner', where: 'Learn', serviceId: 'ec2' });
    // Far from the next level: a client's job (clients open once a quest is done), the focused business first.
    const far = base({ quests: allDone, ...built(Object.fromEntries(SERVICES.map((s) => [s.id, TIER_XP[1]]))) });
    expect(plan(far)).toMatchObject({ kind: 'job', label: expect.stringMatching(/^Do a job for /) });
    expect(plan(far, { clientFocus: 'bank' })).toMatchObject({ kind: 'job', clientId: 'bank' });
    // Jobs closed: Connie's workshop offer.
    expect(plan(far, { clients: false }).kind).toBe('workshop');
  });

  it('says which tab it opens when the label does not (the button never switches tabs silently)', () => {
    expect(actionText({ kind: 'review', label: 'Review 5 cards', where: 'Learn', serviceId: 's3', count: 5 })).toBe('Review 5 cards (Learn)');
    expect(actionText({ kind: 'step', label: 'Approve it in Deploy', where: 'Deploy', questId: 'x', step: { kind: 'deploy', templateId: 't', text: '' } })).toBe('Approve it in Deploy');
    expect(actionText({ kind: 'quest', label: 'Start: X', questId: 'x' })).toBe('Start: X');
  });

  it('runs through the runner the UI registers', () => {
    const ran: NextPlan[] = [];
    const off = setNextRunner((p) => ran.push(p));
    const a = nextAction({ progress: base(), cityRegion: REGION });
    a.run();
    off();
    expect(ran).toEqual([expect.objectContaining({ kind: 'quest' })]);
    // Unregistered: running does nothing (no throw).
    nextAction({ progress: base(), cityRegion: REGION }).run();
    expect(ran).toHaveLength(1);
  });
});

describe('Go labels: one label, one thing', () => {
  const steps: QuestStep[] = [
    { kind: 'visit', serviceId: 's3', text: '' },
    { kind: 'cards', serviceId: 's3', count: 3, text: '' },
    { kind: 'puzzle', puzzleId: 'static-site', text: '' },
    { kind: 'ask', prompt: 'p', text: '' },
    { kind: 'deploy', templateId: 'static-site', text: '' },
    { kind: 'choose', id: 'c', text: '', question: '', options: [] },
    { kind: 'workshop', workshopId: 'w', text: '' },
    { kind: 'console', serviceId: 's3', goal: 'g', text: '' },
    { kind: 'design', text: '' },
  ];
  it('each step kind has its own label, and a step on another tab names it', () => {
    const labels = steps.map(stepButton);
    expect(labels).toEqual(['Walk there', 'Open cards (Learn)', 'Solve it (Learn)', 'Ask the agents', 'Approve it in Deploy', 'Make your choice', 'Open the workshop', 'Start in the console', 'Draw it (Learn)']);
    expect(new Set(labels).size).toBe(labels.length);
    for (const s of steps) {
      const where = stepWhere(s);
      if (where) expect(stepButton(s)).toContain(where);
      expect(stepButton(s)).not.toMatch(/^Go\b/);
    }
    expect(stepAction(steps[0])).toBe('Walk to S3 Lake');
    expect(stepAction(steps[1], 2)).toBe('Review 1 S3 Lake card');
  });

  it('every step in the quests has a label that is not "Go"', () => {
    for (const q of QUESTS) for (const s of q.steps) expect(stepAction(s)).not.toMatch(/^Go\b/);
  });
});

describe('ready to upgrade and the order board', () => {
  it('lists buildings one action from their next level, closest first', () => {
    const p = base(built({ s3: TIER_XP[1] - 2, ec2: TIER_XP[2] - 10, lambda: TIER_XP[2] - 30 }));
    const r = readyToUpgrade(p, REGION);
    expect(r.map((x) => [x.serviceId, x.toGo, x.reviews])).toEqual([['s3', 2, 1], ['ec2', 10, 3]]);
  });

  it('never suggests a building whose deck can’t pay the stars today (every card seen, none due), and counts due cards at 2⭐', () => {
    const toGo = 8;
    const xp = TIER_XP[2] - toGo;
    const seen = (due: number) => Object.fromEntries(cardsFor('s3').map((c) => [c.id, { interval: 9, ease: 2.5, due, reps: 2 }]));
    // Every card seen, none due: nothing a review could pay now.
    expect(readyToUpgrade(base({ ...built({ s3: xp }), cards: seen(NOW + 9 * DAY) }), REGION, 3, NOW)).toEqual([]);
    // Every card seen and due: 8 stars is four reviews at 2⭐, not two at 4⭐.
    expect(readyToUpgrade(base({ ...built({ s3: xp }), cards: seen(NOW - 1) }), REGION, 3, NOW)).toMatchObject([{ serviceId: 's3', toGo, reviews: 4 }]);
    // New cards first: two of them.
    expect(readyToUpgrade(base(built({ s3: xp })), REGION, 3, NOW)).toMatchObject([{ serviceId: 's3', reviews: 2 }]);
  });

  it('offers only jobs whose buildings are up (and the starter jobs, open from day one), the focused business first, at most three', () => {
    expect(openJobs(base(), REGION).every((j) => j.title)).toBe(true);
    expect(openJobs(base(), REGION).length).toBeLessThanOrEqual(1);
    const p = base(built(Object.fromEntries(SERVICES.map((s) => [s.id, 0]))));
    const jobs = openJobs(p, REGION, 'bank');
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({ clientId: 'bank', station: expect.any(String) });
    const bank = CLIENTS.find((b) => b.id === 'bank')!;
    expect(jobs.map((j) => j.taskId)).toEqual(bank.levels[0].tasks.slice(0, 3).map((t) => t.id));
  });
});

describe('Connie never sends the player to a fenced lot', () => {
  it('suggests putting up only a service AWS offers in this Region', () => {
    const quests = allDone;
    const workshops = Object.fromEntries(WORKSHOPS.map((w) => [w.id, { steps: {}, done: '2026-10-01' }]));
    let checked = 0;
    for (const region of Object.keys((FACTS as { regions: Record<string, unknown> }).regions)) {
      const on = SERVICES.filter((s) => offered(s.id, region));
      const last = on.at(-1);
      // A Region where some service isn't offered before the last one that is.
      if (!last || !SERVICES.slice(0, SERVICES.indexOf(last)).some((s) => !offered(s.id, region))) continue;
      const landmarks = Object.fromEntries(on.filter((s) => s !== last).map((s) => [s.id, { discovered: true, xp: TIER_XP.at(-1)! }]));
      // Global services (Route 53, IAM…) stand in every city from Progress.landmarks.
      const p = base({ quests, workshops, landmarks, cities: { [region]: { landmarks } } });
      expect(afterQuests(p, region), region).toMatchObject({ kind: 'build', id: last.id });
      expect(planNext({ progress: p, cityRegion: region, clients: false, now: NOW }), region).toMatchObject({ kind: 'build', serviceId: last.id });
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('“Review N cards” counts the deck it opens', () => {
  it('names the building’s own due cards, not every city’s', () => {
    // 4 due at S3, 3 at EC2 (in another deck): the button opens S3's deck of 4.
    const ec2 = Object.fromEntries(cardsFor('ec2').slice(0, 3).map((c) => [c.id, { interval: 1, ease: 2.5, due: NOW - 1, reps: 1 }]));
    const p = base({ quests: { [QUESTS[0].id]: { status: 'done' as const, step: 9 } }, ...built({ s3: 0, ec2: 0 }), cards: { ...dueCards(4), ...ec2 } });
    expect(plan(p)).toMatchObject({ kind: 'review', serviceId: 's3', count: 4, label: 'Review 4 cards' });
  });
});

describe('the shift’s goals', () => {
  const day = '2026-10-19';
  const log = (over: Partial<DayLog> = {}): DayLog => ({ day, cards: 0, puzzles: 0, fixes: 0, games: 0, ...over });
  it('the order board feeds the shift: a job goal (two when the shift would be short), never more than SHIFT_MAX', () => {
    // Cards and a job board: three goals, the job asked twice.
    const short = todayGoals(log(), day, { learn: true, puzzles: false, care: false, jobs: 3 });
    expect(short.map((g) => [g.id, g.goal])).toEqual([['cards', 5], ['jobs', 2]]);
    // Only one job left on the board: one.
    expect(todayGoals(log(), day, { learn: true, puzzles: false, care: false, jobs: 1 }).find((g) => g.id === 'jobs')?.goal).toBe(1);
    // A job done today still counts (it's off the board now).
    expect(todayGoals(log({ jobs: 1 }), day, { learn: true, puzzles: false, care: false, jobs: 0 }).find((g) => g.id === 'jobs')).toMatchObject({ have: 1, goal: 1 });
    // Everything open: SHIFT_MAX goals, the rest a bonus.
    const all = todayGoals(log(), day, { learn: true, puzzles: true, care: true, games: true, labs: true, designs: true, jobs: 5 });
    expect(all.filter((g) => !g.bonus)).toHaveLength(SHIFT_MAX);
    expect(all.filter((g) => !g.bonus).map((g) => g.id)).toEqual(['cards', 'puzzles', 'games', 'labs', 'fixes']);
    // No jobs on the board: no job goal.
    expect(todayGoals(log(), day, { learn: true, puzzles: true, care: false }).some((g) => g.id === 'jobs')).toBe(false);
  });

  it('a finished shift offers overtime: two more jobs (else rounds, else cards), counted past what the shift asked', () => {
    const open = { learn: true, puzzles: false, care: false, games: true, jobs: 3 };
    const goals = (l: DayLog) => todayGoals(l, day, open);
    expect(overtimeGoal(log(), day, open, goals(log()))).toBeUndefined();
    const done = log({ cards: 5, games: 1, jobs: 1 });
    expect(todayDone(goals(done))).toEqual({ done: 3, of: 3 });
    expect(overtimeGoal(done, day, open, goals(done))).toMatchObject({ id: 'jobs', have: 0, goal: 2 });
    const more = log({ cards: 5, games: 1, jobs: 3 });
    const ot = overtimeGoal(more, day, { ...open, jobs: 1 }, goals(more))!;
    expect(ot).toMatchObject({ id: 'jobs', have: 2, goal: 2 });
    // The end-of-shift card carries it: done, its crate is ready.
    expect(shiftSummary({ progress: base() }, day, { goals: todayDone(goals(more)), overtime: ot })).toMatchObject({ done: true, overtime: ot, overtimeDone: true });
    // The board is out of jobs: overtime is mini-game rounds.
    expect(overtimeGoal(done, day, { ...open, jobs: 0 }, goals(done))).toMatchObject({ id: 'games', goal: 2 });
  });
});

describe('the end of the shift', () => {
  it('sums today’s stars by building, the coins, the streak and what’s ready tomorrow', () => {
    const day = '2026-10-19';
    let shift = bumpShift(undefined, 's3', 8, day);
    shift = bumpShift(shift, 's3', 4, day);
    shift = bumpShift(shift, 'lambda', 4, day);
    const p = base({
      cards: { ...dueCards(2, NOW + DAY / 2), x: { interval: 9, ease: 2.5, due: NOW + 9 * DAY, reps: 3 } },
      streak: { last: day, days: 3, best: 3 },
      wallet: { earned: 60, spent: 0, log: [{ day, coins: 40 }, { day: '2026-10-18', coins: 20 }] },
    } as Partial<Progress>);
    expect(coinsToday(p, day)).toBe(40);
    const s = shiftSummary({ progress: p, shift }, day, { goals: { done: 3, of: 3 }, now: NOW });
    expect(s).toMatchObject({ done: true, stars: 16, coins: 40, streak: 3, cardsTomorrow: 2 });
    expect(s.line).toBe('S3 Lake +12⭐ · Lambda Food Stall +4⭐ · 40🪙');
    expect(s.tomorrow).toBe('Come back tomorrow: 2 cards will be ready.');
  });

  it('is not done until the day’s own goals are; yesterday’s stars don’t count', () => {
    const shift = bumpShift(undefined, 's3', 8, '2026-10-18');
    const s = shiftSummary({ progress: base(), shift }, '2026-10-19', { goals: { done: 1, of: 3 }, now: NOW });
    expect(s).toMatchObject({ done: false, stars: 0, line: '', tomorrow: 'Come back tomorrow for a new shift.' });
    expect(shiftSummary({ progress: base() }, '2026-10-19', { goals: { done: 0, of: 0 } }).done).toBe(false);
    // A new day starts a fresh log.
    expect(bumpShift(shift, 'ec2', 2, '2026-10-19')).toEqual({ day: '2026-10-19', stars: { ec2: 2 } });
  });
});

describe('a quest step done is a moment', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('shows a ✓ toast and bumps its building (not on the last step: that is the celebration)', async () => {
    const { useCity } = await import('@/state/store');
    const { bus } = await import('@/state/bus');
    const s = () => useCity.getState();
    s().resetSession();
    s().clearToasts();
    const q = QUESTS[0];
    const bumps: unknown[] = [];
    const off = bus.on('questStep', (e) => bumps.push(e));
    s().startQuest(q.id);
    s().arrive('s3');
    expect(bumps).toEqual([{ questId: q.id, step: 0, serviceId: 's3' }]);
    expect(s().toasts.some((t) => t.icon === '✓' && t.text.startsWith(`Step 1 of ${q.steps.length} done`))).toBe(true);
    // A cards step counting up is not a step done.
    s().questEvent((st) => st.kind === 'cards', true);
    expect(bumps).toHaveLength(1);
    off();
    s().resetSession();
  });

  it('the step’s ✓ comes first, even behind a burst of other toasts (a first visit also discovers the building)', async () => {
    const { useCity } = await import('@/state/store');
    const s = () => useCity.getState();
    s().resetSession();
    s().clearToasts();
    for (let i = 0; i < 9; i++) s().toast('🚧', `noise ${i}`);
    s().startQuest(QUESTS[0].id);
    s().arrive('s3');
    // The one on screen goes; the ✓ is next.
    for (const t of s().toasts) s().dismissToast(t.id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s().toasts.filter((t) => !t.leaving).map((t) => t.icon)).toEqual(['✓']);
    s().resetSession();
    s().clearToasts();
  });
});
