// Infill: the ordinary buildings that fill a real map's blocks between the landmarks (brownstones, walk-ups, lofts,
// pre-war apartments, glass slabs and setback towers, art/tiles/infill_art.py), and the street furniture of a dense
// downtown (street trees, traffic lights at avenue junctions, cars parked along the avenues). Pure and deterministic:
// the same plan, progress and catalogue always give the same city (hashes of the Region and the tile, never rng()).
//
// The free ground of every building block is cut into near-square segments (|w − h| ≤ 1, at most 3×4), so one draw
// depth per segment (iso.footprintDepth) keeps walkers and cars on the right side of it (tests/depth.test.ts);
// src/game/InfillLayer.ts composes each segment into one image. A building's height is the lowest of three caps:
//   - how built up the real place is (plan.density, OpenStreetMap: 0 low-rise … 3 skyscrapers),
//   - its district's level, so the skyline still grows with what the player learns (locked: low-rise behind hoardings,
//     Novice: up to mid-rise, Practitioner: high-rise, Expert and Master: skyscrapers); neighbourhoods (no district)
//     follow the density alone,
//   - the clear ground behind it (decor.clearBehind, 8 px a step), so infill never hides a landmark or the AZ islands
//     and river past the core's north and west edges.
import type { LandmarkLayout, Tile } from '@/world/layout';
import { frontRowTiles, RIVER } from '@/world/layout';
import { crossings, type CityPlan } from '@/world/plan';
import { DISTRICTS, servicesIn, type DistrictId } from '@/world/taxonomy';
import { clearBehind, tileHash } from './decor';
import { CITY_ISO, footprintDepth } from './iso';
import { isZebra } from './RoadGraph';

export type HeightClass = 'low' | 'mid' | 'high' | 'sky';
export const HEIGHT_CLASSES: readonly HeightClass[] = ['low', 'mid', 'high', 'sky'];
/** Tallest a class may be drawn, px above the footprint's N corner (the art contract). */
export const CLASS_MAX_PX: Record<HeightClass, number> = { low: 40, mid: 80, high: 130, sky: 180 };
export type InfillStyle = 'warm' | 'cool';

/** One infill sprite, as art/tiles/infill.json lists it (h = px above the anchor, the footprint's N corner). */
export interface InfillSprite {
  name: string;
  kind: string;
  cls: HeightClass;
  fw: number;
  fh: number;
  style: InfillStyle;
  h: number;
}

/** A building in a segment: its sprite and footprint (tiles). */
export interface InfillBuilding {
  sprite: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Its height above its N corner, px. */
  px: number;
  cls: HeightClass;
}

/** A near-square block of tiles drawn as one image. `group` is its district, or 'hood' for a neighbourhood. */
export interface InfillSegment {
  id: string;
  group: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  buildings: InfillBuilding[];
}

/** A small thing on the street: a street tree, a traffic light, a parked car. (x, y) may be fractional (grid space). */
export interface StreetItem {
  kind: 'tree' | 'signal' | 'car' | 'garden';
  sprite: string;
  x: number;
  y: number;
  /** Signals: which traffic it shows ('ns' = streets along y, 'ew' = along x) and its junction's id (signalPhase). */
  axis?: 'ns' | 'ew';
  node?: number;
}

export interface InfillResult {
  segments: InfillSegment[];
  street: StreetItem[];
  /** Free build tiles (what infill may use) and the ones a building stands on. */
  free: number;
  filled: number;
}

export interface InfillWorld {
  plan: CityPlan;
  /** Hashes mix the Region in, so two cities on similar streets don't look alike. */
  region: string;
  /** The landmarks standing (placed): footprints, work spots and the rows in front of them stay clear. */
  landmarks: LandmarkLayout[];
  isSidewalk: (x: number, y: number) => boolean;
  districtOpen: (d: DistrictId) => boolean;
  /** Tier of a service's landmark here: -1 not discovered, 0 construction, 1..4. */
  tierOf: (serviceId: string) => number;
  catalogue: readonly InfillSprite[];
  style: InfillStyle;
  /** Tiles decor took (hoardings, billboards, pocket parks, lot signs): infill leaves them. */
  taken?: (x: number, y: number) => boolean;
  /** At most this many parked cars (the display-object budget; the panel passes fewer). */
  maxCars?: number;
}

