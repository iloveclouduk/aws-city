// Where things sit on the isometric grid. The city is a 3×3 grid of 12×12 plots separated by roads.
// The centre plot is the Town Square; each district claims one plot and fills its six landmark
// slots in the order services are listed in shared/world.json. South of the square is the Day 1 Quarter
// (Amazon culture), and the south-east plot is the Global Gate: the global services (shared/region-facts.json `global`:
// Route 53, CloudFront, IAM, Global Accelerator) that are the same in every Region's city, beside the fulfilment centre and the Region sign.
// The whole city is one Region; its Availability Zones are islands across the river (azsFor), and those islands hold
// the Region's real data centres.

import { MECHANISMS, PRINCIPLES } from './culture';
import { FACTS, isGlobalService, zoneIndex, zonesFor, type Zone } from './regions';
import { DISTRICTS, SERVICES, type DistrictId } from './taxonomy';

export const PLOT = 12;
export const ROAD = 1;
export const GRID = 3 * PLOT + 4 * ROAD; // 40

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Tile {
  x: number;
  y: number;
}

const plotOrigin = (cx: number, cy: number): Tile => ({ x: ROAD + cx * (PLOT + ROAD), y: ROAD + cy * (PLOT + ROAD) });

/**
 * Plot cell for each district; Town Square is (1,1). The 3×3 city has no plot for a seventh district (management):
 * it stands only on a real street plan (zoning.ts), and the classic city leaves it out (unplacedServices).
 */
const DISTRICT_CELLS: Partial<Record<DistrictId, [number, number]>> = {
  storage: [0, 0],
  compute: [1, 0],
  database: [2, 0],
  security: [0, 1],
  networking: [2, 1],
  aiml: [0, 2],
};
export const FUTURE_CELLS: [number, number][] = [];
export const FUTURE_LABELS: string[] = [];
const DAY1_CELL: [number, number] = [1, 2];
const CAMPUS_CELL: [number, number] = [2, 2];

/** Landmark footprints inside a plot, in plot-local coordinates. */
export const SLOTS: Rect[] = [
  { x: 1, y: 1, w: 3, h: 3 },
  { x: 5, y: 1, w: 3, h: 3 },
  { x: 9, y: 1, w: 3, h: 3 },
  { x: 1, y: 6, w: 3, h: 3 },
  { x: 5, y: 6, w: 3, h: 3 },
  { x: 9, y: 6, w: 3, h: 3 },
];
const HQ_SLOT: Rect = { x: 5, y: 10, w: 2, h: 2 };
/**
 * The Global Gate's lots on the campus, the front row first (the fulfilment centre keeps the north-west lot and AWS
 * North Hall the north-east one).
 */
const GATE_SLOTS: Rect[] = [SLOTS[3], SLOTS[4], SLOTS[5], SLOTS[1]];
/**
 * Services that are the same in every Region (Route 53, CloudFront, IAM, Global Accelerator): they stand at the Global
 * Gate, taking its lots in shared/region-facts.json `global` order (a new one goes at the end, so nobody moves).
 */
export const GLOBAL_SERVICE_IDS: string[] = FACTS.global.filter((id) => SERVICES.some((s) => s.id === id));

export interface PlotLayout {
  id: string;
  rect: Rect;
}

export interface LandmarkLayout {
  id: string; // service id, 'hq:<district>', 'plaza', 'lookout', 'workshop', or a culture site id
  districtId?: DistrictId;
  /** A global service's landmark: it stands at the Global Gate (the campus), not in its district's plot. */
  global?: boolean;
  /** Culture / ops sites (Day 1 Quarter, campus): the atlas sprite and sign label. */
  site?: { sprite: string; label: string; sign: boolean };
  footprint: Rect;
  /** Walkable tile where the agent stands to work. */
  workSpot: Tile;
  /** Which side its front (work spot, front row) is on: south (+y) unless 'E' (+x), on a real street plan's east-facing lot. */
  front?: 'S' | 'E';
}

const offset = (o: Tile, r: Rect): Rect => ({ x: o.x + r.x, y: o.y + r.y, w: r.w, h: r.h });
/**
 * The row in front of a landmark's lot: the tiles a tier-3 plaza paves (the middle one is its work spot). South of the
 * lot, or east of it for an east-facing lot on a real street plan (zoning.ts). Decor keeps it clear.
 */
