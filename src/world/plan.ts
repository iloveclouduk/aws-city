// A city's street plan: everything the game needs to know about where the streets, blocks and lots are, behind one
// interface, so a Region gets its own plan (a real downtown's streets) while the code that draws, routes and places
// things stays the same. A Region with a baked OpenStreetMap map (shared/city-maps/, src/world/citymap.ts) gets it
// zoned by src/world/zoning.ts; every other Region, a map that doesn't zone, or `?map=legacy` in the page's URL gets
// `legacyPlan()`: the 3×3 city of 12×12 plots from layout.ts, exactly as before (tests/plan-snapshot.test.ts).
import {
  azSlotsFor,
  BENCHES,
  CAMPUS_PLOT,
  DAY1_PLOT,
  DISTRICT_PLOTS,
  FOUNTAIN,
  GATE,
  GLOBAL_GATE_SIGN,
  GLOBAL_LANDMARKS,
  GRID,
  homeRectFor,
  isFootprint,
  isRoad,
  LANDMARKS,
  landmarkLayout,
  openLots,
  PLAYER_SPAWN,
  PLOT,
  plotAt,
  ROAD,
  SLOTS,
  TOWN_SQUARE,
  type LandmarkLayout,
  type Rect,
  type Tile,
} from './layout';
import { CityMapError, decodeCityMap, rawCityMap } from './citymap';
import { DISTRICTS, type DistrictId } from './taxonomy';
import { zonePlan } from './zoning';

export type Axis = 'x' | 'y';
export type EdgeSide = 'N' | 'W' | 'S' | 'E';

/**
 * A straight street: it runs along `axis` (an 'x' street keeps y = `at` and goes from x = `from` to x = `to`, both
 * included), `width` tiles wide (a 2-tile avenue covers at and at + 1).
 */
export interface Street {
  axis: Axis;
  at: number;
  from: number;
  to: number;
  width: 1 | 2;
}

/** What a road tile is: part of a street running along x or y, or a junction where streets cross. */
export interface RoadInfo {
  axis: Axis | 'junction';
  width: 1 | 2;
}

/** A district's ground: its bounding box and the lots its buildings stand on (absolute tiles). */
export interface DistrictPlan {
  bbox: Rect;
  lots: Rect[];
}

/** What a core tile that isn't road, a superblock or a district holds on a real map: water, a park, or a neighbourhood. */
export type GroundKind = 'water' | 'park' | 'hood';

export interface CityPlan {
  /** Which plan this is: a scene restarts when the Region it enters has a different one. */
  id: string;
  /** A real street map ('osm', © OpenStreetMap contributors) or today's 3×3 city (absent = legacy). */
  kind?: 'osm';
  /** The real city the streets come from, and the credit the map must show. */
  city?: string;
  attribution?: string;
  /** The core is size×size tiles, from (0, 0). */
  size: number;
  isRoad(t: Tile): boolean;
  /** The road at a core tile, or undefined off the road (or outside the core). */
  roadAt(x: number, y: number): RoadInfo | undefined;
  streets: Street[];
  /** The superblocks: the Town Square, the Day 1 Quarter and the campus (the Global Gate). */
  square: Rect;
  day1: Rect;
  campus: Rect;
  /**
   * Each district's ground. A real street plan has every district; the classic 3×3 city has no plot for the seventh
   * (management), so a consumer must handle a missing one.
   */
  districts: Partial<Record<DistrictId, DistrictPlan>>;
  landmarks: LandmarkLayout[];
  /** The Global Gate's landmarks, front row first. */
  globalLandmarks: LandmarkLayout[];
  landmarkLayout(id: string): LandmarkLayout | undefined;
  /** The lots a district's global services left open (pocket parks go there). */
  openLots(districtId: string): Rect[];
  /** 'square', 'day1', 'campus', a district id, or undefined for roads and outside every block. */
  plotAt(t: Tile): string | undefined;
  /** The ground a service's agent roams. */
  homeRectFor(id: string): Rect | undefined;
  isFootprint(x: number, y: number): boolean;
  /** Where the highway leaves the core (an edge road tile). */
  gate: Tile;
  globalGateSign: Tile;
  spawn: Tile;
  fountain: Tile;
  benches: Tile[];
  /** The road lines that reach each edge of the core (x for N/S, y for W/E): bridges cross the river on them. */
  edgeLines: Record<EdgeSide, readonly number[]>;
  /** The island slots for n AZs ('N13' = north, on road line x = 13; 'W26' = west, on y = 26). */
  azSlots(n: number): readonly string[];
  /** Real maps only: water, park or neighbourhood ground at a core tile outside the districts and superblocks. */
  groundAt?(x: number, y: number): GroundKind | undefined;
  /** Real maps only: water inside the core (never walked on or built on). */
  isWater?(x: number, y: number): boolean;
  /** Real maps only: how built-up the real place is, 0..3 (decor leans on it). */
  density?(x: number, y: number): number;
  /** Real maps only: the baked water and park masks, core-local, over the core and the landscape ring. */
  masks?: { water(x: number, y: number): boolean; green(x: number, y: number): boolean };
  /** Real maps only: every lot the streets offer, and the ones no district took (room for services to come). */
  capacity?: number;
  spareLots?: Rect[];
  /**
   * Real maps only: how hard zoning had to try to fit every service (src/world/zoning.ts Effort): streets dropped, a
   * district taking a neighbour's spare block, big blocks split, back streets added, parks built on. {} = plainly.
   */
  zoning?: { dropped: number; steal?: boolean; split?: boolean; alleys?: number; parks?: number };
}

