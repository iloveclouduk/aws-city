// The one thing to do next (Home's single primary button) and the end of today's shift. Pure: the plan is worked out
// from Progress alone (tests/next.test.ts); the UI registers how a plan runs (setNextRunner), so `nextAction` can be
// called from any card ("next step") without reaching into React.
import type { Progress } from '@/backend/contract';
import { isDue } from '@/learning/srs';
import { clientName, CLIENTS, currentLevel, taskOpen } from '@/world/clients';
import { cardsFor, puzzleById, questById, QUESTS, type QuestStep } from '@/world/content';
import { placeFor } from '@/world/places';
import { offered } from '@/world/regions';
import { SERVICES } from '@/world/taxonomy';
import { foundIn, TOKENS_PER_CITY } from '@/world/tokens';
import { workshopById, WORKSHOPS } from '@/world/workshops';
import { growthOf } from './growth';
import { levelOf } from './mastery';
import { currentStreak, type OvertimeGoal } from './progress';
import { isDiscovered } from './selectors';
import { dueFor } from './srs';
import { coinsToday } from './wallet';

export type AfterQuests =
  | { kind: 'workshop'; id: string; text: string }
  | { kind: 'grow'; id: string; text: string }
  | { kind: 'build'; id: string; text: string }
  | { kind: 'tokens'; text: string };

/** What Connie offers once every quest is done: a workshop, a building to put up, one to grow, then the golden tokens. */
export function afterQuests(p: Progress, region: string): AfterQuests | undefined {
  // A workshop already started comes first, then one not started yet.
  const open = WORKSHOPS.filter((w) => !p.workshops?.[w.id]?.done);
  const started = open.find((w) => Object.keys(p.workshops?.[w.id]?.steps ?? {}).length > 0);
  const w = started ?? open[0];
  if (w) return { kind: 'workshop', id: w.id, text: `${started ? 'Finish' : 'Try'} the “${w.title}” workshop, hands on.` };
  // A building still to put up (something new to learn: one AWS offers in this Region, never a fenced lot), then the
  // built one furthest from Legend.
  const build = SERVICES.find((s) => !isDiscovered(p, s.id, region) && offered(s.id, region));
  if (build) return { kind: 'build', id: build.id, text: `Put up ${placeFor(build.id)?.place ?? build.id}: ask its agent to move in.` };
  const built = SERVICES.filter((s) => isDiscovered(p, s.id, region)).map((s) => ({ id: s.id, level: levelOf(p, s.id, region) }));
  const grow = built.filter((b) => b.level < 7).sort((a, b) => a.level - b.level)[0];
  if (grow) return { kind: 'grow', id: grow.id, text: `Grow ${placeFor(grow.id)?.place ?? grow.id} towards its next level.` };
  if (foundIn(p, region) < TOKENS_PER_CITY) return { kind: 'tokens', text: `Find the golden tokens hidden on this city's streets (${foundIn(p, region)}/${TOKENS_PER_CITY}).` };
  return undefined;
}

// ── Go labels: one label, one thing ─────────────────────────────────────────────

/** A tab a button opens: it says so ("Open cards (Learn)"), so the panel never changes under the player silently. */
export type Where = 'Learn' | 'Deploy' | 'Jobs';

const place = (id: string) => placeFor(id)?.place ?? id;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Where a quest step's button takes the player (none: it happens here, in the city or a card over it). */
export function stepWhere(step: QuestStep): Where | undefined {
  return step.kind === 'cards' || step.kind === 'puzzle' || step.kind === 'design' ? 'Learn' : step.kind === 'deploy' ? 'Deploy' : undefined;
}

/** A quest step's short button label (the Quests list): what pressing it does, and the tab it opens. */
export function stepButton(step: QuestStep): string {
  switch (step.kind) {
    case 'visit':
      return 'Walk there';
    case 'cards':
      return 'Open cards (Learn)';
    case 'puzzle':
      return 'Solve it (Learn)';
    case 'ask':
      return 'Ask the agents';
    case 'deploy':
      return 'Approve it in Deploy';
    case 'choose':
      return 'Make your choice';
    case 'workshop':
      return 'Open the workshop';
    case 'console':
      return 'Start in the console';
    case 'design':
      return 'Draw it (Learn)';
  }
}