export const frontRowTiles = (l: Pick<LandmarkLayout, 'footprint' | 'front'>): Tile[] =>
  l.front === 'E'
    ? Array.from({ length: l.footprint.h }, (_, i) => ({ x: l.footprint.x + l.footprint.w, y: l.footprint.y + i }))
    : Array.from({ length: l.footprint.w }, (_, i) => ({ x: l.footprint.x + i, y: l.footprint.y + l.footprint.h }));
const frontOf = (r: Rect): Tile => ({ x: r.x + Math.floor(r.w / 2), y: r.y + r.h });

export const TOWN_SQUARE: PlotLayout = { id: 'square', rect: { ...plotOrigin(1, 1), w: PLOT, h: PLOT } };

/** The districts the 3×3 city has a plot for (every one but management). */
export const DISTRICT_PLOTS: Partial<Record<DistrictId, PlotLayout>> = Object.fromEntries(
  DISTRICTS.flatMap((d) => {
    const cell = DISTRICT_CELLS[d.id];
    return cell ? [[d.id, { id: d.id, rect: { ...plotOrigin(...cell), w: PLOT, h: PLOT } }]] : [];
  }),
);

export const FUTURE_PLOTS: PlotLayout[] = FUTURE_CELLS.map(([cx, cy], i) => ({
  id: `future-${i}`,
  rect: { ...plotOrigin(cx, cy), w: PLOT, h: PLOT },
}));

export const DAY1_PLOT: PlotLayout = { id: 'day1', rect: { ...plotOrigin(...DAY1_CELL), w: PLOT, h: PLOT } };
export const CAMPUS_PLOT: PlotLayout = { id: 'campus', rect: { ...plotOrigin(...CAMPUS_CELL), w: PLOT, h: PLOT } };

/** Culture + ops sites. Plaques: the 16 Leadership Principles, then the mechanisms, along the LP Walk. */
function buildSites(): LandmarkLayout[] {
  const out: LandmarkLayout[] = [];
  const site = (o: Tile, r: Rect, id: string, sprite: string, label: string, sign = true) => {
    const fp = offset(o, r);
    out.push({ id, footprint: fp, workSpot: frontOf(fp), site: { sprite, label, sign } });
  };
  const d = DAY1_PLOT.rect;
  site(d, { x: 1, y: 1, w: 3, h: 3 }, 'day1office', 'culture:day1office', 'Day 1 Office');
  site(d, { x: 5, y: 1, w: 3, h: 3 }, 'goldenhall', 'culture:goldenhall', 'Golden Jacket Hall');
  site(d, { x: 9, y: 1, w: 3, h: 3 }, 'expohall', 'culture:expohall', 're:Invent Expo Hall');
  const walk: Tile[] = [...Array.from({ length: 11 }, (_, i) => ({ x: 1 + i, y: 6 })), ...Array.from({ length: 11 }, (_, i) => ({ x: 1 + i, y: 8 }))];
  PRINCIPLES.forEach((p, i) => walk[i] && site(d, { ...walk[i], w: 1, h: 1 }, `lp:${p.id}`, 'culture:lpplaque', p.name, false));
  MECHANISMS.forEach((m, i) => {
    const t = walk[walk.length - MECHANISMS.length + i];
    if (t) site(d, { ...t, w: 1, h: 1 }, `mech:${m.id}`, 'culture:mechplaque', m.name, false);
  });
  site(d, { x: 1, y: 10, w: 1, h: 1 }, 'coe', 'culture:coeboard', 'Correction of Error board');
  site(d, { x: 3, y: 10, w: 1, h: 1 }, 'aboutamazon', 'culture:aboutplaque', 'About Amazon');
  const c = CAMPUS_PLOT.rect;
  // The Region's data centres are on the AZ islands (terrain.ts); the campus keeps the fulfilment centre and the sign.
  site(c, { x: 1, y: 1, w: 3, h: 3 }, 'fulfilment', 'culture:fulfilment', 'Amazon.com Fulfilment Centre');
  // AWS North Hall: the talks from the AWS North conference, one stage each (src/ui/NorthHall.tsx).
  site(c, { x: 9, y: 1, w: 3, h: 3 }, 'northhall', 'culture:northhall', 'AWS North Hall');
  site(c, { x: 11, y: 10, w: 1, h: 1 }, 'regionsign', 'culture:regionsign', 'Region sign', false);
  return out;
}
export const SITES: LandmarkLayout[] = buildSites();
export const isPlaque = (id: string) => id.startsWith('lp:') || id.startsWith('mech:');