/** The road at a tile of a plan given by its streets (pure; any plan can use it). */
export function roadFromStreets(streets: readonly Street[], size: number) {
  const cover = (s: Street, x: number, y: number) => {
    const [along, across] = s.axis === 'x' ? [x, y] : [y, x];
    return along >= s.from && along <= s.to && across >= s.at && across < s.at + s.width;
  };
  return (x: number, y: number): RoadInfo | undefined => {
    if (x < 0 || y < 0 || x >= size || y >= size) return undefined;
    let ax: Street | undefined;
    let ay: Street | undefined;
    for (const s of streets) if (cover(s, x, y)) s.axis === 'x' ? (ax ??= s) : (ay ??= s);
    if (ax && ay) return { axis: 'junction', width: Math.max(ax.width, ay.width) as 1 | 2 };
    const s = ax ?? ay;
    return s && { axis: s.axis, width: s.width };
  };
}

/** Where an x street crosses a y street, sorted by y then x (the order RoadGraph numbers its junctions). */
export function crossings(streets: readonly Street[]): Tile[] {
  const out = new Map<string, Tile>();
  for (const a of streets)
    for (const b of streets) {
      if (a.axis !== 'x' || b.axis !== 'y') continue;
      for (let dy = 0; dy < a.width; dy++)
        for (let dx = 0; dx < b.width; dx++) {
          const x = b.at + dx;
          const y = a.at + dy;
          if (x >= a.from && x <= a.to && y >= b.from && y <= b.to) out.set(`${x},${y}`, { x, y });
        }
    }
  return [...out.values()].sort((p, q) => p.y - q.y || p.x - q.x);
}

const LINES = Array.from({ length: Math.floor(GRID / (PLOT + ROAD)) + 1 }, (_, i) => i * (PLOT + ROAD)); // 0, 13, 26, 39

function buildLegacy(): CityPlan {
  const streets: Street[] = (['x', 'y'] as const).flatMap((axis) => LINES.map((at) => ({ axis, at, from: 0, to: GRID - 1, width: 1 as const })));
  const roadAt = roadFromStreets(streets, GRID);
  const districts: Partial<Record<DistrictId, DistrictPlan>> = Object.fromEntries(
    DISTRICTS.flatMap((d) => {
      const bbox = DISTRICT_PLOTS[d.id]?.rect;
      return bbox ? [[d.id, { bbox, lots: SLOTS.map((s) => ({ x: bbox.x + s.x, y: bbox.y + s.y, w: s.w, h: s.h })) }]] : [];
    }),
  );
  return {
    id: 'legacy',
    size: GRID,
    // The modulo rule, not roadAt: it's what layout.isRoad has always answered, outside the core too.
    isRoad,
    roadAt,
    streets,
    square: TOWN_SQUARE.rect,
    day1: DAY1_PLOT.rect,
    campus: CAMPUS_PLOT.rect,
    districts,
    landmarks: LANDMARKS,
    globalLandmarks: GLOBAL_LANDMARKS,
    landmarkLayout,
    openLots,
    plotAt,
    homeRectFor,
    isFootprint,
    gate: GATE,
    globalGateSign: GLOBAL_GATE_SIGN,
    spawn: PLAYER_SPAWN,
    fountain: FOUNTAIN,
    benches: BENCHES,
    edgeLines: { N: LINES, W: LINES, S: LINES, E: LINES },
    azSlots: azSlotsFor,
  };
}

let legacy: CityPlan | undefined;
/** Today's 3×3 city (layout.ts), built once. */
export const legacyPlan = (): CityPlan => (legacy ??= buildLegacy());

/** `?map=legacy` in the page's URL (city.html, the side panel) keeps every Region on the legacy city (dev escape hatch). */
export const legacyForced = (search = (globalThis as { location?: { search?: string } }).location?.search ?? '') =>
  new URLSearchParams(search).get('map') === 'legacy';

/** A Region's real plan from its baked map (raw JSON), or undefined when it has none or it doesn't decode or zone. */
export function realPlan(raw: unknown): CityPlan | undefined {
  if (raw === undefined) return undefined;
  try {
    return zonePlan(decodeCityMap(raw));
  } catch (e) {
    if (!(e instanceof CityMapError)) throw e;
    return undefined;
  }
}

const plans = new Map<string, CityPlan>();
/** The street plan for a Region's city (memoized): its real streets when they're baked and zone, else the legacy city. */
export function cityPlanFor(region: string): CityPlan {
  let p = plans.get(region);
  if (!p) plans.set(region, (p = (!legacyForced() && realPlan(rawCityMap(region))) || legacyPlan()));
  return p;
}
/** Is a plan a real street map (it shows the OpenStreetMap credit)? */
export const isRealMap = (p: CityPlan) => p.kind === 'osm';

/**
 * Whether entering `next` needs the city scene restarted: the plan changed, so the ground, roads, landmarks and every
 * route built from them belong to another map. The same plan re-runs the Region switch in place.
 */
export const needsRestart = (current: CityPlan | undefined, next: CityPlan) => !!current && current.id !== next.id;
