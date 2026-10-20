// Scale: one stepper per time slot, from `min` to `max` units. Capacity = units × perUnit; cost = Σ units × costPerUnit.
// Pass when every slot's capacity meets its demand and the cost is within the budget. Every slot starts at `min`, and
// one flat setting for every slot is over budget (tests/clients.test.ts), so the player has to scale with demand.
import type { ScalePanel } from './types';
import type { TimeUp } from './shared';

export interface ScaleState {
  panel: ScalePanel;
  units: number[];
  timedOut: boolean;
}

export type ScaleAction = { type: 'set'; slot: number; units: number } | { type: 'inc'; slot: number } | { type: 'dec'; slot: number } | TimeUp;

export const deal = (panel: ScalePanel): ScaleState => ({ panel, units: panel.slots.map(() => panel.min), timedOut: false });

export const capacity = (s: ScaleState, i: number) => (s.units[i] ?? 0) * s.panel.perUnit;
export const cost = (s: ScaleState) => s.units.reduce((a, n) => a + n * s.panel.costPerUnit, 0);
export const short = (s: ScaleState) => s.panel.slots.map((slot, i) => capacity(s, i) < slot.demand);

export const passed = (s: ScaleState) =>
  !s.timedOut && (!s.panel.pass.meetDemand || short(s).every((x) => !x)) && (!s.panel.pass.withinBudget || cost(s) <= s.panel.budget);
export const failed = (s: ScaleState) => s.timedOut;

export function step(s: ScaleState, a: ScaleAction): ScaleState {
  if (passed(s) || failed(s)) return s;
  if (a.type === 'timeUp') return { ...s, timedOut: true };
  const now = s.units[a.slot];
  if (now === undefined) return s;
  const want = a.type === 'set' ? a.units : a.type === 'inc' ? now + 1 : now - 1;
  const next = Math.max(s.panel.min, Math.min(s.panel.max, Math.round(want)));
  if (next === now) return s;
  const units = [...s.units];
  units[a.slot] = next;
  return { ...s, units };
}
