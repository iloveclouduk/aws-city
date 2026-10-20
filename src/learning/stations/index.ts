// City Clients' station panels, one module per mechanic (README: sort, match, route, rotate, scale, spot, order). Each
// is a pure `deal` / `step` reducer with `passed` and `failed`, so the rules are tested without React
// (tests/stations.test.ts) and the panels in src/ui/clients/stations/ only draw them.
import type { StationKind, StationPanel } from './types';
import * as sort from './sort';
import * as match from './match';
import * as route from './route';
import * as rotate from './rotate';
import * as scale from './scale';
import * as spot from './spot';
import * as order from './order';

export * from './types';
export { sort, match, route, rotate, scale, spot, order };

/** The station's name on a task row ("Sort", "Reroute"…). */
const NAMES: Record<StationKind, string> = { sort: 'Sort', match: 'Match', route: 'Reroute', rotate: 'Rotate', scale: 'Scale', spot: 'Spot', order: 'Order' };
export const stationSummary = (kind: StationKind) => NAMES[kind];

/**
 * Plays a station with a perfect player and returns whether it passed: tests use it to prove every panel in
 * shared/clients.json can be solved. (Route and scale take a search, the rest follow their own rules.)
 */
export function solve(panel: StationPanel, seed = 1): boolean {
  switch (panel.kind) {
    case 'sort': {
      let s = sort.deal(panel, seed);
      while (sort.current(s)) s = sort.step(s, { type: 'drop', bin: sort.current(s)!.bin });
      return sort.passed(s);
    }
    case 'match': {
      let s = match.deal(panel, seed);
      for (const l of panel.left) s = match.step(match.step(s, { type: 'left', id: l.id }), { type: 'right', id: panel.pairs[l.id]! });
      return match.passed(s);
    }
    case 'route': {
      // First fit, biggest flows first, onto healthy zones.
      let s = route.deal(panel);
      const free = new Map(panel.targets.filter((t) => t.healthy).map((t) => [t.id, t.capacity]));
      for (const f of [...panel.flows].sort((a, b) => b.load - a.load)) {
        const t = [...free.entries()].sort((a, b) => b[1] - a[1]).find(([, c]) => c >= f.load);
        if (!t) return false;
        free.set(t[0], t[1] - f.load);
        s = route.step(route.step(s, { type: 'flow', id: f.id }), { type: 'target', id: t[0] });
        if (route.passed(s)) return true;
      }
      return route.passed(s);
    }
    case 'rotate': {
      let s = rotate.deal(panel, seed);
      for (const it of panel.items) s = rotate.step(s, { type: 'pick', id: it.id, choice: rotate.rightChoice(panel, it) });
      return rotate.passed(s);
    }
    case 'scale': {
      let s = scale.deal(panel);
      panel.slots.forEach((slot, i) => {
        s = scale.step(s, { type: 'set', slot: i, units: Math.max(panel.min, Math.ceil(slot.demand / panel.perUnit)) });
      });
      return scale.passed(s);
    }
    case 'spot': {
      let s = spot.deal(panel);
      panel.lines.forEach((l, i) => {
        if (l.flag) s = spot.step(s, { type: 'tap', line: i });
      });
      return spot.passed(spot.step(s, { type: 'done' }));
    }
    case 'order': {
      let s = order.deal(panel, seed);
      for (let want = 0; want < panel.steps.length; want++) s = order.step(s, { type: 'move', from: s.order.indexOf(want), to: want });
      return order.passed(order.step(s, { type: 'check' }));
    }
  }
}
