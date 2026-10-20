// Badges: one for each milestone the player can look back on. Almost all are read straight from the synced progress
// (a crown, a streak, all six tokens in a city…), so they're the same on every surface and never need awarding; a
// few come from moments the progress doesn't keep (the re:Invent quiz), and those are kept in Progress.badges (v2.11)
// with the date. Pure: My City lists them, and the store notices a newly earned one to celebrate it once.
import type { Progress } from '@/backend/contract';
import { hasGoldenJacket } from '@/world/culture';
import { TALKS } from '@/world/conference';
import { PLACES } from '@/world/places';
import { SERVICES } from '@/world/taxonomy';
import { foundIn, TOKENS_PER_CITY } from '@/world/tokens';
import { builtCities } from './cities';
import { PUZZLE_PASS } from './ladder';
import { levelOf } from './mastery';
import { tierOf } from './selectors';

export interface Badge {
  id: string;
  name: string;
  icon: string;
  /** How to earn it, in a sentence. */
  how: string;
  earned: (p: Progress) => boolean;
}

/** The highest level any building reached, in any city (global services count once). */
export function bestLevel(p: Progress) {
  let best = -1;
  const regions: (string | undefined)[] = [undefined, ...Object.keys(p.cities ?? {})];
  for (const r of regions) for (const s of SERVICES) best = Math.max(best, levelOf(p, s.id, r));
  return best;
}
const anyTier = (p: Progress, tier: number) => SERVICES.some((s) => tierOf(p, s.id) >= tier);
const games = [...new Set(PLACES.flatMap((pl) => (pl.game ? [pl.game] : [])))];
const workshops = (p: Progress) => Object.values(p.workshops ?? {});

export const BADGES: Badge[] = [
  { id: 'first-building', name: 'First Brick', icon: '🧱', how: 'Put up your first building.', earned: (p) => bestLevel(p) >= 0 },
  { id: 'practitioner', name: 'Practitioner', icon: '🔧', how: 'Grow a building to Practitioner.', earned: (p) => anyTier(p, 2) },
  { id: 'master', name: 'Master Builder', icon: '🏗️', how: 'Grow a building to Master.', earned: (p) => anyTier(p, 4) },
  { id: 'first-crown', name: 'First Crown', icon: '👑', how: 'Earn a crown on a Master building.', earned: (p) => bestLevel(p) >= 5 },
  { id: 'legend', name: 'Legend', icon: '🌟', how: 'Take a building to Legend, all three crowns.', earned: (p) => bestLevel(p) >= 7 },
  { id: 'first-puzzle', name: 'Architect', icon: '📐', how: 'Pass an architecture drawing.', earned: (p) => Object.values(p.puzzles ?? {}).some((z) => z.best >= PUZZLE_PASS) },
  { id: 'first-quest', name: 'Questing', icon: '📜', how: 'Finish a quest.', earned: (p) => Object.values(p.quests ?? {}).some((q) => q.status === 'done') },
  { id: 'first-fix', name: 'Fixer', icon: '🩹', how: 'Fix something in your real account with a citizen.', earned: (p) => Object.keys(p.fixes ?? {}).length > 0 },
  { id: 'first-workshop-step', name: 'Hands On', icon: '⌨️', how: 'Do a workshop step.', earned: (p) => workshops(p).some((w) => Object.keys(w.steps).length > 0) },
  { id: 'real-step', name: 'For Real', icon: '☁️', how: 'Do a workshop step for real in your account.', earned: (p) => workshops(p).some((w) => Object.values(w.steps).includes('real')) },
  { id: 'first-workshop', name: 'Established', icon: '🏅', how: 'Finish a whole workshop.', earned: (p) => workshops(p).some((w) => !!w.done) },
  { id: 'first-talk', name: 'In the Audience', icon: '🎤', how: 'Pass a talk in AWS North Hall.', earned: (p) => Object.keys(p.talks ?? {}).length > 0 },
  { id: 'all-talks', name: 'Front Row', icon: '🎟️', how: 'Pass every talk in AWS North Hall.', earned: (p) => TALKS.length > 0 && TALKS.every((t) => p.talks?.[t.id]) },
  { id: 'game-sampler', name: 'Arcade Regular', icon: '🕹️', how: 'Play every mini-game at least once.', earned: (p) => games.every((g) => (p.games?.[g]?.plays ?? 0) > 0) },
  { id: 'streak-3', name: 'Three in a Row', icon: '🔥', how: 'Learn three days in a row.', earned: (p) => (p.streak?.best ?? 0) >= 3 },
  { id: 'streak-7', name: 'A Whole Week', icon: '📅', how: 'Learn seven days in a row.', earned: (p) => (p.streak?.best ?? 0) >= 7 },
  { id: 'streak-30', name: 'Habit', icon: '🗓️', how: 'Learn thirty days in a row.', earned: (p) => (p.streak?.best ?? 0) >= 30 },
  { id: 'all-tokens', name: 'Treasure Hunter', icon: '✨', how: `Find all ${TOKENS_PER_CITY} golden tokens in one city.`, earned: (p) => Object.keys(p.cities ?? {}).some((r) => foundIn(p, r) >= TOKENS_PER_CITY) },
  { id: 'traveller', name: 'Globetrotter', icon: '🌍', how: 'Build in three Regions.', earned: (p) => Object.keys(builtCities(p)).length >= 3 },
  { id: 'first-design', name: 'Drafting Table', icon: '✏️', how: 'Draw a design of three or more services on the Drawing board.', earned: (p) => Object.values(p.designs ?? {}).some((d) => d.nodes.filter((n) => !n.kind.includes(':')).length >= 3) },
  { id: 'golden-jacket', name: 'Golden Jacket', icon: '🧥', how: 'Light every certification trophy in Golden Jacket Hall.', earned: (p) => hasGoldenJacket(p) },
  // Kept in Progress.badges: moments the rest of the progress doesn't record.
  { id: 'reInvent', name: 're:Invent Explorer', icon: '🎪', how: 'Pass the launch quiz in the re:Invent Expo Hall.', earned: (p) => !!p.badges?.reInvent },
];

export const badgeById = (id: string) => BADGES.find((b) => b.id === id);
/** The ids of every badge earned. */
export const earnedBadges = (p: Progress) => BADGES.filter((b) => b.earned(p)).map((b) => b.id);
/** Badges earned in `next` that weren't in `prev` (what to celebrate). */
export const newBadges = (prev: Progress, next: Progress) => {
  const had = new Set(earnedBadges(prev));
  return earnedBadges(next).filter((id) => !had.has(id));
};
