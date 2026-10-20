// Spot: a log to read. Tap the lines that matter, then Done. A wrong tap shows its hint and counts. Pass when every
// flagged line is marked and the wrong taps are within the limit.
import type { SpotPanel } from './types';
import type { TimeUp } from './shared';

export interface SpotState {
  panel: SpotPanel;
  marked: boolean[];
  wrongTaps: number;
  /** The last wrong tap's line, for its hint. */
  wrong?: number;
  done: boolean;
  timedOut: boolean;
}

export type SpotAction = { type: 'tap'; line: number } | { type: 'done' } | TimeUp;

export const deal = (panel: SpotPanel): SpotState => ({ panel, marked: panel.lines.map(() => false), wrongTaps: 0, done: false, timedOut: false });

export const missed = (s: SpotState) => s.panel.lines.filter((l, i) => l.flag && !s.marked[i]).length;
export const passed = (s: SpotState) => !s.timedOut && s.done && missed(s) <= s.panel.pass.missed && s.wrongTaps <= s.panel.pass.maxWrongTaps;
export const failed = (s: SpotState) => s.timedOut || s.wrongTaps > s.panel.pass.maxWrongTaps || (s.done && !passed(s));

export function step(s: SpotState, a: SpotAction): SpotState {
  if (passed(s) || failed(s)) return s;
  if (a.type === 'timeUp') return { ...s, timedOut: true };
  if (a.type === 'done') return { ...s, done: true, wrong: undefined };
  const line = s.panel.lines[a.line];
  if (!line) return s;
  if (!line.flag) return { ...s, wrongTaps: s.wrongTaps + 1, wrong: a.line };
  const marked = [...s.marked];
  marked[a.line] = !marked[a.line];
  return { ...s, marked, wrong: undefined };
}