/** The river that rings downtown runs this many tiles out from the core (inclusive), all the way round. */
export const RIVER = { from: 2, to: 4 } as const;
/** An AZ island is ISLAND×ISLAND tiles, just across the river. */
export const ISLAND = 7;
/**
 * Where each Availability Zone's island sits, by how many AZs the Region has: slots on the back (west and north) edges,
 * so an island never hides a landmark. 'N13' = north of the core, centred on the road line x = 13; 'W26' = west, on
 * y = 26. Each island's bridge carries that road line over the river (plan B4).
 */
export const AZ_SLOTS: Record<number, readonly string[]> = {
  1: ['N13'],
  2: ['W26', 'N13'],
  3: ['W26', 'N0', 'N26'],
  4: ['W39', 'W13', 'N13', 'N39'],
  5: ['W39', 'W13', 'N0', 'N13', 'N39'],
  6: ['W39', 'W26', 'W13', 'N13', 'N26', 'N39'],
};
/** Most islands a city draws (us-east-1's six; an account that sees more draws the first six). */
export const MAX_ISLANDS = 6;
export const azSlotsFor = (n: number) => AZ_SLOTS[Math.max(1, Math.min(MAX_ISLANDS, Math.round(n) || 1))];
/** The tiles a slot's island covers: across the river from the core, centred on its road line. */
export const slotRect = (slot: string): Rect => {
  const at = Number(slot.slice(1));
  const near = RIVER.to + 1;
  return slot[0] === 'N' ? { x: at - 3, y: -near - ISLAND + 1, w: ISLAND, h: ISLAND } : { x: -near - ISLAND + 1, y: at - 3, w: ISLAND, h: ISLAND };
};

/** One Availability Zone, drawn as an island across the river with a bridge to downtown. */
export interface AzIsland extends Zone {
  slot: string;
  side: 'N' | 'W';
  /** The road line the bridge carries (x for a north island, y for a west one). */
  line: number;
  rect: Rect;
  bridge: {
    /** The core road tile at the city's edge where the bridge's road starts. */
    core: Tile;
    /** Promenade, bridge deck and the island's own stub, from the core outwards. */
    tiles: Tile[];
    /** The end of the island's road (traffic and packets turn here). */
    end: Tile;
  };
}
/** Tile d steps out from the core's edge along a slot's road line. */
const outAlong = (side: 'N' | 'W', line: number, d: number): Tile => (side === 'N' ? { x: line, y: -d } : { x: -d, y: line });
/** How far the island's road reaches in from its shore. */
export const ISLAND_ROAD = 2;

/**
 * A Region's real Availability Zones as islands (us-east-1 has six, us-west-2 four, most three), each labelled with its
 * AZ ID and, when the account told us, its name for it. The count and order come from zonesFor (CLAUDE.md: each Region
 * is built from real facts).
 */
export const azsFor = (
  region: string,
  account?: { name: string; id: string }[],
  /** The city plan's island slots (CityPlan.azSlots); the legacy city's by default. */
  slotsFor: (n: number) => readonly string[] = azSlotsFor,
): AzIsland[] => {
  const zones = zonesFor(region, account).slice(0, MAX_ISLANDS);
  const slots = slotsFor(zones.length);
  return zones.map((z, i) => {
    const slot = slots[i];
    const side = slot[0] as 'N' | 'W';
    const line = Number(slot.slice(1));
    const tiles = Array.from({ length: RIVER.to + ISLAND_ROAD }, (_, k) => outAlong(side, line, k + 1));
    return { ...z, slot, side, line, rect: slotRect(slot), bridge: { core: outAlong(side, line, 0), tiles, end: tiles[tiles.length - 1] } };
  });
};
/** The island an AZ name or AZ ID is on, or undefined when the city can't place it. */
export const azIndex = (islands: Zone[], az: string) => zoneIndex(islands, az);
/**
 * How many of the player's resources stand in each island's AZ: inventory items with an AZ in this Region (an item with
 * no Region is in the home Region). undefined for every island while there's no inventory.
 */