/** Segment shapes, biggest first (fewer images), each near-square so one depth orders it. */
const SHAPES: readonly [number, number][] = [
  [4, 3],
  [3, 4],
  [3, 3],
  [3, 2],
  [2, 3],
  [2, 2],
  [2, 1],
  [1, 2],
  [1, 1],
];
/** Street trees on every third sidewalk tile; a car on about this share of an avenue's kerb tiles. */
export const TREE_EVERY = 3;
export const PARK_SHARE = 0.3;
export const MAX_PARKED = 48;
/** Street lamps stand where (x + 2y) % 17 == 0 (CityMap.buildStreetFurniture): trees keep off those tiles. */
const isLampTile = (x: number, y: number) => (x + 2 * y) % 17 === 0;
/**
 * How wide and how far the clear ground is checked: three columns either side (a landmark's sprite reaches half a tile
 * past its footprint, a 2×2 building's a tile past its N corner's column) and a step of margin (a tile's south corner
 * sits a step below its N corner), so a building's top never touches a landmark's base.
 */
export const CLEAR_BAND = 3;
export const CLEAR_MARGIN = 1;
/** A locked district's tallest class where the real place is built up (density ≥ 2): mid-rise walk-ups. */
export const LOCKED_CAP = 1;
/** Share of segments drawn in the other style (accents), of big segments with a courtyard garden, of a segment's dominant kind. */
export const STYLE_ACCENT = 0.25;
export const GARDEN_SHARE = 1 / 8;
export const DOMINANT_SHARE = 0.65;
const GARDEN = ['tree1', 'tree0', 'flowers', 'pack:bench_SE', 'tree1'] as const;
/** AZ islands start this many tiles out from the core (layout.RIVER.to + 1): infill never rises over them. */
const ISLAND_FROM = RIVER.to + 1;
const CAR_SKINS = ['navy', 'orange', 'white', 'teal'] as const;
/** How far a parked car sits from its lane tile's centre, towards the kerb (lanes run at ±0.22). */
export const PARK_OFFSET = 0.4;

/** The district level (average landmark tier of the buildings put up, at least two): what decor's skyline used. */
export function districtLevel(id: DistrictId, tierOf: (s: string) => number) {
  const tiers = servicesIn(id)
    .map((s) => tierOf(s.id))
    .filter((t) => t >= 0);
  return tiers.reduce((a, b) => a + b, 0) / Math.max(2, tiers.length);
}

/** The tallest class a district's level allows: locked low, mid from Novice (1), high from Practitioner (2), sky from Expert (3). */
export const levelClass = (open: boolean, level: number): number => (!open ? 0 : level >= 3 ? 3 : level >= 2 ? 2 : level >= 1 ? 1 : 0);

/** Region hash seed (FNV-1a of the code), mixed into every tile hash. */
const seedOf = (region: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < region.length; i++) h = Math.imul(h ^ region.charCodeAt(i), 0x01000193);
  return (h >>> 0) % 1_000_003;
};