/** A quest step as Home's big button: the exact action ("Walk to S3 Lake", "Review 3 cards", "Solve: Static site"). */
export function stepAction(step: QuestStep, count = 0): string {
  switch (step.kind) {
    case 'visit':
      return `Walk to ${place(step.serviceId)}`;
    case 'cards':
      return `Review ${plural(Math.max(1, step.count - count), `${place(step.serviceId)} card`)}`;
    case 'puzzle':
      return `Solve: ${puzzleById(step.puzzleId)?.title ?? 'the drawing'}`;
    case 'ask':
      return 'Ask the agents';
    case 'deploy':
      return 'Approve it in Deploy';
    case 'choose':
      return 'Make your choice';
    case 'workshop':
      return `Open the “${workshopById(step.workshopId)?.title ?? 'hands-on'}” workshop`;
    case 'console':
      return 'Start in the console';
    case 'design':
      return 'Draw a design';
  }
}

// ── The next action ─────────────────────────────────────────────────────────────

/** Cards due again before "Review N cards" outranks starting a new quest. */
export const DUE_MIN = 3;
/** The most cards one "Review N cards" asks for. */
export const REVIEW_MAX = 10;
/** A building this close (stars) to its next level is one action from it ("Ready to upgrade"). */
export const UPGRADE_NEAR = 12;
/** Stars a review pays (src/learning/srs.ts xpFor): a card never seen 4, a card due again 2. */
const NEW_STARS = 4;
const DUE_STARS = 2;

export type NextPlan =
  | { kind: 'step'; label: string; where?: Where; questId: string; step: QuestStep; serviceId?: string }
  | { kind: 'review'; label: string; where: 'Learn'; serviceId: string; count: number }
  | { kind: 'quest'; label: string; questId: string }
  | { kind: 'upgrade'; label: string; where: 'Learn'; serviceId: string; reviews: number }
  | { kind: 'job'; label: string; taskId: string; clientId: string }
  | { kind: 'workshop'; label: string; workshopId: string }
  | { kind: 'build'; label: string; serviceId: string }
  | { kind: 'grow'; label: string; where: 'Learn'; serviceId: string }
  | { kind: 'tokens'; label: string }
  | { kind: 'explore'; label: string };

export interface NextInput {
  progress: Progress;
  /** The city on screen. */
  cityRegion: string;
  /** City Clients' jobs are open (the ladder's `clients`); defaults to "a quest is done", the ladder's own rule. */
  clients?: boolean;
  /** A client the player is helping (store `clientFocus`): its jobs come first. */
  clientFocus?: string;
  now?: number;
}

/** The service a quest step is about (its building bumps when the step is done). */
export function stepService(questId: string, step: QuestStep): string | undefined {
  if ('serviceId' in step) return step.serviceId;
  return questById(questId)?.serviceIds[0];
}

/**
 * Reviewed cards due again now, everywhere (`n`, the threshold), the building with the most of them, and how many are
 * due there (`count`: what "Review N cards" opens, that building's deck).
 */
export function dueNow(p: Progress, region: string, now = Date.now()) {
  const n = Object.values(p.cards ?? {}).filter((c) => isDue(c, now)).length;
  const best = SERVICES.filter((s) => isDiscovered(p, s.id, region))
    .map((s) => ({ id: s.id, due: dueFor(p, s.id, now) }))
    .sort((a, b) => b.due - a.due)[0];
  return { n, serviceId: best && best.due > 0 ? best.id : undefined, count: best?.due ?? 0 };
}

export interface ReadyBuilding {
  serviceId: string;
  place: string;
  /** Stars to its next level. */
  toGo: number;
  /** Reviews that would get it there: its new cards first (4⭐ each), then its cards due again (2⭐ each). */
  reviews: number;
  nextName: string;
}

/**
 * Reviews of one building's deck that would pay `toGo` stars now: new cards first (NEW_STARS), then cards due again
 * (DUE_STARS). Undefined when its deck can't pay that much today (every card seen and not due): no "Upgrade" offer then.
 */
export function reviewsToGo(p: Progress, serviceId: string, toGo: number, now = Date.now()): number | undefined {
  const cards = cardsFor(serviceId);
  const fresh = cards.filter((c) => !p.cards?.[c.id]).length;
  const due = cards.filter((c) => p.cards?.[c.id] && isDue(p.cards[c.id], now)).length;
  const fromNew = Math.min(fresh, Math.ceil(toGo / NEW_STARS));
  const left = toGo - fromNew * NEW_STARS;
  if (left <= 0) return fromNew;
  const fromDue = Math.ceil(left / DUE_STARS);
  return fromDue <= due ? fromNew + fromDue : undefined;
}

