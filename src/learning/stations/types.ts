// City Clients' station panels (Among-Us-style side tasks): the data each one is dealt, exactly as shared/clients.json
// holds it under a task's `panel`. Each kind has a pure reducer and a pass rule in src/learning/stations/<kind>.ts and
// a small React panel in src/ui/clients/stations/. `timed` is seconds or null; Games without a clock drops the timer.

export interface StationBase {
  /** The one line of rules shown on top of the panel. */
  rules: string;
  /** Seconds on the clock, or null for no clock. */
  timed: number | null;
}

export interface SortPanel extends StationBase {
  kind: 'sort';
  bins: { id: string; label: string }[];
  items: { text: string; bin: string; hint: string }[];
  pass: { maxMistakes: number };
}

export interface MatchPanel extends StationBase {
  kind: 'match';
  left: { id: string; text: string }[];
  right: { id: string; text: string }[];
  pairs: Record<string, string>;
  pass: { maxMistakes: number };
}

export interface RoutePanel extends StationBase {
  kind: 'route';
  targets: { id: string; label: string; healthy: boolean; capacity: number }[];
  flows: { id: string; label: string; load: number; start: string }[];
  pass: { noUnhealthy: boolean; noOverCapacity: boolean };
}

export interface RotatePanel extends StationBase {
  kind: 'rotate';
  maxAgeDays: number;
  items: { id: string; label: string; ageDays: number; inUse: boolean }[];
  pass: { maxMistakes: number };
}

export interface ScalePanel extends StationBase {
  kind: 'scale';
  unit: string;
  perUnit: number;
  costPerUnit: number;
  budget: number;
  min: number;
  max: number;
  slots: { label: string; demand: number }[];
  pass: { meetDemand: boolean; withinBudget: boolean };
}

export interface SpotPanel extends StationBase {
  kind: 'spot';
  lines: { text: string; flag: boolean; hint: string }[];
  pass: { missed: number; maxWrongTaps: number };
}

export interface OrderPanel extends StationBase {
  kind: 'order';
  /** In the right order (shuffled on deal). */
  steps: string[];
  pass: { maxChecks: number };
}

export type StationPanel = SortPanel | MatchPanel | RoutePanel | RotatePanel | ScalePanel | SpotPanel | OrderPanel;
export type StationKind = StationPanel['kind'];
export const STATION_KINDS: readonly StationKind[] = ['sort', 'match', 'route', 'rotate', 'scale', 'spot', 'order'];