export function infillPlan(w: InfillWorld): InfillResult {
  const plan = w.plan;
  const N = plan.size;
  const empty: InfillResult = { segments: [], street: [], free: 0, filled: 0 };
  if (plan.kind !== 'osm') return empty;
  const seed = seedOf(w.region);
  const hash = (x: number, y: number, s: number) => tileHash(x, y, s * 7 + seed);
  const idx = (x: number, y: number) => y * N + x;
  const inCore = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;

  const foot = new Map<number, LandmarkLayout>();
  for (const l of w.landmarks)
    for (let y = l.footprint.y; y < l.footprint.y + l.footprint.h; y++) for (let x = l.footprint.x; x < l.footprint.x + l.footprint.w; x++) foot.set(idx(x, y), l);
  const spots = new Set(w.landmarks.map((l) => idx(l.workSpot.x, l.workSpot.y)));
  const fronts = new Set(w.landmarks.flatMap((l) => frontRowTiles(l)).map((t) => idx(t.x, t.y)));
  const districtIds = new Set<string>(DISTRICTS.map((d) => d.id));
  /** The group a build tile belongs to (its district, or 'hood'), or undefined when it isn't build ground. */
  const groupAt = (x: number, y: number): string | undefined => {
    const p = plan.plotAt({ x, y });
    if (p && districtIds.has(p)) return p;
    return p === undefined && plan.groundAt?.(x, y) === 'hood' ? 'hood' : undefined;
  };
  // An open district's open lots are its pocket parks (decor.ts): the whole lot stays green, never infill.
  const parkLot = new Set<number>();
  for (const d of DISTRICTS)
    if (w.districtOpen(d.id))
      for (const l of plan.openLots(d.id)) for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) parkLot.add(idx(x, y));
  const free = new Uint8Array(N * N);
  const groupOf: (string | undefined)[] = new Array(N * N);
  let freeCount = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      const g = groupAt(x, y);
      if (!g || plan.isRoad({ x, y }) || plan.isWater?.(x, y) || w.isSidewalk(x, y) || foot.has(i) || spots.has(i) || fronts.has(i) || parkLot.has(i) || w.taken?.(x, y)) continue;
      free[i] = 1;
      groupOf[i] = g;
      freeCount++;
    }

  // Height caps per tile: density, then the district's level. A locked district stays low-rise, with walk-ups where
  // the real place is built up (density ≥ 2): never above mid-rise until it opens.
  const levelCap = new Map<string, number>();
  for (const d of DISTRICTS) levelCap.set(d.id, w.districtOpen(d.id) ? levelClass(true, districtLevel(d.id, w.tierOf)) : -1);
  const capAt = (x: number, y: number) => {
    const dens = Math.max(0, Math.min(3, plan.density?.(x, y) ?? 1));
    const g = groupOf[idx(x, y)];
    if (g === 'hood' || g === undefined) return dens;
    const lv = levelCap.get(g) ?? -1;
    return lv < 0 ? (dens >= 2 ? LOCKED_CAP : 0) : Math.min(dens, lv);
  };
  /** A block's corner: sidewalk on two sides that meet (a corner shop goes there). */
  const blockCorner = (x: number, y: number) => {
    const sw = (dx: number, dy: number) => w.isSidewalk(x + dx, y + dy);
    return (sw(1, 0) || sw(-1, 0)) && (sw(0, 1) || sw(0, -1));
  };

  // Segments: near-square rectangles of free tiles of one group, biggest first, scanning back to front.
  const covered = new Uint8Array(N * N);
  const fits = (x: number, y: number, sw: number, sh: number, g: string) => {
    for (let j = y; j < y + sh; j++)
      for (let i = x; i < x + sw; i++) if (!inCore(i, j) || !free[idx(i, j)] || covered[idx(i, j)] || groupOf[idx(i, j)] !== g) return false;
    return true;
  };
  const rects: { x: number; y: number; w: number; h: number; group: string }[] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      if (!free[i] || covered[i]) continue;
      const g = groupOf[i]!;
      const flip = hash(x, y, 1) < 0.5;
      const shapes = flip ? SHAPES.map(([a, b]) => [b, a] as [number, number]) : SHAPES;
      const [sw, sh] = shapes.find(([a, b]) => fits(x, y, a, b, g)) ?? [1, 1];
      for (let j = y; j < y + sh; j++) for (let k = x; k < x + sw; k++) covered[idx(k, j)] = 1;
      rects.push({ x, y, w: sw, h: sh, group: g });
    }

  // Buildings: each segment's tiles back to front, the biggest footprint that fits under every cap.
  const other: InfillStyle = w.style === 'warm' ? 'cool' : 'warm';
  const styled = (st: InfillStyle) => w.catalogue.filter((s) => s.style === st);
  const gardens: StreetItem[] = [];
  const rank = (c: HeightClass) => HEIGHT_CLASSES.indexOf(c);
  const segments: InfillSegment[] = [];
  let filled = 0;
  for (const r of rects) {
    const depth = footprintDepth(CITY_ISO, r);
    // Clear steps behind each tile: a landmark drawn behind this segment, or the AZ islands past the core's north and
    // west edges (from ISLAND_FROM tiles out, across the river).
    const hidden = (tx: number, ty: number) => {
      if (tx <= -ISLAND_FROM || ty <= -ISLAND_FROM) return true;
      const l = foot.get(idx(tx, ty));
      return !!l && inCore(tx, ty) && footprintDepth(CITY_ISO, l.footprint) < depth;
    };
    const clear = new Map<number, number>();
    const clearAt = (x: number, y: number) => {
      let c = clear.get(idx(x, y));
      if (c === undefined) clear.set(idx(x, y), (c = clearBehind(x, y, hidden, CLEAR_BAND) - CLEAR_MARGIN));
      return c;
    };
    const used = new Uint8Array(r.w * r.h);
    const buildings: InfillBuilding[] = [];
    // Each segment has a character: mostly the city's style (now and then the other one, as an accent), a dominant
    // kind with the odd different neighbour, and sometimes a courtyard garden on its front corner.
    const segStyle = hash(r.x, r.y, 9) < STYLE_ACCENT ? other : w.style;
    const cat = styled(segStyle).length ? styled(segStyle) : styled(w.style).length ? styled(w.style) : w.catalogue;
    const kinds = [...new Set(cat.filter((s) => s.kind !== 'corner').map((s) => s.kind))];
    const dominant = kinds[Math.floor(hash(r.x, r.y, 10) * kinds.length)];
    if (r.w * r.h >= 9 && hash(r.x, r.y, 11) < GARDEN_SHARE) {
      const gx = r.x + r.w - 1;
      const gy = r.y + r.h - 1;
      used[(gy - r.y) * r.w + (gx - r.x)] = 1;
      gardens.push({ kind: 'garden', sprite: GARDEN[Math.floor(hash(gx, gy, 12) * GARDEN.length)], x: gx, y: gy });
    }
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        if (used[(y - r.y) * r.w + (x - r.x)]) continue;
        // What may stand with its N corner here: a footprint inside the segment on unused tiles, its class under every
        // tile's cap and its height under every tile's clear ground (a tile further forward sees it 8 px taller a step).
        const ok = (s: InfillSprite) => {
          if (x + s.fw > r.x + r.w || y + s.fh > r.y + r.h) return false;
          for (let j = y; j < y + s.fh; j++)
            for (let i = x; i < x + s.fw; i++) {
              if (used[(j - r.y) * r.w + (i - r.x)]) return false;
              if (rank(s.cls) > capAt(i, j)) return false;
              if (s.h + 8 * (i - x + j - y) > clearAt(i, j) * 8) return false;
            }
          return true;
        };
        const fit = cat.filter(ok);
        if (!fit.length) continue;
        // A shop on the corner of the block.
        const shops = blockCorner(x, y) ? fit.filter((s) => s.kind === 'corner') : [];
        if (shops.length) {
          const s = shops[Math.floor(hash(x, y, 13) * shops.length)];
          used[(y - r.y) * r.w + (x - r.x)] = 1;
          buildings.push({ sprite: s.name, x, y, w: 1, h: 1, px: s.h, cls: s.cls });
          filled++;
          continue;
        }
        // Mostly as tall as allowed, sometimes a step or two lower, so a block has a skyline, not a wall.
        const top = Math.max(...fit.map((s) => rank(s.cls)));
        const roll = hash(x, y, 2);
        const want = Math.max(0, top - (roll < 0.55 ? 0 : roll < 0.85 ? 1 : 2));
        let pool: InfillSprite[] = [];
        for (let c = want; c >= 0 && !pool.length; c--) pool = fit.filter((s) => rank(s.cls) === c);
        if (!pool.length) pool = fit;
        // The segment's dominant kind most of the time (an accent otherwise; corner shops stay on corners).
        const plain = pool.filter((s) => s.kind !== 'corner');
        if (plain.length) pool = plain;
        const dom = pool.filter((s) => s.kind === dominant);
        if (dom.length && hash(x, y, 14) < DOMINANT_SHARE) pool = dom;
        else if (dom.length < pool.length) pool = pool.filter((s) => s.kind !== dominant);
        // Bigger footprints usually (fewer, grander buildings), then a hashed pick among the variants.
        const area = Math.max(...pool.map((s) => s.fw * s.fh));
        const big = pool.filter((s) => s.fw * s.fh === area);
        const pick = hash(x, y, 3) < 0.4 ? pool : big;
        const s = pick[Math.floor(hash(x, y, 4) * pick.length)];
        for (let j = y; j < y + s.fh; j++) for (let i = x; i < x + s.fw; i++) used[(j - r.y) * r.w + (i - r.x)] = 1;
        buildings.push({ sprite: s.name, x, y, w: s.fw, h: s.fh, px: s.h, cls: s.cls });
        filled += s.fw * s.fh;
      }
    if (!buildings.length) continue;
    // Back to front: the order they're painted in.
    buildings.sort((a, b) => footprintDepth(CITY_ISO, a) - footprintDepth(CITY_ISO, b) || a.x - b.x);
    segments.push({ id: `${r.group}:${r.x},${r.y}`, group: r.group, x: r.x, y: r.y, w: r.w, h: r.h, depth, buildings });
  }

  return { segments, street: [...streetItems(w, hash, foot, spots, fronts), ...gardens], free: freeCount, filled };
}

