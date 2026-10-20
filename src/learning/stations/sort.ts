// Sort: cards are dealt one at a time in a shuffled order; the player drops each in a bin. Right: it lands. Wrong: it
// bounces back with its hint, and that's a mistake. Pass when every card has landed within the mistakes allowed;
// time running out (or one mistake too many) fails.
import type { SortPanel } from './types';
import { shuffledIndices, type TimeUp } from './shared';

export interface SortState {
  panel: SortPanel;
  /** Item indices in the order they're dealt. */
  order: number[];
  /** How many have landed (the current card is order[at]). */
  at: number;
  mistakes: number;
  /** The last wrong drop's hint (shown until the next drop). */
  hint?: string;
  /** The bin the last card landed in (or bounced off). */
  last?: { bin: string; right: boolean };
  timedOut: boolean;
}

export type SortAction = { type: 'drop'; bin: string } | TimeUp;

export const deal = (panel: SortPanel, seed: number): SortState => ({ panel, order: shuffledIndices(panel.items.length, seed), at: 0, mistakes: 0, timedOut: false });

export const current = (s: SortState) => (s.at < s.order.length ? s.panel.items[s.order[s.at]!] : undefined);

export const passed = (s: SortState) => !s.timedOut && s.at >= s.order.length && s.mistakes <= s.panel.pass.maxMistakes;
export const failed = (s: SortState) => s.timedOut || s.mistakes > s.panel.pass.maxMistakes;

export function step(s: SortState, a: SortAction): SortState {
  if (passed(s) || failed(s)) return s;
  if (a.type === 'timeUp') return { ...s, timedOut: true };
  const item = current(s);
  if (!item) return s;
  if (item.bin === a.bin) return { ...s, at: s.at + 1, hint: undefined, last: { bin: a.bin, right: true } };
  return { ...s, mistakes: s.mistakes + 1, hint: item.hint, last: { bin: a.bin, right: false } };
}