export function azCounts(
  islands: Zone[],
  inv: { items: { az?: string; region?: string }[]; homeRegion?: string } | undefined,
  region: string,
): (number | undefined)[] {
  if (!inv) return islands.map(() => undefined);
  const out = islands.map(() => 0);
  for (const it of inv.items) {
    if (!it.az || (it.region ?? inv.homeRegion ?? region) !== region) continue;
    const i = zoneIndex(islands, it.az);
    if (i !== undefined) out[i]++;
  }
  return out;
}
/** Where the highway leaves the Region (an edge road tile, by the campus): delivery vans and Region links use it. */
export const GATE: Tile = { x: GRID - 1, y: CAMPUS_PLOT.rect.y + 5 };
/** @deprecated The Region gate's old name (kept for one release): use GATE. */
export const REGION_EDGE: Tile = GATE;

/**
 * Which slot each of a district's services takes: the first six in world.json order take the six slots (a global
 * service's slot stays open ground, since it stands at the Global Gate), and a later service takes a lot a global one
 * left open, in order, so every landmark that was already there keeps its place. Plot-local slots. The 3×3 city is
 * full: a service with no slot left (or in a district with no plot) isn't in the classic city (unplacedServices); a
 * real street plan places every one.
 */
function lotsOf(districtId: string): { id: string; slot?: Rect }[] {
  const services = SERVICES.filter((s) => s.districtId === districtId);
  if (!(DISTRICT_PLOTS as Record<string, PlotLayout | undefined>)[districtId]) return services.map((s) => ({ id: s.id }));
  const open = services.slice(0, SLOTS.length).flatMap((s, i) => (isGlobalService(s.id) ? [SLOTS[i]] : []));
  return services.map((s, i) => ({ id: s.id, slot: SLOTS[i] ?? (isGlobalService(s.id) ? undefined : open.shift()) }));
}

function buildLandmarks(): LandmarkLayout[] {
  const out: LandmarkLayout[] = [];
  const sq = TOWN_SQUARE.rect;
  // The Spheres (Console HQ) in the middle of the square; the Concierge works at its front door.
  const plaza = offset(sq, { x: 4, y: 2, w: 4, h: 4 });
  out.push({ id: 'plaza', footprint: plaza, workSpot: frontOf(plaza) });
  const lookout = offset(sq, { x: 10, y: 1, w: 1, h: 1 });
  out.push({ id: 'lookout', footprint: lookout, workSpot: { x: lookout.x, y: lookout.y + 1 } });
  const workshop = offset(sq, { x: 1, y: 7, w: 3, h: 3 });
  out.push({ id: 'workshop', footprint: workshop, workSpot: frontOf(workshop) });

  for (const d of DISTRICTS) {
    const o = DISTRICT_PLOTS[d.id]?.rect;
    if (!o) continue;
    // A global service keeps its district (colour, HQ) but stands at the Global Gate; its district lot stays open
    // ground, so every other landmark keeps its place.
    lotsOf(d.id).forEach(({ id, slot }) => {
      if (isGlobalService(id) || !slot) return;
      const fp = offset(o, slot);
      out.push({ id, districtId: d.id, footprint: fp, workSpot: frontOf(fp) });
    });
    const hq = offset(o, HQ_SLOT);
    out.push({ id: `hq:${d.id}`, districtId: d.id, footprint: hq, workSpot: frontOf(hq) });
  }
  if (GLOBAL_SERVICE_IDS.length > GATE_SLOTS.length) throw new Error('More global services than Global Gate lots');
  GLOBAL_SERVICE_IDS.forEach((id, i) => {
    const fp = offset(CAMPUS_PLOT.rect, GATE_SLOTS[i]);
    out.push({ id, districtId: SERVICES.find((s) => s.id === id)!.districtId, global: true, footprint: fp, workSpot: frontOf(fp) });
  });
  return [...out, ...SITES];
}

