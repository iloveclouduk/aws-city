// The city airport: a runway and a control tower outside the gate in every Region, with a terminal and a cargo hangar
// that go up as the player learns (how many buildings in this city have reached Practitioner). A cargo jet lands when a
// building levels up and taxis to the stand with its crates: it celebrates learning, never AWS activity (CLAUDE.md: city
// life is ambience). The site comes from the terrain (src/world/terrain.ts `airport`, the same per Region every time);
// this module lays it out and plots the jet's ground route. Pure, so it's tested without Phaser (tests/airport.test.ts).
import type { Progress } from '@/backend/contract';
import { landmarkOf } from '@/state/cities';
import { tierForXp } from '@/world/places';
import { SERVICES } from '@/world/taxonomy';
import type { Rect, Tile } from './layout';

/** Runway across the back, a taxiway in front of it, then two rows of buildings and the stand. */
export const AIRPORT_W = 10;
export const AIRPORT_H = 4;
/** A building counts once it reaches Practitioner (as a park ride does). */
export const AIRPORT_TIER = 2;

export interface AirportStage {
  id: 'terminal' | 'hangar';
  name: string;
  /** How many Practitioner buildings in this city open it. */
  needs: number;
  /** Or the airport hub's City Clients level that opens it (src/world/clients.ts): the airport grows with its side jobs. */
  hubLevel: number;
}
export const STAGES: AirportStage[] = [
  { id: 'terminal', name: 'Passenger Terminal', needs: 3, hubLevel: 1 },
  { id: 'hangar', name: 'Cargo Hangar', needs: 6, hubLevel: 2 },
];

export interface AirportPiece {
  sprite: string;
  x: number;
  y: number;
  w: number;
  h: number;
  stage?: AirportStage;
  open?: boolean;
}

/** How many buildings in this city have reached Practitioner. */
export function practitioners(p: Progress, region?: string) {
  let n = 0;
  for (const s of SERVICES) {
    const l = landmarkOf(p, s.id, region);
    if (l?.discovered && tierForXp(l.xp) >= AIRPORT_TIER) n++;
  }
  return n;
}

/**
 * The airport's level, 0..3: the Amazon Air hub's City Clients level (src/world/clients.ts, Progress.clients.airport),
 * with today's growth rule as a floor so a city that learns a lot still gets its terminal (3 Practitioner buildings:
 * level 1) and hangar (6: level 2). Level 3 comes only from the hub's side jobs.
 */
export function airportLevel(p: Progress, region?: string) {
  const n = practitioners(p, region);
  const floor = STAGES.filter((st) => n >= st.needs).length;
  return Math.max(0, Math.min(3, Math.max(p.clients?.airport?.level ?? 0, floor)));
}

export const stageOpen = (p: Progress, stage: AirportStage, region?: string) => airportLevel(p, region) >= stage.hubLevel;

/** "2 more buildings at Practitioner to open the Cargo Hangar" (or the hub's jobs, whichever comes first). */
export function stageHint(p: Progress, stage: AirportStage, region?: string) {
  const left = stage.needs - practitioners(p, region);
  return stageOpen(p, stage, region)
    ? `${stage.name}: open`
    : `${left} more ${left === 1 ? 'building' : 'buildings'} at Practitioner, or the hub's level ${stage.hubLevel} side jobs, to open the ${stage.name}`;
}

/** The sprite for each slot at each level (art/tiles/airport_art.py): tower, terminal, stand, hangar slot. */
const AT_LEVEL = {
  tower: ['air:tower:0', 'air:tower', 'air:tower', 'air:tower:3'],
  terminal: ['air:terminal:locked', 'air:terminal', 'air:terminal:2', 'air:terminal:3'],
  stand: ['air:stand', 'air:stand:1', 'air:stand:2', 'air:stand:3'],
  hangar: ['air:hangar:locked', 'air:sort', 'air:hangar', 'air:hangar:3'],
} as const;

/** Everything on the site at the airport's level: runway and taxiway (signs from level 1), the tower, the terminal, the stand and the hangar slot. */
export function airportLayout(site: Rect, p: Progress, region?: string): AirportPiece[] {
  const lv = airportLevel(p, region);
  const out: AirportPiece[] = [];
  const signs = lv >= 2 ? [3, 8] : lv >= 1 ? [3] : [];
  for (let i = 0; i < AIRPORT_W; i++) {
    const end = i === 0 ? 'air:rwyEndW' : i === AIRPORT_W - 1 ? 'air:rwyEndE' : undefined;
    const rwy = end ? (lv >= 3 ? `${end}:3` : end) : `air:rwy${i % 2}`;
    out.push({ sprite: rwy, x: site.x + i, y: site.y, w: 1, h: 1 }, { sprite: signs.includes(i) ? 'air:taxi:sign' : 'air:taxi', x: site.x + i, y: site.y + 1, w: 1, h: 1 });
  }
  const row = site.y + 2;
  const [terminal, hangar] = STAGES;
  out.push({ sprite: AT_LEVEL.tower[lv], x: site.x, y: row, w: 1, h: 2 });
  out.push({ sprite: AT_LEVEL.terminal[lv], x: site.x + 1, y: row, w: 4, h: 2, stage: terminal, open: lv >= terminal.hubLevel });
  out.push({ sprite: AT_LEVEL.stand[lv], x: site.x + 5, y: row, w: 2, h: 2 });
  out.push({ sprite: AT_LEVEL.hangar[lv], x: site.x + 7, y: row, w: 3, h: 2, stage: hangar, open: lv >= hangar.hubLevel });
  return out;
}

export type FlightPhase = 'approach' | 'roll' | 'taxi' | 'unload' | 'takeoff';
export interface FlightLeg {
  phase: FlightPhase;
  /** Tile centres (integer = a tile's centre, as toScreen reads them), in order. */
  path: Tile[];
}

/**
 * The cargo jet's visit: it touches down at the east end heading west, rolls out along the runway, turns onto the
 * taxiway, taxis back east to the stand, unloads, then lines up at the east end and takes off west.
 */
export function flightPlan(site: Rect): FlightLeg[] {
  const rwy = (i: number) => ({ x: site.x + i, y: site.y });
  const twy = (i: number) => ({ x: site.x + i, y: site.y + 1 });
  const stand = { x: site.x + 5.5, y: site.y + 2.5 };
  const east = AIRPORT_W - 1;
  return [
    { phase: 'approach', path: [{ x: site.x + AIRPORT_W + 10, y: site.y }, rwy(east)] },
    { phase: 'roll', path: [rwy(east), rwy(2)] },
    { phase: 'taxi', path: [rwy(2), twy(2), twy(6), stand] },
    { phase: 'unload', path: [stand] },
    { phase: 'taxi', path: [stand, twy(6), twy(east), rwy(east)] },
    { phase: 'takeoff', path: [rwy(east), rwy(0), { x: site.x - 12, y: site.y }] },
  ];
}
