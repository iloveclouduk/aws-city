// The unlock ladder: what a player sees grows with what they've done. Pure (no store, no I/O), so the side panel and
// the full tab agree (both read the same Progress through storage.local) and the server and contract never change.
// Unlocks are earned: moving around (a tab, a building tap, a quest's button) never opens an area for good. `opened`
// holds only what ⋯ → Peek at everything opened.

import type { Progress } from '@/backend/contract';
import { questById, type QuestStep } from '@/world/content';
import { SERVICES } from '@/world/taxonomy';
import { landmarkOf } from './cities';

/** The panel's tab ids (App.tsx TABS): City (id 'home': today's shift and the places), Learn, Jobs, Deploy. */
export type Tab = 'home' | 'learn' | 'jobs' | 'deploy';

/**
 * Areas that unlock: the tabs plus the panels inside them. 'map' is the places list in the City tab; 'clients' is the
 * Jobs tab (City Clients).
 */
export type Area = Exclude<Tab, 'jobs'> | 'map' | 'learnBuild' | 'care' | 'day1' | 'worldList' | 'news' | 'clients';

export interface LadderInput {
  progress: Progress;
  /** An AWS account is linked (its findings are real, so city care opens at once). */
  linked: boolean;
  /** Any deploy (preview or stack) exists. */
  hasDeploys: boolean;
  /** Areas the player opened anyway (persisted by the UI as `awscity.opened`). */
  opened: ReadonlySet<string>;
}

export interface Ladder {
  tabs: Set<Tab>;
  /** The places list (every district and building) in the City tab. */
  places: boolean;
  /** Puzzles (architecture drawings) and the Drawing board in the Learn tab. */
  learnBuild: boolean;
  /** City care: findings show (they wait in the store until this is true). */
  care: boolean;
  /** The Day 1 Quarter panels. */
  day1: boolean;
  /** "Where AWS runs" (the Region list). */
  worldList: boolean;
  /** AWS's own news and status: the ticker and its toasts (storms still show; they're the real weather). */
  news: boolean;
  /** City Clients: the businesses' side jobs (src/world/clients.ts): the Jobs tab. */
  clients: boolean;
}

/** A puzzle counts as passed at this score (src/learning/scoring.ts passes at 70 with nothing missing). */
export const PUZZLE_PASS = 70;
/** Landmarks that open the places list and "Where AWS runs". */
export const PLACES_AT = 3;
/** Landmarks that open city care. */
export const CARE_AT = 4;

/** The current step of every active quest. */
export const activeSteps = (p: Progress): QuestStep[] =>
  Object.entries(p.quests ?? {}).flatMap(([id, st]) => {
    const step = st.status === 'active' ? questById(id)?.steps[st.step] : undefined;
    return step ? [step] : [];
  });

/** Quests finished. */
export const questsDone = (p: Progress) => Object.values(p.quests ?? {}).filter((q) => q.status === 'done').length;

/** AWS news opens after the first quest (or at once for a linked account), so nothing interrupts it. */
export const newsOpen = (p: Progress, linked: boolean) => linked || questsDone(p) >= 1;

const counts = (p: Progress) => ({
  questsDone: questsDone(p),
  // Anywhere: the ladder follows the player, not one city (src/state/cities.ts).
  discovered: SERVICES.filter((s) => landmarkOf(p, s.id)?.discovered).length,
  cardsReviewed: Object.keys(p.cards ?? {}).length,
  puzzlesPassed: Object.values(p.puzzles ?? {}).filter((x) => x.best >= PUZZLE_PASS).length,
});

/** Each area's rule (the plan's A3 table). The City tab is always open. */
const rules = (i: LadderInput) => {
  const c = counts(i.progress);
  const steps = activeSteps(i.progress);
  const stepIs = (kind: QuestStep['kind']) => steps.some((s) => s.kind === kind);
  const learnBuild = stepIs('puzzle') || c.puzzlesPassed > 0 || i.opened.has('learnBuild');
  return {
    learn: stepIs('cards') || c.cardsReviewed > 0 || c.questsDone > 0 || learnBuild,
    learnBuild,
    map: c.discovered >= PLACES_AT,
    worldList: c.discovered >= PLACES_AT,
    // The Day 1 Quarter (Amazon culture) is open from the start: it's part of the welcome, not a reward.
    day1: true,
    deploy: stepIs('deploy') || c.questsDone >= 1 || i.linked || i.hasDeploys,
    care: c.questsDone >= 1 || c.discovered >= CARE_AT || i.linked,
    news: newsOpen(i.progress, i.linked),
    // City Clients' side jobs open after the first quest has taught the basics (a job uses buildings you've put up).
    clients: c.questsDone >= 1,
  } satisfies Record<Exclude<Area, 'home'>, boolean>;
};

export function ladder(i: LadderInput): Ladder {
  const r = rules(i);
  const open = (a: Area) => r[a as keyof typeof r] || i.opened.has(a);
  const tabs = new Set<Tab>(['home']);
  if (open('learn') || open('learnBuild')) tabs.add('learn');
  if (open('clients')) tabs.add('jobs');
  if (open('deploy')) tabs.add('deploy');
  return { tabs, places: open('map'), learnBuild: open('learnBuild'), care: open('care'), day1: open('day1'), worldList: open('worldList'), news: open('news'), clients: open('clients') };
}

export interface Unlock {
  area: Exclude<Area, 'home'>;
  label: string;
  /** How it unlocks, in the player's words. */
  how: string;
}

/** Locked areas in the order a new player meets them ("Coming up next" names the first). */
const ORDER: Unlock[] = [
  { area: 'learn', label: 'the Learn tab', how: 'Reach a flashcards step, answer a citizen’s question or finish a quest' },
  { area: 'map', label: 'the places list', how: `Put up ${PLACES_AT} buildings` },
  { area: 'care', label: 'City care', how: `Finish a quest or put up ${CARE_AT} buildings` },
  { area: 'learnBuild', label: 'Puzzles', how: 'Reach a puzzle step in a quest' },
  { area: 'deploy', label: 'the Deploy tab', how: 'Finish a quest or connect an AWS account' },
  { area: 'worldList', label: 'Where AWS runs', how: `Put up ${PLACES_AT} buildings` },
  { area: 'news', label: 'AWS news', how: 'Finish your first quest' },
  { area: 'clients', label: 'the Jobs tab', how: 'Finish your first quest' },
];

/** Every area, so "Peek at everything" can open them all at once. */
export const ALL_AREAS: Unlock['area'][] = ORDER.map((u) => u.area);

/** Everything still locked, next first. */
export function lockedAreas(i: LadderInput): Unlock[] {
  const l = ladder(i);
  const isOpen: Record<Unlock['area'], boolean> = {
    learn: l.tabs.has('learn'),
    map: l.places,
    deploy: l.tabs.has('deploy'),
    learnBuild: l.learnBuild,
    care: l.care,
    day1: l.day1,
    worldList: l.worldList,
    news: l.news,
    clients: l.clients,
  };
  return ORDER.filter((u) => !isOpen[u.area]);
}

/** The next area to unlock, or undefined once everything is open. */
export const nextUnlock = (i: LadderInput): Unlock | undefined => lockedAreas(i)[0];
