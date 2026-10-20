// Order: the steps are dealt shuffled (never already right). Move them into order and press Check: it says how many
// are in the right place. Pass when all are right within the checks allowed.
import type { OrderPanel } from './types';
import { unsolvedOrder, type TimeUp } from './shared';

export interface OrderState {
  panel: OrderPanel;
  /** Step indices as the player has them now (the right order is 0, 1, 2…). */
  order: number[];
  checks: number;
  /** In the right place at the last check. */
  lastRight?: number;
  /** The order the last check saw (Check again on the same order costs nothing). */
  checked?: string;
  timedOut: boolean;
}

export type OrderAction = { type: 'move'; from: number; to: number } | { type: 'check' } | TimeUp;

export const deal = (panel: OrderPanel, seed: number): OrderState => ({ panel, order: unsolvedOrder(panel.steps.length, seed), checks: 0, timedOut: false });

export const rightPlaces = (s: OrderState) => s.order.filter((v, i) => v === i).length;
export const passed = (s: OrderState) => !s.timedOut && s.lastRight === s.panel.steps.length && s.checked === s.order.join(',');
export const failed = (s: OrderState) => s.timedOut || (!passed(s) && s.checks >= s.panel.pass.maxChecks);

export function step(s: OrderState, a: OrderAction): OrderState {
  if (passed(s) || failed(s)) return s;
  if (a.type === 'timeUp') return { ...s, timedOut: true };
  if (a.type === 'check') {
    const key = s.order.join(',');
    if (s.checked === key) return s;
    return { ...s, checks: s.checks + 1, lastRight: rightPlaces(s), checked: key };
  }
  const n = s.order.length;
  if (a.from < 0 || a.from >= n || a.to < 0 || a.to >= n || a.from === a.to) return s;
  const order = [...s.order];
  const [v] = order.splice(a.from, 1);
  order.splice(a.to, 0, v!);
  return { ...s, order };
}
