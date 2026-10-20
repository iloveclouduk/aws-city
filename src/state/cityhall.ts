// City Hall: the Town Square's hall levels with the Mayor's rank in this city (src/state/rank.ts), one level per rank.
// Each level opens Decorate items (the catalogue's rank unlocks) and one more past season road (src/state/season.ts).
// It never gates learning: cards, quests, puzzles, games and jobs are all open whatever its level. In the city the
// rank flags round the Console Plaza show it (one per level). Pure (tests/codex.test.ts).
import type { Progress } from '@/backend/contract';
import { CATALOGUE } from './buildmode';
import { cityRank, RANKS } from './rank';

export interface HallLevel {
  level: number;
  rank: (typeof RANKS)[number];
  /** Decorate items this level opens. */
  items: { id: string; name: string; icon: string }[];
  /** Past season roads open at this level (cumulative). */
  seasons: number;
}

export const HALL_LEVELS: HallLevel[] = RANKS.map((rank, i) => ({
  level: i + 1,
  rank,
  items: CATALOGUE.filter((it) => it.unlock?.rank === rank.id).map((it) => ({ id: it.id, name: it.name, icon: it.icon })),
  seasons: i,
}));

/** This city's hall level (1 = Village … 6 = Global City). */
export const hallLevel = (p: Progress, region: string) => RANKS.indexOf(cityRank(p, region).rank) + 1;

/** "Level 3 hall: opens Town houses and 3 past seasons." */
export function hallNext(p: Progress, region: string): string | undefined {
  const next = HALL_LEVELS[hallLevel(p, region)];
  if (!next) return undefined;
  const what = [...next.items.map((i) => `${i.icon} ${i.name}`), 'one more past season'];
  return `At ${next.rank.icon} ${next.rank.name}, City Hall reaches level ${next.level}: ${what.join(', ')}.`;
}
