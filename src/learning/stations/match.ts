// Match: tap a left card, then a right card. A right pair locks both; a wrong pair shakes and counts a mistake. Each
// right card is used once. Pass when everything is paired within the mistakes allowed.
import type { MatchPanel } from './types';
import { shuffledIndices, type TimeUp } from './shared';

export interface MatchState {
  panel: MatchPanel;
  /** The right column's cards in a shuffled order (the left keeps its order). */
  rightOrder: number[];
  picked?: string;
  /** Locked pairs, left id → right id. */
  matched: Record<string, string>;
  mistakes: number;
  /** The last wrong pair, to shake. */
  wrong?: { left: string; right: string };
  timedOut: boolean;
}

export type MatchAction = { type: 'left'; id: string } | { type: 'right'; id: string } | TimeUp;

export const deal = (panel: MatchPanel, seed: number): MatchState => ({ panel, rightOrder: shuffledIndices(panel.right.length, seed), matched: {}, mistakes: 0, timedOut: false });

export const passed = (s: MatchState) => !s.timedOut && Object.keys(s.matched).length === s.panel.left.length && s.mistakes <= s.panel.pass.maxMistakes;
export const failed = (s: MatchState) => s.timedOut || s.mistakes > s.panel.pass.maxMistakes;
const used = (s: MatchState, rightId: string) => Object.values(s.matched).includes(rightId);

export function step(s: MatchState, a: MatchAction): MatchState {
  if (passed(s) || failed(s)) return s;
  if (a.type === 'timeUp') return { ...s, timedOut: true };
  if (a.type === 'left') {
    if (s.matched[a.id] || !s.panel.left.some((l) => l.id === a.id)) return s;
    return { ...s, picked: s.picked === a.id ? undefined : a.id, wrong: undefined };
  }
  if (!s.picked || used(s, a.id)) return s;
  if (s.panel.pairs[s.picked] === a.id) return { ...s, matched: { ...s.matched, [s.picked]: a.id }, picked: undefined, wrong: undefined };
  return { ...s, mistakes: s.mistakes + 1, wrong: { left: s.picked, right: a.id }, picked: undefined };
}
