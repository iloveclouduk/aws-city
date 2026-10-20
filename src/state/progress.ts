import type { ClientProgress, GameProgress, Progress } from '@/backend/contract';
import { mergeWallet } from './wallet';
import { mergeLights } from './lights';
import { mergeSeasons } from './season';
import { mergeDrops } from './drops';
import { mergeCodex } from './codex';
import { MAX_TOTAL, mergeDecor } from './buildmode';

export type Streak = NonNullable<Progress['streak']>;

const pad = (n: number) => String(n).padStart(2, '0');

/** The player's local calendar day as YYYY-MM-DD (a learning day is the player's day, not UTC's). */
export const dayKey = (date: Date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Whole calendar days from `a` to `b` (both YYYY-MM-DD). Counted on UTC midnights, so a 23- or 25-hour
 * local day around a clock change is still exactly one day apart.
 */
export const daysBetween = (a: string, b: string) => {
  const utc = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
};

/** A missed day is forgiven once a week: the streak freeze. */
export const FREEZE_DAYS = 7;
/** True when a one-day gap before `today` can be covered by the freeze (none used in the last week). */
const canFreeze = (prev: Streak, today: string) => daysBetween(prev.last, today) === 2 && (!prev.frozen || daysBetween(prev.frozen, today) >= FREEZE_DAYS);

/**
 * The streak after a learning day on `today`: the same day changes nothing, the next day adds one, one missed day is
 * covered by the weekly freeze (it keeps the streak going and records the day it was used), and a longer gap starts
 * again at 1. A clock that went backwards keeps what was earned.
 */
export const nextStreak = (prev: Streak | undefined, today: string): Streak => {
  if (!prev) return { days: 1, last: today, best: 1 };
  const gap = daysBetween(prev.last, today);
  if (gap <= 0) return prev;
  if (canFreeze(prev, today)) return { ...prev, days: prev.days + 1, last: today, best: Math.max(prev.best, prev.days + 1), frozen: today };
  const days = gap === 1 ? prev.days + 1 : 1;
  return { ...(prev.frozen ? { frozen: prev.frozen } : {}), days, last: today, best: Math.max(prev.best, days) };
};

/** The streak as it stands on `today`: alive if the last learning day was today or yesterday (or the day before, while the freeze can still cover it), else 0. */
export const currentStreak = (s: Streak | undefined, today: string) => {
  if (!s) return 0;
  const gap = daysBetween(s.last, today);
  return gap === 0 || gap === 1 || (gap === 2 && (!s.frozen || daysBetween(s.frozen, today) >= FREEZE_DAYS)) ? s.days : 0;
};

/** Two copies of a streak: the later `last` wins (ties: more days), and `best` is the higher of both. */
export const mergeStreak = (a: Streak | undefined, b: Streak | undefined): Streak | undefined => {
  if (!a || !b) return a ?? b;
  const later = a.last > b.last ? a : b.last > a.last ? b : a.days >= b.days ? a : b;
  // The freeze used most recently counts (it's spent for a week from then).
  const frozen = [a.frozen, b.frozen].filter(Boolean).sort().at(-1);
  return { days: later.days, last: later.last, best: Math.max(a.best, b.best, later.days), ...(frozen ? { frozen } : {}) };
};

/** What the player did on one day (device-local; the synced part is the streak). */
export interface DayLog {
  day: string;
  cards: number;
  puzzles: number;
  fixes: number;
  /** Mini-game rounds (absent in logs saved before games counted). */
  games?: number;
  /** Workshop steps done (v2.10). */
  labs?: number;
  /** AWS North Hall talks passed (their own kind, so a talk doesn't tick "Do a workshop step"). */
  talks?: number;
  /** Sandbox designs that passed review and paid (their own kind: a design isn't a puzzle, and it's no Today goal). */
  designs?: number;
  /** City Clients side jobs done (their own kind, no Today goal: a job is a station's puzzle, terminal or card). */
  jobs?: number;
}
export type LearningKind = 'cards' | 'puzzles' | 'fixes' | 'games' | 'labs' | 'talks' | 'designs' | 'jobs';

/** Adds one learning action to the day's log, starting a fresh log when the day has changed. */
export const bumpDay = (log: DayLog | undefined, kind: LearningKind, today: string): DayLog => {
  const base = log?.day === today ? log : { day: today, cards: 0, puzzles: 0, fixes: 0, games: 0 };
  return { ...base, [kind]: (base[kind] ?? 0) + 1 };
};

/** Two copies of one game's record: bests and counts take the higher; the timed best of the later ISO week wins (v2.12). */
const mergeGame = (x: GameProgress, y: GameProgress): GameProgress => {
  const out: GameProgress = { best: Math.max(x.best, y.best), plays: Math.max(x.plays, y.plays) };
  // A side saved before v2.12 has no `scored`: its plays stand in for it (as recordGame does), so merging an old copy never loses rounds.
  if (x.scored !== undefined || y.scored !== undefined) out.scored = Math.max(x.scored ?? x.plays, y.scored ?? y.plays);
  const weekly = [x, y].filter((g) => g.bestWeek && g.bestTimed !== undefined).sort((a, b) => a.bestWeek!.localeCompare(b.bestWeek!) || a.bestTimed! - b.bestTimed!).at(-1);
  if (weekly) Object.assign(out, { bestTimed: weekly.bestTimed, bestWeek: weekly.bestWeek });
  return out;
};

/** Two copies of one business's side jobs (v2.13): the higher level, every task done in either, the earlier date per level. */
export function mergeClient(a: ClientProgress, b: ClientProgress): ClientProgress {
  const done = [...new Set([...a.done, ...b.done])].sort();
  const at: Record<string, string> = { ...a.at };
  for (const [k, v] of Object.entries(b.at ?? {})) at[k] = at[k] && at[k] < v ? at[k] : v;
  return { level: Math.max(a.level, b.level), done, ...(Object.keys(at).length ? { at } : {}) };
}

const pickBy = <T>(a: Record<string, T> | undefined, b: Record<string, T> | undefined, better: (x: T, y: T) => T) => {
  if (!a && !b) return undefined;
  const out: Record<string, T> = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = k in out ? better(out[k]!, v) : v;
  return out;
};

/**
 * Two copies of a player's progress (this surface, the other surface, the server) combined so nothing
 * earned in either is lost: discoveries and finished quests stick, XP (landmarks and citizens) and bests take the higher value, fix times the newest.
 * Pure and order-independent, so every surface converges on the same result.
 */
export const mergeProgress = (a: Progress, b: Progress): Progress => {
  const landmarks = pickBy(a.landmarks, b.landmarks, (x, y) => ({ discovered: x.discovered || y.discovered, xp: Math.max(x.xp, y.xp) }))!;
  const merged: Progress = { version: a.version, landmarks, updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt };
  // v2.7: each Region's city merges landmark by landmark, the same way.
  const cities = pickBy(a.cities, b.cities, (x, y) => ({ landmarks: pickBy(x.landmarks, y.landmarks, (l, m) => ({ discovered: l.discovered || m.discovered, xp: Math.max(l.xp, m.xp) }))! }));
  if (cities) merged.cities = cities;
  // v2.12: a card remembered once stays remembered, whichever copy's schedule wins.
  const cards = pickBy(a.cards, b.cards, (x, y) => {
    const card = y.reps > x.reps || (y.reps === x.reps && y.due > x.due) ? y : x;
    return (x.remembered || y.remembered) && !card.remembered ? { ...card, remembered: true as const } : card;
  });
  const quests = pickBy(a.quests, b.quests, (x, y) => {
    if (x.status !== y.status) return x.status === 'done' ? x : y;
    return y.step > x.step || (y.step === x.step && (y.count ?? 0) > (x.count ?? 0)) ? y : x;
  });
  const puzzles = pickBy(a.puzzles, b.puzzles, (x, y) => ({ best: Math.max(x.best, y.best) }));
  const games = pickBy(a.games, b.games, mergeGame);
  // v2.3: what citizens learned (higher wins) and when findings were fixed (newest wins).
  const citizens = pickBy(a.citizens, b.citizens, (x, y) => ({ xp: Math.max(x.xp, y.xp) }));
  const fixes = pickBy(a.fixes, b.fixes, (x, y) => (y > x ? y : x));
  if (cards) merged.cards = cards;
  if (citizens) merged.citizens = citizens;
  if (fixes) merged.fixes = fixes;
  if (quests) merged.quests = quests;
  if (puzzles) merged.puzzles = puzzles;
  if (games) merged.games = games;
  // v2.9: a token found stays found; the earlier date is when it was found.
  const finds = pickBy(a.finds, b.finds, (x, y) => (x < y ? x : y));
  if (finds) merged.finds = finds;
  // v2.10: a workshop step done stays done (for real beats practice); the earlier finish date wins. Talks like finds.
  const workshops = pickBy(a.workshops, b.workshops, (x, y) => {
    const steps = pickBy(x.steps, y.steps, (s, t) => (s === 'real' || t === 'real' ? 'real' : 'practice'))!;
    const done = x.done && y.done ? (x.done < y.done ? x.done : y.done) : (x.done ?? y.done);
    return done ? { steps, done } : { steps };
  });
  if (workshops) merged.workshops = workshops;
  const talks = pickBy(a.talks, b.talks, (x, y) => (x < y ? x : y));
  if (talks) merged.talks = talks;
  // v2.11: a badge stays earned (earlier date wins); a design's newest copy wins; the profile is a choice, like the bill.
  const badges = pickBy(a.badges, b.badges, (x, y) => (x < y ? x : y));
  if (badges) merged.badges = badges;
  const designs = pickBy(a.designs, b.designs, (x, y) => (y.updatedAt > x.updatedAt ? y : x));
  if (designs) merged.designs = designs;
  // v2.13: a business keeps the higher level, every task done in either copy and the earlier date per level. v2.16: a
  // city's decorations merge prop by prop, a removed one never coming back (src/state/buildmode.ts mergeDecor).
  const clients = pickBy(a.clients, b.clients, mergeClient);
  if (clients) merged.clients = clients;
  const decor = pickBy(a.decor, b.decor, mergeDecor);
  if (decor) {
    // Never more than MAX_TOTAL in all (what the server holds): the latest-placed go first.
    let over = Object.values(decor).reduce((n, c) => n + c.props.length, 0) - MAX_TOTAL;
    for (const r of Object.keys(decor).sort()) {
      if (over <= 0) break;
      const c = decor[r]!;
      const cut = Math.min(over, c.props.length);
      decor[r] = { ...c, props: c.props.slice(0, c.props.length - cut) };
      over -= cut;
    }
    merged.decor = decor;
  }
  // v2.14: coins earned and spent only go up, so the higher of each counter (src/state/wallet.ts).
  const wallet = mergeWallet(a.wallet, b.wallet);
  if (wallet) merged.wallet = wallet;
  // v2.15: City Lights (days lit in either), season roads (higher points, steps claimed in either), supply drops
  // (everything owned) and the codex's combos (earlier date): src/state/lights.ts, season.ts, drops.ts, codex.ts.
  const lights = mergeLights(a.lights, b.lights);
  if (lights) merged.lights = lights;
  const seasons = mergeSeasons(a.seasons, b.seasons);
  if (seasons) merged.seasons = seasons;
  const drops = mergeDrops(a.drops, b.drops);
  if (drops) merged.drops = drops;
  const codex = mergeCodex(a.codex, b.codex);
  if (codex) merged.codex = codex;
  const streak = mergeStreak(a.streak, b.streak);
  if (streak) merged.streak = streak;
  // v2.5: the bill switch is a choice, not a score: the newer copy's choice wins, and a copy that never set it doesn't
  // count. On a tie, off wins (each server read costs the player money).
  const [newer, older] = b.updatedAt > a.updatedAt ? [b, a] : [a, b];
  const bill = a.updatedAt === b.updatedAt && a.bill !== undefined && b.bill !== undefined ? a.bill && b.bill : (newer.bill ?? older.bill);
  if (bill !== undefined) merged.bill = bill;
  const profile = newer.profile ?? older.profile;
  if (profile) merged.profile = profile;
  return merged;
};

/** True when `b` adds nothing to `a` (so there's nothing to load or save). */
export const sameProgress = (a: Progress, b: Progress) => JSON.stringify(mergeProgress(a, b)) === JSON.stringify(mergeProgress(a, a));

/**
 * Today's small goals on Home (the shift): a few cards, one puzzle, one mini-game, one workshop step, one fix and a job
 * from the order board (City Clients), each only once its area is open; at most SHIFT_MAX of them, and (always a bonus)
 * a Drawing board design. A shift that would have fewer than SHIFT_MIN goals asks for one more job instead. The day's
 * finish line is fixed the first time Home shows goals that day (`set`, see settleToday): an area that opens later in the
 * day is a `bonus` goal, so "2/3 done" never turns into "2/4".
 */
export interface TodayGoal {
  id: Exclude<LearningKind, 'talks'>;
  label: string;
  have: number;
  goal: number;
  /** Opened after the day's goals were set: worth doing, but it doesn't move the finish line. */
  bonus?: boolean;
}
export const TODAY_CARDS = 5;
/** A shift has this many goals at most (more open areas: the rest are bonus goals), and asks for at least this many when it can. */
export const SHIFT_MAX = 5;
export const SHIFT_MIN = 3;
export function todayGoals(
  log: DayLog | undefined,
  day: string,
  open: { learn: boolean; puzzles: boolean; care: boolean; games?: boolean; labs?: boolean; designs?: boolean; jobs?: number },
  set?: readonly TodayGoal['id'][],
): TodayGoal[] {
  const today = log?.day === day ? log : undefined;
  const goals: TodayGoal[] = [];
  if (open.learn) goals.push({ id: 'cards', label: `Review ${TODAY_CARDS} cards`, have: Math.min(TODAY_CARDS, today?.cards ?? 0), goal: TODAY_CARDS });
  if (open.puzzles) goals.push({ id: 'puzzles', label: 'Pass a puzzle', have: Math.min(1, today?.puzzles ?? 0), goal: 1 });
  if (open.games) goals.push({ id: 'games', label: 'Play a mini-game', have: Math.min(1, today?.games ?? 0), goal: 1 });
  if (open.labs) goals.push({ id: 'labs', label: 'Do a workshop step', have: Math.min(1, today?.labs ?? 0), goal: 1 });
  if (open.care) goals.push({ id: 'fixes', label: 'Fix something in the city', have: Math.min(1, today?.fixes ?? 0), goal: 1 });
  // The order board feeds the shift (`open.jobs`: jobs open on it now; a job pays once ever, so the ones done today
  // still count): one job, two when the shift would otherwise be short and the board has them.
  const jobsDone = today?.jobs ?? 0;
  const jobs = (open.jobs ?? 0) + jobsDone;
  if (jobs > 0) {
    const n = Math.min(jobs, goals.length + 1 < SHIFT_MIN ? 2 : 1);
    goals.push({ id: 'jobs', label: n === 1 ? 'Do a job from the order board' : `Do ${n} jobs from the order board`, have: Math.min(n, jobsDone), goal: n });
  }
  // Past SHIFT_MAX, the rest are worth a chip but don't move the finish line.
  for (const g of goals.slice(SHIFT_MAX)) g.bonus = true;
  // The Drawing board is free play: worth a chip, never part of the day's finish line.
  if (open.designs) goals.push({ id: 'designs', label: 'Draw a design', have: Math.min(1, today?.designs ?? 0), goal: 1, bonus: true });
  if (!set) return goals;
  // The day's own goals first, then the bonus ones.
  const mine = goals.filter((g) => !g.bonus && set.includes(g.id));
  return [...mine, ...goals.filter((g) => g.bonus || !set.includes(g.id)).map((g) => ({ ...g, bonus: true }))];
}

/** Overtime: once the shift is done, one optional goal more, and a bonus crate for it (src/state/drops.ts). */
export interface OvertimeGoal {
  id: 'jobs' | 'games' | 'cards';
  label: string;
  have: number;
  goal: number;
}
const OVERTIME = { jobs: 2, games: 2, cards: 10 } as const;

/**
 * The overtime goal for a finished shift: two more jobs from the order board when it's open, else two more mini-game
 * rounds, else ten more cards, counted past what the shift's own goals asked. Undefined while the shift isn't done or
 * nothing is open.
 */
export function overtimeGoal(log: DayLog | undefined, day: string, open: { learn: boolean; games?: boolean; jobs?: number }, goals: TodayGoal[]): OvertimeGoal | undefined {
  const { done, of } = todayDone(goals);
  if (!of || done < of) return undefined;
  const today = log?.day === day ? log : undefined;
  const asked = (id: TodayGoal['id']) => goals.find((g) => g.id === id && !g.bonus)?.goal ?? 0;
  const past = (id: OvertimeGoal['id']) => Math.max(0, (today?.[id] ?? 0) - asked(id));
  const pick = (id: OvertimeGoal['id'], label: string): OvertimeGoal => {
    const goal = OVERTIME[id];
    return { id, label, goal, have: Math.min(goal, past(id)) };
  };
  // Jobs only when the board still has enough of them (each pays once ever).
  if ((open.jobs ?? 0) + past('jobs') >= OVERTIME.jobs) return pick('jobs', `Overtime: ${OVERTIME.jobs} more jobs from the order board`);
  if (open.games) return pick('games', `Overtime: ${OVERTIME.games} more mini-game rounds`);
  if (open.learn) return pick('cards', `Overtime: review ${OVERTIME.cards} more cards`);
  return undefined;
}

/** Which goals a day started with (device-local, like the day's log). */
export interface TodaySet {
  day: string;
  ids: TodayGoal['id'][];
}

/**
 * The day's goals, fixed at the first look: a saved set for `day` stands; otherwise today's open goals become the set.
 * A day that started with nothing open (a brand-new player) takes the first goals that appear.
 */
export function settleToday(saved: TodaySet | undefined, day: string, open: readonly TodayGoal['id'][]): TodaySet {
  if (saved?.day === day && saved.ids.length) return saved;
  return { day, ids: [...open] };
}

/** "2/3 done": only the day's own goals count towards it. */
export const todayDone = (goals: TodayGoal[]) => {
  const mine = goals.filter((g) => !g.bonus);
  return { done: mine.filter((g) => g.have >= g.goal).length, of: mine.length };
};
