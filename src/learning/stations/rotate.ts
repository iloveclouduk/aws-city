// Rotate: each card is a key or password. Older than the limit and still in use → Rotate; older and unused → Retire;
// within the limit → Leave. A wrong pick flashes the right one and counts a mistake. Pass after every card within the
// mistakes allowed.
import type { RotatePanel } from './types';
import { shuffledIndices, type TimeUp } from './shared';

export type RotateChoice = 'rotate' | 'retire' | 'leave';
export const ROTATE_CHOICES: readonly RotateChoice[] = ['rotate', 'retire', 'leave'];

export interface RotateState {
  panel: RotatePanel;
  order: number[];
  /** Item id → what was picked, and the right answer. */
  answers: Record<string, { picked: RotateChoice; right: RotateChoice }>;
  mistakes: number;
  timedOut: boolean;
}

export type RotateAction = { type: 'pick'; id: string; choice: RotateChoice } | TimeUp;

/** The right answer for a card (the README's rule). */
export const rightChoice = (panel: RotatePanel, item: RotatePanel['items'][number]): RotateChoice =>
  item.ageDays > panel.maxAgeDays ? (item.inUse ? 'rotate' : 'retire') : 'leave';

export const deal = (panel: RotatePanel, seed: number): RotateState => ({ panel, order: shuffledIndices(panel.items.length, seed), answers: {}, mistakes: 0, timedOut: false });

const allDone = (s: RotateState) => Object.keys(s.answers).length === s.panel.items.length;
export const passed = (s: RotateState) => !s.timedOut && allDone(s) && s.mistakes <= s.panel.pass.maxMistakes;
export const failed = (s: RotateState) => s.timedOut || s.mistakes > s.panel.pass.maxMistakes;

export function step(s: RotateState, a: RotateAction): RotateState {
  if (passed(s) || failed(s)) return s;
  if (a.type === 'timeUp') return { ...s, timedOut: true };
  const item = s.panel.items.find((x) => x.id === a.id);
  if (!item || s.answers[a.id]) return s;
  const right = rightChoice(s.panel, item);
  return { ...s, answers: { ...s.answers, [a.id]: { picked: a.choice, right } }, mistakes: s.mistakes + (a.choice === right ? 0 : 1) };
}