/** Buildings one action from their next level (closest first): "EC2 Factory: 2 reviews to Practitioner". */
export function readyToUpgrade(p: Progress, region: string, max = 3, now = Date.now()): ReadyBuilding[] {
  return SERVICES.filter((s) => isDiscovered(p, s.id, region) && cardsFor(s.id).length > 0)
    .map((s) => ({ s, g: growthOf(p, s.id, region) }))
    .filter(({ g }) => g.next !== undefined && g.next - g.xp <= UPGRADE_NEAR && g.next - g.xp > 0)
    .flatMap(({ s, g }) => {
      const reviews = reviewsToGo(p, s.id, g.next! - g.xp, now);
      return reviews === undefined ? [] : [{ serviceId: s.id, place: g.place, toGo: g.next! - g.xp, reviews, nextName: g.nextName! }];
    })
    .sort((a, b) => a.toGo - b.toGo)
    .slice(0, max);
}

export const upgradeLabel = (r: ReadyBuilding) => `Upgrade ${r.place}: ${plural(r.reviews, 'review')} to ${r.nextName}`;

export interface OpenJob {
  taskId: string;
  clientId: string;
  title: string;
  station: string;
  client: string;
}

/** City Clients' jobs the player can do now (their buildings are put up), the focused business first. */
export function openJobs(p: Progress, region: string, focus?: string, max = 3): OpenJob[] {
  const order = [...CLIENTS].sort((a, b) => Number(b.id === focus) - Number(a.id === focus));
  const out: OpenJob[] = [];
  for (const b of order) {
    for (const t of currentLevel(p, b)?.tasks ?? []) {
      if (out.length >= max) return out;
      if (taskOpen(p, t.id, region)) out.push({ taskId: t.id, clientId: b.id, title: t.title, station: t.station, client: clientName(b) });
    }
  }
  return out;
}

/**
 * The one next action, in this order: the active quest's step; cards due again (DUE_MIN or more); a new quest; a
 * building one action from its next level; a client's job; then Connie's after-quests offers; else a walk round town.
 */
export function planNext(i: NextInput): NextPlan {
  const p = i.progress;
  const region = i.cityRegion;
  const quests = p.quests ?? {};
  for (const q of QUESTS) {
    const st = quests[q.id];
    const step = st?.status === 'active' ? q.steps[st.step] : undefined;
    if (step) return { kind: 'step', label: stepAction(step, st!.count ?? 0), where: stepWhere(step), questId: q.id, step, serviceId: stepService(q.id, step) };
  }
  const due = dueNow(p, region, i.now);
  if (due.n >= DUE_MIN && due.serviceId) {
    // The deck it opens is that building's, so the count is that building's (the threshold counts every city's).
    const count = Math.min(due.count, REVIEW_MAX);
    return { kind: 'review', label: `Review ${plural(count, 'card')}`, where: 'Learn', serviceId: due.serviceId, count };
  }
  const fresh = QUESTS.find((q) => !quests[q.id]);
  if (fresh) return { kind: 'quest', label: `Start: ${fresh.title}`, questId: fresh.id };
  const ready = readyToUpgrade(p, region, 1, i.now)[0];
  if (ready) return { kind: 'upgrade', label: upgradeLabel(ready), where: 'Learn', serviceId: ready.serviceId, reviews: ready.reviews };
  const clientsOpen = i.clients ?? Object.values(quests).some((q) => q.status === 'done');
  const job = clientsOpen ? openJobs(p, region, i.clientFocus, 1)[0] : undefined;
  if (job) return { kind: 'job', label: `Do a job for ${job.client}`, taskId: job.taskId, clientId: job.clientId };
  const after = afterQuests(p, region);
  if (after?.kind === 'workshop') return { kind: 'workshop', label: `Open the “${workshopById(after.id)?.title ?? after.id}” workshop`, workshopId: after.id };
  if (after?.kind === 'build') return { kind: 'build', label: `Put up ${place(after.id)}`, serviceId: after.id };
  if (after?.kind === 'grow') return { kind: 'grow', label: `Grow ${place(after.id)}`, where: 'Learn', serviceId: after.id };
  if (after?.kind === 'tokens') return { kind: 'tokens', label: `Find a golden token (${foundIn(p, region)}/${TOKENS_PER_CITY})` };
  return { kind: 'explore', label: 'Walk round your city' };
}

export type NextAction = NextPlan & { run: () => void };