/** Street trees, traffic lights at avenue junctions and cars parked along the avenues' kerbs. */
function streetItems(
  w: InfillWorld,
  hash: (x: number, y: number, s: number) => number,
  foot: Map<number, LandmarkLayout>,
  spots: Set<number>,
  fronts: Set<number>,
): StreetItem[] {
  const plan = w.plan;
  const N = plan.size;
  const idx = (x: number, y: number) => y * N + x;
  const out: StreetItem[] = [];
  const roadAt = (x: number, y: number) => plan.roadAt(x, y);
  const nearJunction = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (roadAt(x + dx, y + dy)?.axis === 'junction') return true;
    return false;
  };
  const buildGround = (x: number, y: number) => {
    const p = plan.plotAt({ x, y });
    return (p !== undefined && p !== 'square' && p !== 'day1' && p !== 'campus') || plan.groundAt?.(x, y) === 'hood';
  };
  const reserved = new Set<number>();

  // Traffic lights: the corners of every junction where an avenue (a 2-wide street) crosses.
  const cross = crossings(plan.streets);
  const seen = new Set<number>();
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const isCross = new Set(cross.map((c) => idx(c.x, c.y)));
  for (const c of cross) {
    if (seen.has(idx(c.x, c.y))) continue;
    const box = { x0: c.x, y0: c.y, x1: c.x, y1: c.y };
    const stack = [c];
    seen.add(idx(c.x, c.y));
    while (stack.length) {
      const t = stack.pop()!;
      box.x0 = Math.min(box.x0, t.x);
      box.y0 = Math.min(box.y0, t.y);
      box.x1 = Math.max(box.x1, t.x);
      box.y1 = Math.max(box.y1, t.y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = idx(t.x + dx, t.y + dy);
        if (t.x + dx < 0 || t.y + dy < 0 || t.x + dx >= N || t.y + dy >= N || seen.has(k) || !isCross.has(k)) continue;
        seen.add(k);
        stack.push({ x: t.x + dx, y: t.y + dy });
      }
    }
    if ((box.x1 > box.x0 || box.y1 > box.y0) && roadAt(box.x0, box.y0)?.width === 2) boxes.push(box);
  }
  boxes.forEach((b, node) => {
    // The two side corners (NE and SW on the grid): beside the crossing on screen, never hidden behind it.
    const corners: [number, number, 'ns' | 'ew', Tile][] = [
      [b.x1 + 1, b.y0 - 1, 'ns', { x: b.x1, y: b.y0 }],
      [b.x0 - 1, b.y1 + 1, 'ew', { x: b.x0, y: b.y1 }],
    ];
    for (const [x, y, axis, corner] of corners) {
      const at = roadAt(corner.x, corner.y);
      if (at?.axis !== 'junction' || at.width !== 2 || x < 0 || y < 0 || x >= N || y >= N || !w.isSidewalk(x, y) || spots.has(idx(x, y)) || fronts.has(idx(x, y)) || foot.has(idx(x, y))) continue;
      out.push({ kind: 'signal', sprite: `signal:${axis}`, x, y, axis, node });
      reserved.add(idx(x, y));
    }
  });

  // Street trees: every third sidewalk tile of a building block, off the lamps, work spots, fronts and corners.
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if ((x + y) % TREE_EVERY !== 0 || !w.isSidewalk(x, y) || !buildGround(x, y)) continue;
      const i = idx(x, y);
      if (isLampTile(x, y) || spots.has(i) || fronts.has(i) || foot.has(i) || reserved.has(i) || nearJunction(x, y) || plan.isWater?.(x, y)) continue;
      // Towards the kerb: the first road beside it.
      const toRoad = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => plan.isRoad({ x: x + dx, y: y + dy }));
      if (!toRoad) continue;
      out.push({ kind: 'tree', sprite: `tree:street:${hash(x, y, 5) < 0.5 ? 0 : 1}`, x: x + toRoad[0] * 0.3, y: y + toRoad[1] * 0.3 });
    }

  // Parked cars: along each avenue's two kerb lanes, clear of junctions, zebras and the highway's gate.
  const cars: StreetItem[] = [];
  for (const s of plan.streets) {
    if (s.width !== 2) continue;
    for (let a = s.from; a <= s.to; a++)
      for (const lane of [0, 1] as const) {
        const across = s.at + lane;
        const [x, y] = s.axis === 'x' ? [a, across] : [across, a];
        const r = roadAt(x, y);
        if (!r || r.axis === 'junction') continue;
        const [ax, ay] = s.axis === 'x' ? [1, 0] : [0, 1];
        if ([-1, 0, 1].some((k) => isZebra(x + ax * k, y + ay * k, plan) || roadAt(x + ax * k, y + ay * k)?.axis === 'junction')) continue;
        if (Math.abs(x - plan.gate.x) + Math.abs(y - plan.gate.y) <= 3) continue;
        // The kerb: away from the other lane.
        const side = lane === 0 ? -1 : 1;
        const [kx, ky] = s.axis === 'x' ? [x, y + side] : [x + side, y];
        if (!w.isSidewalk(kx, ky)) continue;
        if (hash(x, y, 6) >= PARK_SHARE) continue;
        const skin = CAR_SKINS[Math.floor(hash(x, y, 7) * CAR_SKINS.length)];
        const dir = s.axis === 'x' ? (hash(x, y, 8) < 0.5 ? 'SE' : 'NW') : hash(x, y, 8) < 0.5 ? 'SW' : 'NE';
        const off = side * PARK_OFFSET;
        cars.push({ kind: 'car', sprite: `veh:car:${skin}:${dir}`, x: s.axis === 'x' ? x : x + off, y: s.axis === 'x' ? y + off : y });
      }
  }
  const maxCars = w.maxCars ?? MAX_PARKED;
  // An even spread when there are more kerbs than the budget: every k-th one.
  const step = cars.length > maxCars ? cars.length / maxCars : 1;
  for (let i = 0, n = 0; i < cars.length && n < maxCars; i += step, n++) out.push(cars[Math.floor(i)]);
  return out;
}

/** The tiles a segment covers (for blocking walkers and tests). */
export const segmentTiles = (s: Pick<InfillSegment, 'x' | 'y' | 'w' | 'h'>): Tile[] =>
  Array.from({ length: s.w * s.h }, (_, i) => ({ x: s.x + (i % s.w), y: s.y + Math.floor(i / s.w) }));
/** The tiles a building stands on (what's blocked: an empty corner of a segment stays walkable grass). */
export const buildingTiles = (s: InfillSegment): Tile[] => s.buildings.flatMap((b) => segmentTiles(b));
/** What decides a segment's picture: when this is unchanged the composed frame can be kept. */
export const segmentKey = (s: InfillSegment) => `${s.id}|${s.w}x${s.h}|${s.buildings.map((b) => `${b.sprite}@${b.x},${b.y}`).join(';')}`;
