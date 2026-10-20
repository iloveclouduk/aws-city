// Each Region's city has a rank, and the player is its Mayor: Village → Town → City → Metropolis → Megacity → Global
// City. The rank is what the player built there (every building's level, crowns included) plus the golden tokens found
// on its streets, so it only grows with learning and walking. Pure: the HUD, the world map and My City read it.
import type { Progress } from '@/backend/contract';
import { foundIn, TOKEN_POINTS } from '@/world/tokens';
import { SERVICES } from '@/world/taxonomy';
import { regionInfo } from '@/world/regions';
import { levelOf } from './mastery';
import { isDiscovered } from './selectors';

export interface Rank {
  id: 'village' | 'town' | 'city' | 'metropolis' | 'megacity' | 'global';
  name: 'Village' | 'Town' | 'City' | 'Metropolis' | 'Megacity' | 'Global City';
  icon: string;
  /** Points to reach it. */
  at: number;
}
// Spread so the top is a long, real climb (every building at Master is about 1,500 points; Global City needs crowns
// too), while the first steps up still come within a few days of learning.
export const RANKS: Rank[] = [
  { id: 'village', name: 'Village', icon: '🏡', at: 0 },
  { id: 'town', name: 'Town', icon: '🏘️', at: 60 },
  { id: 'city', name: 'City', icon: '🏙️', at: 250 },
  { id: 'metropolis', name: 'Metropolis', icon: '🌆', at: 700 },
  { id: 'megacity', name: 'Megacity', icon: '🌃', at: 1400 },
  { id: 'global', name: 'Global City', icon: '🌐', at: 2200 },
];
/** Points: each building level (1–7) and each golden token found here. */
export const LEVEL_POINTS = 10;
export { TOKEN_POINTS };

export function cityPoints(p: Progress, region: string) {
  let pts = 0;
  for (const s of SERVICES) if (isDiscovered(p, s.id, region)) pts += Math.max(0, levelOf(p, s.id, region)) * LEVEL_POINTS;
  return pts + foundIn(p, region) * TOKEN_POINTS;
}

export interface CityRank {
  rank: Rank;
  points: number;
  next?: Rank;
  /** 0–1 towards the next rank (1 at the top). */
  pct: number;
}

export function cityRank(p: Progress, region: string): CityRank {
  const points = cityPoints(p, region);
  const i = RANKS.findLastIndex((r) => points >= r.at);
  const rank = RANKS[Math.max(0, i)];
  const next = RANKS[i + 1];
  return { rank, points, next, pct: next ? (points - rank.at) / (next.at - rank.at) : 1 };
}

/** "Mayor of Oregon". */
export const mayorOf = (region: string) => `Mayor of ${regionInfo(region)?.city ?? region}`;

/** "140 more points to Town: every building level is 10, every golden token 5". */
export function nextRankLine(r: CityRank) {
  if (!r.next) return `${r.rank.name}: the top rank. Keep crowning buildings.`;
  return `${r.next.at - r.points} more points to ${r.next.name}: each building level is ${LEVEL_POINTS}, each golden token ${TOKEN_POINTS}.`;
}