let runner: (plan: NextPlan) => void = () => {};
/** The UI says how a plan runs (App: walk Kai, open a tab, start a quest…). */
export function setNextRunner(fn: (plan: NextPlan) => void) {
  runner = fn;
  return () => {
    if (runner === fn) runner = () => {};
  };
}

/** Runs any plan the way the UI said (the To-do list's tasks: src/state/simple.ts). */
export const runNext = (plan: NextPlan) => runner(plan);

/** The single primary button: what to do next, and `run` to do it. */
export function nextAction(state: { progress: Progress; cityRegion: string; clientFocus?: string }, opts: { clients?: boolean; now?: number } = {}): NextAction {
  const plan = planNext({ progress: state.progress, cityRegion: state.cityRegion, clientFocus: state.clientFocus, ...opts });
  return { ...plan, run: () => runner(plan) };
}

/** The tab a plan opens that its label doesn't already name ("Review 5 cards" → Learn; "Approve it in Deploy" → none). */
export const whereOf = (a: NextPlan): Where | undefined => {
  const w = 'where' in a ? a.where : undefined;
  return w && !a.label.includes(w) ? w : undefined;
};

/** The full button text (its accessible name too): the label, and the tab it opens when the label doesn't say. */
export const actionText = (a: NextPlan) => (whereOf(a) ? `${a.label} (${whereOf(a)})` : a.label);

// ── The end of the shift ────────────────────────────────────────────────────────

/** Stars earned today, building by building (device-local, like the day's log: store `shift`). */
export interface ShiftLog {
  day: string;
  stars: Record<string, number>;
}

/** Adds stars to today's shift log (a new day starts a fresh one). */
export const bumpShift = (log: ShiftLog | undefined, serviceId: string, stars: number, day: string): ShiftLog => {
  const base = log?.day === day ? log : { day, stars: {} };
  return { day, stars: { ...base.stars, [serviceId]: (base.stars[serviceId] ?? 0) + stars } };
};

export interface ShiftSummary {
  /** The shift's main steps (today's own goals) are all done. */
  done: boolean;
  buildings: { serviceId: string; place: string; stars: number }[];
  stars: number;
  coins: number;
  streak: number;
  /** Reviewed cards that will be due by this time tomorrow. */
  cardsTomorrow: number;
  /** "S3 Lake +12⭐ · Lambda Kitchen +4⭐ · 40🪙" */
  line: string;
  /** The natural stop: "Come back tomorrow: 4 cards will be ready." */
  tomorrow: string;
  /** Once the shift is done: the optional overtime goal (src/state/progress.ts overtimeGoal), and whether it's done (its bonus crate is ready). */
  overtime?: OvertimeGoal;
  overtimeDone?: boolean;
}

const DAY_MS = 86_400_000;

/** How today's shift went (the end-of-shift card). `goals` is Home's "2/3 done" (todayDone). */
export function shiftSummary(
  state: { progress: Progress; shift?: ShiftLog },
  day: string,
  opts: { goals?: { done: number; of: number }; coins?: number; now?: number; overtime?: OvertimeGoal } = {},
): ShiftSummary {
  const p = state.progress;
  const now = opts.now ?? Date.now();
  const today = state.shift?.day === day ? state.shift.stars : {};
  const buildings = Object.entries(today)
    .filter(([, n]) => n > 0)
    .map(([serviceId, stars]) => ({ serviceId, place: place(serviceId), stars }))
    .sort((a, b) => b.stars - a.stars);
  const stars = buildings.reduce((n, b) => n + b.stars, 0);
  const coins = opts.coins ?? coinsToday(p, day);
  const cardsTomorrow = Object.values(p.cards ?? {}).filter((c) => c.due <= now + DAY_MS).length;
  const parts = buildings.slice(0, 3).map((b) => `${b.place} +${b.stars}⭐`);
  if (buildings.length > 3) parts.push(`${buildings.length - 3} more`);
  if (coins) parts.push(`${coins}🪙`);
  const done = !!opts.goals && opts.goals.of > 0 && opts.goals.done >= opts.goals.of;
  const ot = done ? opts.overtime : undefined;
  return {
    done,
    ...(ot ? { overtime: ot, overtimeDone: ot.have >= ot.goal } : {}),
    buildings,
    stars,
    coins,
    streak: currentStreak(p.streak, day),
    cardsTomorrow,
    line: parts.join(' · '),
    tomorrow: cardsTomorrow ? `Come back tomorrow: ${plural(cardsTomorrow, 'card')} will be ready.` : 'Come back tomorrow for a new shift.',
  };
}
