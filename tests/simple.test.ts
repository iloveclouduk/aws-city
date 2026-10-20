// Simple mode (src/state/simple.ts): one place says what every surface shows, and the To-do list is built from the
// next action, today's goals and the order board, deduped, at most five, every button saying what happens and running.
import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { openJobs, planNext, type NextPlan, type OpenJob } from '@/state/next';
import { todayGoals, type TodayGoal } from '@/state/progress';
import { buildTodo as buildList, doneLine, isSimple, shows, TODO_MAX, todoProgress, type Feature, type TodoInput, type TodoTask } from '@/state/simple';
import { QUESTS } from '@/world/content';

/** The rows on screen (the tests below read the list's rows; the overflow and the day's end have their own). */
const buildTodo = (i: TodoInput) => buildList(i).tasks;
const SIMPLE = {};
const EVERYTHING = { simple: false };
const DAY = '2026-10-20';

const HIDDEN: Feature[] = [
  'shift',
  'moreToDo',
  'supplyDrop',
  'overtime',
  'returnNote',
  'weekly',
  'launchDay',
  'certGoal',
  'agentOffer',
  'cityLights',
  'seasonRoad',
  'codex',
  'comboToast',
  'rank',
  'badgeToast',
  'myCityExtras',
  'news',
  'courierHint',
  'blueprint',
  'rushSurge',
  'care',
  'deployTab',
  'drawingBoard',
];

describe('shows(feature, prefs)', () => {
  it('Simple is the default: an absent pref is Simple, only simple: false is Everything', () => {
    expect(isSimple(undefined)).toBe(true);
    expect(isSimple({})).toBe(true);
    expect(isSimple({ simple: true })).toBe(true);
    expect(isSimple(EVERYTHING)).toBe(false);
  });

  it.each(HIDDEN)('Simple hides %s; Everything shows it', (f) => {
    expect(shows(f, SIMPLE)).toBe(false);
    expect(shows(f, EVERYTHING)).toBe(true);
  });

  it('the To-do list is Simple’s alone (Everything has the shift)', () => {
    expect(shows('todo', SIMPLE)).toBe(true);
    expect(shows('todo', EVERYTHING)).toBe(false);
  });

  it('a hidden part comes back in Simple when it’s needed', () => {
    // City care once a quest is finished (or a real account is linked).
    expect(shows('care', SIMPLE, { questsDone: 0 })).toBe(false);
    expect(shows('care', SIMPLE, { questsDone: 1 })).toBe(true);
    expect(shows('care', SIMPLE, { linked: true })).toBe(true);
    // Deploy: a quest's deploy step, a linked account, or a change waiting for approval.
    expect(shows('deployTab', SIMPLE, { steps: ['visit'] })).toBe(false);
    expect(shows('deployTab', SIMPLE, { steps: ['deploy'] })).toBe(true);
    expect(shows('deployTab', SIMPLE, { linked: true })).toBe(true);
    expect(shows('deployTab', SIMPLE, { deployWaiting: true })).toBe(true);
    // The Drawing board only for a design step.
    expect(shows('drawingBoard', SIMPLE, { steps: ['cards'] })).toBe(false);
    expect(shows('drawingBoard', SIMPLE, { steps: ['design'] })).toBe(true);
  });
});

const goal = (id: TodayGoal['id'], have: number, of = 1, bonus?: boolean): TodayGoal => ({ id, label: id, have, goal: of, ...(bonus ? { bonus } : {}) });
const job = (n: number): OpenJob => ({ taskId: `t${n}`, clientId: 'bank', title: `Job ${n}`, station: 'desk', client: 'Riverside Bank' });
const q = QUESTS[0];
const step = (i: number): NextPlan => ({ kind: 'step', label: `Step ${i}`, questId: q.id, step: q.steps[i] });
const runnable = (t: TodoTask) =>
  t.run.kind === 'plan' ? typeof t.run.plan.kind === 'string' && t.run.plan.label.length > 0 : ['cards', 'puzzles', 'games', 'labs', 'fixes', 'jobs', 'designs'].includes(t.run.goal);
/** Every task: a title, one line why, a button that says what happens (never a bare "Go"), and something it runs. */
const wellFormed = (tasks: TodoTask[]) => {
  for (const t of tasks) {
    expect(t.title.length).toBeGreaterThan(0);
    expect(t.why.length).toBeGreaterThan(0);
    expect(t.why).not.toMatch(/\n/);
    expect(t.action).not.toMatch(/^go\b/i);
    expect(t.action.length).toBeGreaterThan(3);
    expect(runnable(t)).toBe(true);
  }
  expect(new Set(tasks.map((t) => t.key)).size).toBe(tasks.length);
  expect(tasks.length).toBeLessThanOrEqual(TODO_MAX);
};