export const LANDMARKS: LandmarkLayout[] = buildLandmarks();
/**
 * The services the classic 3×3 city has no lot for (the seventh district, and each district's services past its six
 * slots), in world.json order. They're "not in this city" on the legacy plan only; every real street plan places them.
 */
export const UNPLACED_SERVICES: string[] = SERVICES.filter((s) => !LANDMARKS.some((l) => l.id === s.id)).map((s) => s.id);
export const landmarkLayout = (id: string) => LANDMARKS.find((l) => l.id === id);
/** The Global Gate's landmarks, front row first. */
export const GLOBAL_LANDMARKS: LandmarkLayout[] = LANDMARKS.filter((l) => l.global);

/** The lots a global service left open in its district (it stands at the Global Gate): pocket parks go there (decor). */
export const openLots = (districtId: string): Rect[] => {
  const o = (DISTRICT_PLOTS as Record<string, { rect: Rect }>)[districtId]?.rect;
  if (!o) return [];
  const lots = lotsOf(districtId);
  return SLOTS.filter((slot) => !lots.some((l) => l.slot === slot && !isGlobalService(l.id))).map((slot) => offset(o, slot));
};
/** Where the Global Gate's sign stands: over the middle of its lots. */
export const GLOBAL_GATE_SIGN: Tile = { x: CAMPUS_PLOT.rect.x + 6, y: CAMPUS_PLOT.rect.y + 5 };
/** The plot a service's agent roams: the Global Gate (campus) for a global service, else its district's plot. */
export const homeRectFor = (id: string): Rect | undefined => {
  const l = landmarkLayout(id);
  if (l?.global) return CAMPUS_PLOT.rect;
  const d = l?.districtId ?? SERVICES.find((s) => s.id === id)?.districtId;
  return d ? DISTRICT_PLOTS[d]?.rect : undefined;
};

export const FOUNTAIN: Tile = { x: TOWN_SQUARE.rect.x + 8, y: TOWN_SQUARE.rect.y + 8 };
export const PLAYER_SPAWN: Tile = { x: TOWN_SQUARE.rect.x + 6, y: TOWN_SQUARE.rect.y + 9 };
/** Benches in the square (citizens sit here). */
export const BENCHES: Tile[] = [
  { x: TOWN_SQUARE.rect.x + 9, y: TOWN_SQUARE.rect.y + 7 },
  { x: TOWN_SQUARE.rect.x + 9, y: TOWN_SQUARE.rect.y + 9 },
  { x: TOWN_SQUARE.rect.x + 4, y: TOWN_SQUARE.rect.y + 9 },
];

export const inRect = (t: Tile, r: Rect) => t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h;
export const isRoad = (t: Tile) => t.x % (PLOT + ROAD) === 0 || t.y % (PLOT + ROAD) === 0;

/** Which plot a tile belongs to: a district id, 'square', 'day1', 'campus', 'future-N', or undefined for roads. */
export function plotAt(t: Tile): string | undefined {
  if (isRoad(t)) return undefined;
  if (inRect(t, TOWN_SQUARE.rect)) return 'square';
  if (inRect(t, DAY1_PLOT.rect)) return 'day1';
  if (inRect(t, CAMPUS_PLOT.rect)) return 'campus';
  for (const d of DISTRICTS) {
    const r = DISTRICT_PLOTS[d.id]?.rect;
    if (r && inRect(t, r)) return d.id;
  }
  for (const f of FUTURE_PLOTS) if (inRect(t, f.rect)) return f.id;
  return undefined;
}

export const randomTileIn = (r: Rect, rand = Math.random): Tile => ({
  x: r.x + Math.floor(rand() * r.w),
  y: r.y + Math.floor(rand() * r.h),
});

const FOOTPRINT_TILES = new Set(LANDMARKS.flatMap((l) => Array.from({ length: l.footprint.w * l.footprint.h }, (_, i) => (l.footprint.y + Math.floor(i / l.footprint.w)) * GRID + l.footprint.x + (i % l.footprint.w))));
/** A tile under any landmark's footprint (built or not): what a packet or a path must never cross. */
export const isFootprint = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID && FOOTPRINT_TILES.has(y * GRID + x);
