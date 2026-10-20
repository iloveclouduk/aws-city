// Route (reroute traffic): each flow points at a zone. Tap a flow, then a zone, to move it. Pass when no flow points at
// a dark zone and no zone carries more than its capacity. Only the clock can fail it.
import type { RoutePanel } from './types';
import type { TimeUp } from './shared';

export interface RouteState {
  panel: RoutePanel;
  /** Flow id → the zone it points at now. */
  at: Record<string, string>;
  picked?: string;
  moves: number;
  timedOut: boolean;
}

export type RouteAction = { type: 'flow'; id: string } | { type: 'target'; id: string } | TimeUp;

export const deal = (panel: RoutePanel): RouteState => ({ panel, at: Object.fromEntries(panel.flows.map((f) => [f.id, f.start])), moves: 0, timedOut: false });

/** The load on each zone now. */
export const loads = (s: RouteState): Record<string, number> => {
  const out: Record<string, number> = Object.fromEntries(s.panel.targets.map((t) => [t.id, 0]));
  for (const f of s.panel.flows) out[s.at[f.id]!] = (out[s.at[f.id]!] ?? 0) + f.load;
  return out;
};

/** What's still wrong: flows on dark zones, and zones over capacity. */
export function problems(s: RouteState) {
  const l = loads(s);
  const dark = s.panel.flows.filter((f) => !s.panel.targets.find((t) => t.id === s.at[f.id])?.healthy).map((f) => f.id);
  const over = s.panel.targets.filter((t) => (l[t.id] ?? 0) > t.capacity).map((t) => t.id);
  return { dark, over };
}

export const passed = (s: RouteState) => {
  if (s.timedOut) return false;
  const p = problems(s);
  return (!s.panel.pass.noUnhealthy || p.dark.length === 0) && (!s.panel.pass.noOverCapacity || p.over.length === 0);
};
export const failed = (s: RouteState) => s.timedOut;

export function step(s: RouteState, a: RouteAction): RouteState {
  if (passed(s) || failed(s)) return s;
  if (a.type === 'timeUp') return { ...s, timedOut: true };
  if (a.type === 'flow') return s.panel.flows.some((f) => f.id === a.id) ? { ...s, picked: s.picked === a.id ? undefined : a.id } : s;
  if (!s.picked || !s.panel.targets.some((t) => t.id === a.id)) return s;
  if (s.at[s.picked] === a.id) return { ...s, picked: undefined };
  return { ...s, at: { ...s.at, [s.picked]: a.id }, picked: undefined, moves: s.moves + 1 };
}