describe('the To-do list', () => {
  it('a new player: the quest step alone, with a button that says where Kai walks', () => {
    const tasks = buildTodo({ next: planNext({ progress: { version: 2, landmarks: {}, updatedAt: '', quests: { [q.id]: { status: 'active', step: 0, count: 0 } } }, cityRegion: 'us-west-2' }), goals: [], jobs: [] });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].action).toMatch(/^Walk to /);
    expect(tasks[0].title).toBe(`${q.title} · step 1 of ${q.steps.length}`);
    // The count is the rows shown: the quest step is one, still to do.
    expect(todoProgress(buildList({ next: step(0), goals: [], jobs: [] }))).toEqual({ done: 0, of: 1, allDone: false });
    wellFormed(tasks);
  });

  it('dedupes: a plan that is one of today’s goals merges into it (its button, the goal’s tick)', () => {
    // A quest's cards step and today's cards goal are one task.
    const tasks = buildTodo({ next: step(1), goals: [goal('cards', 2, 5), goal('puzzles', 0)], jobs: [] });
    expect(tasks.map((t) => t.key)).toEqual(['cards', 'puzzles']);
    expect(tasks[0]).toMatchObject({ action: 'Step 1', title: `${q.title} · step 2 of ${q.steps.length}`, counts: true, done: false, have: 2, goal: 5 });
    // A job plan and the jobs goal: one row, and the board's other jobs don't repeat it.
    const j = buildTodo({ next: { kind: 'job', label: 'Do a job for Riverside Bank', taskId: 't1', clientId: 'bank' }, goals: [goal('jobs', 0)], jobs: [job(1), job(2)] });
    expect(j.filter((t) => t.run.kind === 'plan' && t.run.plan.kind === 'job' && t.run.plan.taskId === 't1')).toHaveLength(1);
    expect(j.map((t) => t.key)).toEqual(['jobs', 'job:t2']);
    wellFormed(tasks);
    wellFormed(j);
  });

  it('a review plan merges with the cards goal; bonus goals stay off the list', () => {
    const tasks = buildTodo({ next: { kind: 'review', label: 'Review 4 cards', where: 'Learn', serviceId: 's3', count: 4 }, goals: [goal('cards', 5, 5), goal('designs', 0, 1, true)], jobs: [] });
    expect(tasks.map((t) => t.key)).toEqual(['cards']);
    expect(tasks[0]).toMatchObject({ action: 'Review 4 cards', done: true });
    // A done cards goal on its own asks for more, never "Review 1 card".
    expect(buildTodo({ next: { kind: 'explore', label: 'Walk round your city' }, goals: [goal('cards', 5, 5)], jobs: [] })[0].action).toBe('Review more cards');
  });

  it('at most five rows, the next action first; the goals over that wait behind "+N more" (ticked ones first), still counted', () => {
    const goals = (['cards', 'puzzles', 'games', 'labs', 'fixes', 'jobs'] as const).map((id, i) => goal(id, i % 2, 1));
    const list = buildList({ next: step(0), goals, jobs: [job(1), job(2), job(3)], gameName: 'S3 Fishing' });
    expect(list.tasks).toHaveLength(TODO_MAX);
    expect(list.tasks[0].key).toBe(`step:${q.id}`);
    expect(list.tasks[0].counts).toBe(false);
    // No goal is dropped: the two over the cap are behind "+2 more", the ticked ones first; no filler jobs at all.
    expect(list.more.map((t) => t.key).sort()).toEqual(['jobs', 'labs']);
    expect(list.more.every((t) => t.done)).toBe(true);
    expect([...list.tasks, ...list.more].filter((t) => t.counts)).toHaveLength(6);
    expect([...list.tasks, ...list.more].some((t) => t.key.startsWith('job:'))).toBe(false);
    // The count is every row the list holds, the quest step too.
    expect(todoProgress(list)).toEqual({ done: 3, of: 7, allDone: false });
    expect(list.tasks.find((t) => t.key === 'games')?.action).toBe('Play S3 Fishing');
    wellFormed(list.tasks);
  });

  it('an open goal behind "+N more" keeps the day open', () => {
    const goals = (['cards', 'puzzles', 'games', 'labs', 'fixes', 'jobs'] as const).map((id) => goal(id, id === 'jobs' ? 0 : 1));
    const list = buildList({ next: step(0), goals, jobs: [job(1)] });
    expect(list.tasks).toHaveLength(TODO_MAX);
    expect(list.more.length).toBeGreaterThan(0);
    expect(todoProgress(list).allDone).toBe(false);
    // The open goal stays on screen; ticked ones wait behind "+N more".
    expect(list.tasks.some((t) => t.key === 'jobs' && !t.done)).toBe(true);
  });

  it('the count always matches the rows: "n/m" counts every row, and the day is done only when every row is ticked', () => {
    // A quest step and two goals, one ticked: 1/3, never "done".
    const open = buildList({ next: step(0), goals: [goal('cards', 5, 5), goal('puzzles', 0)], jobs: [] });
    expect(open.tasks.map((t) => t.key)).toEqual([`step:${q.id}`, 'cards', 'puzzles']);
    expect(todoProgress(open)).toEqual({ done: 1, of: 3, allDone: false });
    // Every goal ticked: the day is done. The quest step leaves the list and waits as the offer ("Want more?"),
    // and the board's jobs don't fill the list (they never tick).
    const day = buildList({ next: step(0), goals: [goal('cards', 5, 5), goal('puzzles', 1)], jobs: [job(1), job(2)] });
    expect(day.tasks.map((t) => t.key)).toEqual(['cards', 'puzzles']);
    expect(day.extra?.key).toBe(`step:${q.id}`);
    expect(todoProgress(day)).toEqual({ done: 2, of: 2, allDone: true });
    // No goals today (a new player): the quest step is the list, and the day is never "done".
    expect(todoProgress(buildList({ next: step(0), goals: [], jobs: [job(1)] })).allDone).toBe(false);
    // Nothing to do at all: no count.
    expect(todoProgress(buildList({ next: { kind: 'explore', label: 'Walk round your city' }, goals: [], jobs: [] }))).toEqual({ done: 0, of: 0, allDone: false });
  });

  it('a first day mid-quest: one game round never ends the day while the quest step is open', () => {
    // Day 1 has one goal (a game). Played: the quest step still counts, so it's 1/2, not "Done for today".
    const day1 = buildList({ next: step(0), goals: [goal('games', 1)], jobs: [] });
    expect(day1.tasks.map((t) => t.key)).toEqual([`step:${q.id}`, 'games']);
    expect(day1.extra).toBeUndefined();
    expect(todoProgress(day1)).toEqual({ done: 1, of: 2, allDone: false });
    // Not played yet: two things to do (the quest step and the game).
    expect(todoProgress(buildList({ next: step(0), goals: [goal('games', 0)], jobs: [] }))).toEqual({ done: 0, of: 2, allDone: false });
    // Two goals ticked: the day can end, and the quest waits as "Want more?".
    const two = buildList({ next: step(0), goals: [goal('games', 1), goal('cards', 5, 5)], jobs: [] });
    expect(todoProgress(two).allDone).toBe(true);
    expect(two.extra?.key).toBe(`step:${q.id}`);
    // No quest under way: one ticked goal is a done day.
    expect(todoProgress(buildList({ next: { kind: 'explore', label: 'Walk round your city' }, goals: [goal('games', 1)], jobs: [] })).allDone).toBe(true);
  });

  it('a short list fills from the order board (never a bare Go), up to three', () => {
    const tasks = buildTodo({ next: { kind: 'explore', label: 'Walk round your city' }, goals: [goal('cards', 0, 5)], jobs: [job(1), job(2), job(3)] });
    expect(tasks.map((t) => t.key)).toEqual(['cards', 'job:t1', 'job:t2']);
    expect(tasks[1].action).toBe('Do a job for Riverside Bank');
    wellFormed(tasks);
  });

  it('every task is runnable and labelled, for real players’ plans and goals', () => {
    const seasoned: Progress = {
      version: 2,
      landmarks: {},
      updatedAt: '',
      quests: Object.fromEntries(QUESTS.map((x) => [x.id, { status: 'done' as const, step: x.steps.length }])),
      cities: { 'us-west-2': { landmarks: { s3: { discovered: true, xp: 50 }, lambda: { discovered: true, xp: 10 }, ec2: { discovered: true, xp: 0 } } } },
    };
    for (const p of [seasoned, { ...seasoned, quests: { [q.id]: { status: 'active' as const, step: 1, count: 0 } } }]) {
      const open = { learn: true, puzzles: true, care: true, games: true, labs: true, designs: true, jobs: openJobs(p, 'us-west-2').length };
      const tasks = buildTodo({ next: planNext({ progress: p, cityRegion: 'us-west-2' }), goals: todayGoals(undefined, DAY, open), jobs: openJobs(p, 'us-west-2'), gameName: 'S3 Fishing' });
      expect(tasks.length).toBeGreaterThanOrEqual(3);
      wellFormed(tasks);
    }
  });

  it('the end of the day says when to come back', () => {
    expect(doneLine(4)).toBe('Done for today. Come back tomorrow: 4 cards ready.');
    expect(doneLine(1)).toBe('Done for today. Come back tomorrow: 1 card ready.');
    expect(doneLine(0)).toMatch(/^Done for today\. Come back tomorrow/);
  });
});
