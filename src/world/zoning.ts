// Zoning: a real street map (src/world/citymap.ts) becomes a CityPlan. Pure and deterministic: the same map always
// zones the same way.
//
// 1. The streets make the roads (roadFromStreets; a width-2 street is an avenue). The baked superblocks keep today's
//    insides: the Town Square (Spheres, fountain, benches), the Day 1 Quarter and the campus (the Global Gate's lots for
//    the global services: Route 53, CloudFront, IAM, Global Accelerator), exactly as layout.ts lays them out, moved to
//    where the bake put each 12×12 block.
// 2. The ground between streets is cut into blocks (flood fill): mostly water → water, mostly park and at least 8×8 →
//    a park, else building ground.
// 3. Each building block offers 3×3 lots whose front row is a sidewalk (facing south, or east where south has no
//    street).
// 4. Districts grow from fixed compass seeds round the square (storage NW, compute N, database NE, security W,
//    networking E, AI/ML SW, management SE; any later district takes the next free direction) over neighbouring
//    blocks, a block a turn, until each has DISTRICT_RESERVE lots or the map runs out; then a district still short of
//    max(services + 2, 10) keeps growing.
// 5. In each district the HQ takes the lot nearest the square, then the services, in world.json order, take the lots
//    nearest the district's seed (lots of blocks taken after step 4's round robin come last): appending a service puts
//    it on the next lot and moves nobody while its district has room.
// 6. Lots left in a district are its open lots (pocket parks); building blocks no district took are neighbourhoods.
//
// A map that can't hold every service (or leaves a work spot unreachable) loses its minor streets one at a time. If
// that isn't enough, zoning tries harder, step by step (EFFORTS): a district short of lots takes a neighbour's spare
// block (one none of the neighbour's buildings stand on, and that it can do without); big blocks are cut into
// neighbourhoods of a few lots so districts can share them; back streets cross the deepest blocks (withAlleys); the
// smallest parks are built on. A map that zones plainly keeps exactly the plan it had (CityPlan.zoning says what it
// took). If nothing works, zoning returns undefined and the Region keeps the legacy city.
import {
  BENCHES,
  CAMPUS_PLOT,
  DAY1_PLOT,
  FOUNTAIN,
  GLOBAL_GATE_SIGN,
  LANDMARKS,
  PLAYER_SPAWN,
  TOWN_SQUARE,
  inRect,
  type LandmarkLayout,
  type Rect,
  type Tile,
} from './layout';
import type { DecodedCityMap, MapStreet } from './citymap';
import { roadFromStreets, type CityPlan, type DistrictPlan, type EdgeSide, type GroundKind } from './plan';
import { isGlobalService } from './regions';
import { DISTRICTS, SERVICES, type DistrictId } from './taxonomy';

/** Lots every district has at least, and how many lots past its services it keeps free. */
export const DISTRICT_LOTS = 10;
export const DISTRICT_SPARE = 2;
/**
 * Lots each district grows to, round robin, before any district's own needs count (when the map has the room): past
 * the biggest district's needs, so a new service rarely makes a district grow (and move its neighbours).
 */
export const DISTRICT_RESERVE = 15;
/** Every map must hold this many lots more than the city has services (room for the services to come). */
export const SPARE_CAPACITY = 20;
/** Streets zoning may drop to make room, at most. */
const MAX_DROPS = 12;
/** Parks zoning may build on to make room, at most (the smallest first). */
const MAX_PARK_HOMES = 4;
/** Back streets zoning may add across the deepest blocks, at most. */
const MAX_ALLEYS = 8;
/** A split block's neighbourhoods hold at most this many lots each. */
const CHUNK_LOTS = 6;
/** How far from the square's centre each district's seed sits, tiles. */
const SEED_DIST = 18;
/** Island slots on one side sit at least this far apart (a 7-tile island and its channel). */
const ISLAND_GAP = 9;

/** Compass seeds round the square, in grid directions (north = −y, west = −x), then the spare directions. */
const SEEDS: Record<DistrictId, [number, number]> = {
  storage: [-1, -1],
  compute: [0, -1],
  database: [1, -1],
  security: [-1, 0],
  networking: [1, 0],
  aiml: [-1, 1],
  management: [1, 1],
};
const SPARE_SEEDS: [number, number][] = [[0, 1]];

export interface Lot extends Rect {
  front: 'S' | 'E';
  block: number;
}

interface Block {
  id: number;
  kind: GroundKind;
  tiles: number[];
  bbox: Rect;
  lots: Lot[];
  cx: number;
  cy: number;
}

export interface ZoneOptions {
  /** The services to place (world.json's by default; tests append one to prove nobody moves). */
  services?: { id: string; districtId: string }[];
  /** Plan id (defaults to `osm:<region>`). */
  id?: string;
}

/**
 * How hard zoning tries to make room (zonePlan raises it only while the plainer zoning fails, so a map that zones
 * plainly keeps exactly its plan): a district short of lots may take a neighbour's spare block (`steal`); big blocks
 * are cut into neighbourhoods of a few lots each, so districts can share one (`split`); `alleys` new back streets
 * cross the deepest blocks; the `parks` smallest parks are built on.
 */
export interface Effort {
  steal?: boolean;
  split?: boolean;
  alleys?: number;
  parks?: number;
}
/** The efforts zonePlan tries, in order. */
const EFFORTS: Effort[] = [
  {},
  { steal: true },
  { steal: true, split: true },
  ...Array.from({ length: MAX_ALLEYS }, (_, i) => ({ steal: true, split: true, alleys: i + 1 })),
  ...Array.from({ length: MAX_PARK_HOMES }, (_, i) => ({ steal: true, split: true, alleys: MAX_ALLEYS, parks: i + 1 })),
];

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const frontTile = (l: Rect & { front?: 'S' | 'E' }): Tile =>
  l.front === 'E' ? { x: l.x + l.w, y: l.y + Math.floor(l.h / 2) } : { x: l.x + Math.floor(l.w / 2), y: l.y + l.h };
/** A rect moved from one superblock's legacy place to its baked one. */
const move = (r: Rect, from: Rect, to: Rect): Rect => ({ ...r, x: r.x - from.x + to.x, y: r.y - from.y + to.y });
const moveTile = (t: Tile, from: Rect, to: Rect): Tile => ({ x: t.x - from.x + to.x, y: t.y - from.y + to.y });

/** A street drawn on the core's edge all the way along (the ring road): never dropped. */
const isRing = (s: MapStreet, size: number) => s.from === 0 && s.to === size - 1 && (s.at === 0 || s.at + s.width - 1 === size - 1);

/** Zone a decoded map into a plan, dropping minor streets while it doesn't fit. undefined when it never does. */
export function zonePlan(m: DecodedCityMap, opts: ZoneOptions = {}): CityPlan | undefined {
  const order = m.streets
    .filter((s) => !isRing(s, m.size))
    .sort((a, b) => Number(b.syn) - Number(a.syn) || a.cls - b.cls || a.to - a.from - (b.to - b.from) || a.at - b.at || (a.axis < b.axis ? -1 : 1));
  for (const effort of EFFORTS) {
    let streets = m.streets.slice();
    const queue = order.slice();
    // Back streets go on the whole map (dropping streets loses the frontage they add).
    for (let drop = 0; drop <= (effort.alleys ? 0 : MAX_DROPS); drop++) {
      const plan = tryZone(m, effort.alleys ? withAlleys(m, streets, effort.alleys) : streets, opts, effort);
      if (plan) return { ...plan, zoning: { dropped: drop, ...effort } };
      const next = queue.shift();
      if (!next) break;
      streets = streets.filter((s) => s !== next);
    }
  }
  return undefined;
}


/**
 * The streets with up to n back streets added, one at a time, each across the deepest building block that has room for
 * one: a 1-tile street (synthetic, class 0) from road to road over dry land, at least four rows (or columns) in from
 * the block's edges on both sides, so each side keeps a band of lots facing a street. The longest crossing wins.
 */
export function withAlleys(m: DecodedCityMap, streets: MapStreet[], n: number): MapStreet[] {
  const N = m.size;
  const out = streets.slice();
  const supers = [m.square, m.day1, m.campus];
  for (let k = 0; k < n; k++) {
    const roadAt = roadFromStreets(out, N);
    const open = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && !roadAt(x, y) && !supers.some((r) => inRect({ x, y }, r));
    const blockOf = new Int32Array(N * N).fill(-1);
    const boxes: Rect[] = [];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (!open(x, y) || blockOf[y * N + x] >= 0) continue;
        const id = boxes.length;
        const stack = [[x, y]];
        blockOf[y * N + x] = id;
        let [x0, y0, x1, y1] = [x, y, x, y];
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          x0 = Math.min(x0, cx);
          y0 = Math.min(y0, cy);
          x1 = Math.max(x1, cx);
          y1 = Math.max(y1, cy);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const X = cx + dx;
            const Y = cy + dy;
            if (open(X, Y) && blockOf[Y * N + X] < 0) (blockOf[Y * N + X] = id), stack.push([X, Y]);
          }
        }
        boxes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      }
    // A tile an alley can cross: dry, in block b, with block b on both sides of it (never beside another street).
    const inB = (x: number, y: number, b: number) => x >= 0 && y >= 0 && x < N && y < N && blockOf[y * N + x] === b;
    let best: MapStreet | undefined;
    let bestLen = 0;
    for (const axis of ['x', 'y'] as const)
      boxes.forEach((r, b) => {
        const [lo, hi] = axis === 'x' ? [r.y + 4, r.y + r.h - 5] : [r.x + 4, r.x + r.w - 5];
        for (let at = lo; at <= hi; at++) {
          const tile = (along: number): [number, number] => (axis === 'x' ? [along, at] : [at, along]);
          const ok = (along: number) => {
            const [x, y] = tile(along);
            const [ax, ay] = axis === 'x' ? [0, 1] : [1, 0];
            return inB(x, y, b) && !m.water(x, y) && inB(x - ax, y - ay, b) && inB(x + ax, y + ay, b);
          };
          const [from, to] = axis === 'x' ? [r.x, r.x + r.w - 1] : [r.y, r.y + r.h - 1];
          for (let s = from; s <= to; s++) {
            if (!ok(s)) continue;
            let e = s;
            while (e + 1 <= to && ok(e + 1)) e++;
            const [bx, by] = tile(s - 1);
            const [ex, ey] = tile(e + 1);
            const len = e - s + 1;
            if (roadAt(bx, by) && roadAt(ex, ey) && len >= 6 && len > bestLen) {
              bestLen = len;
              best = { axis, at, from: s - 1, to: e + 1, width: 1, cls: 0, syn: true };
            }
            s = e;
          }
        }
      });
    if (!best) break;
    out.push(best);
  }
  return out;
}

/** Why a map doesn't zone, for tests and the dev console (undefined when it does). */
export function zoneProblem(m: DecodedCityMap, opts: ZoneOptions = {}, effort: Effort = {}): string | undefined {
  try {
    build(m, effort.alleys ? withAlleys(m, m.streets, effort.alleys) : m.streets, opts, effort);
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}

function tryZone(m: DecodedCityMap, streets: MapStreet[], opts: ZoneOptions, effort: Effort): CityPlan | undefined {
  try {
    return build(m, streets, opts, effort);
  } catch {
    return undefined;
  }
}

class ZoneError extends Error {}
const no = (why: string): never => {
  throw new ZoneError(why);
};

function build(m: DecodedCityMap, streets: MapStreet[], opts: ZoneOptions, effort: Effort): CityPlan {
  const N = m.size;
  const services = opts.services ?? SERVICES;
  const roadAt = roadFromStreets(streets, N);
  const idx = (x: number, y: number) => y * N + x;
  const inCore = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;
  const road = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (roadAt(x, y)) road[idx(x, y)] = 1;
  const isRoad = (t: Tile) => inCore(t.x, t.y) && road[idx(t.x, t.y)] === 1;

  // The ring road and one connected network.
  for (let i = 0; i < N; i++) if (!road[idx(i, 0)] || !road[idx(0, i)] || !road[idx(i, N - 1)] || !road[idx(N - 1, i)]) no('no ring road on the core edge');
  {
    const seen = new Uint8Array(N * N);
    const stack = [0];
    seen[0] = 1;
    let n = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const x = c % N;
      const y = (c / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx;
        const Y = y + dy;
        if (!inCore(X, Y) || !road[idx(X, Y)] || seen[idx(X, Y)]) continue;
        seen[idx(X, Y)] = 1;
        n++;
        stack.push(idx(X, Y));
      }
    }
    if (n !== road.reduce((a, b) => a + b, 0)) no('the streets are not one network');
  }

  // The superblocks: clear of roads and of each other.
  const supers: Record<'square' | 'day1' | 'campus', Rect> = { square: m.square, day1: m.day1, campus: m.campus };
  const superAt = new Map<number, 'square' | 'day1' | 'campus'>();
  for (const [id, r] of Object.entries(supers) as ['square' | 'day1' | 'campus', Rect][])
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        if (road[idx(x, y)]) no(`a street runs through the ${id}`);
        if (superAt.has(idx(x, y))) no(`the ${id} overlaps the ${superAt.get(idx(x, y))}`);
        superAt.set(idx(x, y), id);
      }

  // Blocks: the ground between the streets.
  const blockOf = new Int32Array(N * N).fill(-1);
  const blocks: Block[] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      if (road[i] || superAt.has(i) || blockOf[i] >= 0) continue;
      const id = blocks.length;
      const tiles: number[] = [];
      const stack = [i];
      blockOf[i] = id;
      while (stack.length) {
        const c = stack.pop()!;
        tiles.push(c);
        const cx = c % N;
        const cy = (c / N) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = cx + dx;
          const Y = cy + dy;
          const j = idx(X, Y);
          if (!inCore(X, Y) || road[j] || superAt.has(j) || blockOf[j] >= 0) continue;
          blockOf[j] = id;
          stack.push(j);
        }
      }
      tiles.sort((a, b) => a - b);
      let x0 = N;
      let y0 = N;
      let x1 = 0;
      let y1 = 0;
      let water = 0;
      let green = 0;
      let sx = 0;
      let sy = 0;
      for (const t of tiles) {
        const tx = t % N;
        const ty = (t / N) | 0;
        x0 = Math.min(x0, tx);
        y0 = Math.min(y0, ty);
        x1 = Math.max(x1, tx);
        y1 = Math.max(y1, ty);
        sx += tx;
        sy += ty;
        if (m.water(tx, ty)) water++;
        else if (m.green(tx, ty)) green++;
      }
      const bbox = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      const kind: GroundKind = water > tiles.length / 2 ? 'water' : green > tiles.length * 0.6 && bbox.w >= 8 && bbox.h >= 8 ? 'park' : 'hood';
      blocks.push({ id, kind, tiles, bbox, lots: [], cx: sx / tiles.length, cy: sy / tiles.length });
    }
  // Short of room: the smallest parks become neighbourhoods (the biggest stay green longest).
  if (effort.parks) {
    const parks = blocks.filter((b) => b.kind === 'park').sort((a, b) => a.tiles.length - b.tiles.length || a.id - b.id);
    if (parks.length < effort.parks) no('no park left to build on');
    for (const b of parks.slice(0, effort.parks)) b.kind = 'hood';
  }

  // Water: all of a water block, and the real water inside a building block (no lot stands on it).
  const water = new Uint8Array(N * N);
  for (const b of blocks) for (const t of b.tiles) if (b.kind === 'water' || (b.kind === 'hood' && m.water(t % N, (t / N) | 0))) water[t] = 1;
  const isWater = (x: number, y: number) => inCore(x, y) && water[idx(x, y)] === 1;
  const sidewalk = (x: number, y: number) =>
    inCore(x, y) && !road[idx(x, y)] && !water[idx(x, y)] && !superAt.has(idx(x, y)) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isRoad({ x: x + dx, y: y + dy }));

  // Lots: 3×3 on building ground, their front row a sidewalk, a tile apart; south-facing first, then east-facing.
  const taken = new Uint8Array(N * N); // footprints and the tile round them
  const fronts = new Uint8Array(N * N);
  const lots: Lot[] = [];
  const buildable = (x: number, y: number, b: number) => inCore(x, y) && blockOf[idx(x, y)] === b && !water[idx(x, y)];
  for (const front of ['S', 'E'] as const)
    for (let y = 0; y + 3 <= N; y++)
      for (let x = 0; x + 3 <= N; x++) {
        const b = blockOf[idx(x, y)];
        if (b < 0 || blocks[b].kind !== 'hood') continue;
        let ok = true;
        for (let j = y; j < y + 3 && ok; j++) for (let i = x; i < x + 3 && ok; i++) ok = buildable(i, j, b) && !(taken[idx(i, j)] & 2) && !fronts[idx(i, j)];
        if (!ok) continue;
        const row: Tile[] = front === 'S' ? [0, 1, 2].map((k) => ({ x: x + k, y: y + 3 })) : [0, 1, 2].map((k) => ({ x: x + 3, y: y + k }));
        if (!row.every((t) => sidewalk(t.x, t.y) && !(taken[idx(t.x, t.y)] & 2))) continue;
        for (let j = y - 1; j <= y + 3; j++) for (let i = x - 1; i <= x + 3; i++) if (inCore(i, j)) taken[idx(i, j)] |= 1;
        for (let j = y; j < y + 3; j++) for (let i = x; i < x + 3; i++) taken[idx(i, j)] |= 2;
        for (const t of row) fronts[idx(t.x, t.y)] = 1;
        const lot: Lot = { x, y, w: 3, h: 3, front, block: b };
        lots.push(lot);
        blocks[b].lots.push(lot);
      }
  const capacity = lots.length;
  if (capacity < services.length + SPARE_CAPACITY) no(`room for ${capacity} lots, not ${services.length + SPARE_CAPACITY}`);

  // Split: a building block with more than CHUNK_LOTS lots becomes neighbourhoods of a few lots each (cut in half
  // along its longer side until each is small enough; each tile joins the nearest lot's neighbourhood), so districts
  // can share a big block instead of one swallowing it whole.
  if (effort.split)
    for (const big of blocks.slice()) {
      if (big.kind !== 'hood' || big.lots.length <= CHUNK_LOTS) continue;
      const groups: Lot[][] = [];
      const cut = (ls: Lot[]) => {
        if (ls.length <= CHUNK_LOTS) return void groups.push(ls);
        const xs = ls.map((l) => l.x);
        const ys = ls.map((l) => l.y);
        const alongX = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
        const sorted = ls.slice().sort((a, b) => (alongX ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x));
        const half = Math.ceil(sorted.length / 2);
        cut(sorted.slice(0, half));
        cut(sorted.slice(half));
      };
      cut(big.lots);
      const chunks: Block[] = groups.map((g) => ({ id: blocks.length + groups.indexOf(g), kind: 'hood', tiles: [], bbox: { x: 0, y: 0, w: 0, h: 0 }, lots: g, cx: 0, cy: 0 }));
      blocks.push(...chunks);
      for (const t of big.tiles) {
        const tx = t % N;
        const ty = (t / N) | 0;
        let best = chunks[0];
        let bd = Infinity;
        for (const c of chunks)
          for (const l of c.lots) {
            const d = Math.hypot(l.x + 1 - tx, l.y + 1 - ty);
            if (d < bd) (bd = d), (best = c);
          }
        best.tiles.push(t);
        blockOf[t] = best.id;
      }
      for (const c of chunks) {
        for (const l of c.lots) l.block = c.id;
        const txs = c.tiles.map((t) => t % N);
        const tys = c.tiles.map((t) => (t / N) | 0);
        const x0 = Math.min(...txs);
        const y0 = Math.min(...tys);
        c.bbox = { x: x0, y: y0, w: Math.max(...txs) - x0 + 1, h: Math.max(...tys) - y0 + 1 };
        c.cx = txs.reduce((a, b) => a + b, 0) / txs.length;
        c.cy = tys.reduce((a, b) => a + b, 0) / tys.length;
      }
      big.tiles = [];
      big.lots = [];
    }

  // Block neighbours: blocks that meet across a street (both sides of a road tile, or of two road tiles side by side).
  const roadBlocks = (i: number) => {
    const out = new Set<number>();
    const x = i % N;
    const y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inCore(x + dx, y + dy) && blockOf[idx(x + dx, y + dy)] >= 0) out.add(blockOf[idx(x + dx, y + dy)]);
    return out;
  };
  const near = blocks.map(() => new Set<number>());
  for (let i = 0; i < N * N; i++) {
    if (!road[i]) continue;
    const here = roadBlocks(i);
    const x = i % N;
    const y = (i / N) | 0;
    const all = new Set(here);
    for (const [dx, dy] of [[1, 0], [0, 1]]) if (inCore(x + dx, y + dy) && road[idx(x + dx, y + dy)]) for (const b of roadBlocks(idx(x + dx, y + dy))) all.add(b);
    for (const a of all) for (const b of all) if (a !== b) near[a].add(b);
  }
  // Neighbourhoods cut from one block touch directly.
  if (effort.split)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const a = blockOf[idx(x, y)];
        if (a < 0) continue;
        for (const [X, Y] of [[x + 1, y], [x, y + 1]]) {
          const b = inCore(X, Y) ? blockOf[idx(X, Y)] : -1;
          if (b >= 0 && b !== a) near[a].add(b), near[b].add(a);
        }
      }

  // Districts: from compass seeds round the square, a block a turn.
  const sq = { x: m.square.x + 5.5, y: m.square.y + 5.5 };
  /** Lots nearest a point first (by their front tile), then north to south, west to east. */
  const byDist = (to: { x: number; y: number }) => (a: Lot, b: Lot) => dist(frontTile(a), to) - dist(frontTile(b), to) || a.y - b.y || a.x - b.x;
  const clamp = (v: number) => Math.max(4, Math.min(N - 5, v));
  const districtIds = DISTRICTS.map((d) => d.id);
  let spare = 0;
  const seedOf = new Map<string, Tile>(
    districtIds.map((d) => {
      const [dx, dy] = SEEDS[d] ?? SPARE_SEEDS[spare++] ?? [0, 0];
      const len = Math.hypot(dx, dy) || 1;
      return [d, { x: clamp(sq.x + (dx / len) * SEED_DIST), y: clamp(sq.y + (dy / len) * SEED_DIST) }];
    }),
  );
  const owner = new Int32Array(blocks.length).fill(-1);
  const mine = districtIds.map(() => [] as number[]);
  const lotCount = (d: number) => mine[d].reduce((n, b) => n + blocks[b].lots.length, 0);
  const grow = (d: number) => {
    const seed = seedOf.get(districtIds[d])!;
    const free = (b: number) => owner[b] < 0 && blocks[b].kind === 'hood' && blocks[b].lots.length > 0;
    let pick: number[] = [];
    if (mine[d].length) pick = [...new Set(mine[d].flatMap((b) => [...near[b]]))].filter(free);
    if (!pick.length) pick = blocks.map((b) => b.id).filter(free);
    if (!pick.length) return false;
    pick.sort((a, b) => dist(seed, { x: blocks[a].cx, y: blocks[a].cy }) - dist(seed, { x: blocks[b].cx, y: blocks[b].cy }) || a - b);
    owner[pick[0]] = d;
    mine[d].push(pick[0]);
    return true;
  };
  // Phase 1: every district to DISTRICT_RESERVE, round robin, independent of how many services each has (so adding a
  // service changes no district's ground while its district has room for it).
  for (let moved = true; moved; ) {
    moved = false;
    districtIds.forEach((_, d) => {
      if (lotCount(d) < DISTRICT_RESERVE && grow(d)) moved = true;
    });
  }
  const early = new Set(mine.flat());
  // Phase 2: a district with more services keeps growing until it has room for them and DISTRICT_SPARE more.
  const needOf = (d: number) => Math.max(DISTRICT_LOTS, services.filter((s) => s.districtId === districtIds[d]).length + DISTRICT_SPARE);
  districtIds.forEach((_, d) => {
    while (lotCount(d) < needOf(d) && grow(d));
  });
  /**
   * Where a district's buildings go: the HQ on the lot nearest the square, then the services in world.json order on
   * its phase-1 lots nearest its seed, then on the lots of each block it took later, in the order it took them (so a
   * block taken later never moves a building already standing).
   */
  const placement = (d: number) => {
    const seed = seedOf.get(districtIds[d])!;
    const first = mine[d].filter((b) => early.has(b)).flatMap((b) => blocks[b].lots);
    const all = mine[d].flatMap((b) => blocks[b].lots);
    const hq = (first.length ? first : all).slice().sort(byDist(sq))[0];
    const later = mine[d].filter((b) => !early.has(b)).flatMap((b) => blocks[b].lots.slice().sort(byDist(seed)));
    return { hq, rest: [...first.filter((l) => l !== hq).sort(byDist(seed)), ...later.filter((l) => l !== hq)] };
  };
  // Phase 3 (effort.steal): a district still short takes a neighbour's spare block, nearest its seed first: one where
  // none of the neighbour's buildings (HQ, services) would stand, and that it can give and still have its own room.
  if (effort.steal) {
    const used = (e: number) => {
      const { hq, rest } = placement(e);
      const k = services.filter((s) => s.districtId === districtIds[e] && !isGlobalService(s.id)).length;
      return new Set([hq, ...rest.slice(0, k)]);
    };
    const spareBlock = (d: number) => (b: number) => {
      const e = owner[b];
      if (e < 0 || e === d || lotCount(e) - blocks[b].lots.length < needOf(e)) return false;
      const u = used(e);
      return !blocks[b].lots.some((l) => u.has(l));
    };
    const steal = (d: number) => {
      const seed = seedOf.get(districtIds[d])!;
      let pick = [...new Set(mine[d].flatMap((b) => [...near[b]]))].filter(spareBlock(d));
      if (!pick.length) pick = blocks.map((b) => b.id).filter(spareBlock(d));
      if (!pick.length) return false;
      pick.sort((a, b) => dist(seed, { x: blocks[a].cx, y: blocks[a].cy }) - dist(seed, { x: blocks[b].cx, y: blocks[b].cy }) || a - b);
      const e = owner[pick[0]];
      mine[e] = mine[e].filter((b) => b !== pick[0]);
      owner[pick[0]] = d;
      mine[d].push(pick[0]);
      return true;
    };
    districtIds.forEach((_, d) => {
      while (lotCount(d) < needOf(d) && (grow(d) || steal(d)));
    });
  }
  districtIds.forEach((id, d) => {
    if (lotCount(d) < needOf(d)) no(`${id} has ${lotCount(d)} lots, not ${needOf(d)}`);
  });

  // Landmarks. The square's, then each district's HQ and services, the Global Gate's, then the culture sites.
  const legacyRects = { square: TOWN_SQUARE.rect, day1: DAY1_PLOT.rect, campus: CAMPUS_PLOT.rect };
  const superOf = (l: LandmarkLayout) => (['square', 'day1', 'campus'] as const).find((k) => inRect(l.footprint, legacyRects[k]));
  const moved = (l: LandmarkLayout): LandmarkLayout => {
    const k = superOf(l)!;
    return { ...l, footprint: move(l.footprint, legacyRects[k], supers[k]), workSpot: moveTile(l.workSpot, legacyRects[k], supers[k]) };
  };
  const squareMarks = LANDMARKS.filter((l) => !l.districtId && !l.site && superOf(l) === 'square').map(moved);
  const globalMarks = LANDMARKS.filter((l) => l.global).map(moved);
  const siteMarks = LANDMARKS.filter((l) => l.site).map(moved);
  for (const s of services) if (isGlobalService(s.id) && !globalMarks.some((g) => g.id === s.id)) no(`no Global Gate lot for ${s.id}`);

  const districtMarks: LandmarkLayout[] = [];
  const districts = {} as Record<DistrictId, DistrictPlan>;
  const open = new Map<string, Rect[]>();
  const strip = (l: Lot): Rect & { front: 'S' | 'E' } => ({ x: l.x, y: l.y, w: l.w, h: l.h, front: l.front });
  districtIds.forEach((id, d) => {
    const { hq: hqLot, rest } = placement(d);
    const mineServices = services.filter((s) => s.districtId === id && !isGlobalService(s.id));
    mineServices.forEach((s, i) => {
      const lot = rest[i];
      districtMarks.push({ id: s.id, districtId: id, footprint: { x: lot.x, y: lot.y, w: 3, h: 3 }, workSpot: frontTile(lot), ...(lot.front === 'E' ? { front: 'E' as const } : {}) });
    });
    const hq: Rect = hqLot.front === 'E' ? { x: hqLot.x + 1, y: hqLot.y, w: 2, h: 2 } : { x: hqLot.x, y: hqLot.y + 1, w: 2, h: 2 };
    districtMarks.push({ id: `hq:${id}`, districtId: id, footprint: hq, workSpot: hqLot.front === 'E' ? { x: hqLot.x + 3, y: hqLot.y + 1 } : { x: hq.x + 1, y: hq.y + 2 }, ...(hqLot.front === 'E' ? { front: 'E' as const } : {}) });
    open.set(id, rest.slice(mineServices.length).map(strip));
    let x0 = N;
    let y0 = N;
    let x1 = 0;
    let y1 = 0;
    for (const b of mine[d]) {
      const r = blocks[b].bbox;
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w - 1);
      y1 = Math.max(y1, r.y + r.h - 1);
    }
    districts[id] = { bbox: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, lots: mine[d].flatMap((b) => blocks[b].lots).map(strip) };
  });
  const landmarks = [...squareMarks, ...districtMarks, ...globalMarks, ...siteMarks];
  const byId = new Map(landmarks.map((l) => [l.id, l]));
  const foot = new Uint8Array(N * N);
  for (const l of landmarks)
    for (let y = l.footprint.y; y < l.footprint.y + l.footprint.h; y++)
      for (let x = l.footprint.x; x < l.footprint.x + l.footprint.w; x++) {
        if (!inCore(x, y) || foot[idx(x, y)] || road[idx(x, y)] || water[idx(x, y)]) no(`${l.id} can't stand at ${x},${y}`);
        foot[idx(x, y)] = 1;
      }
  const isFootprint = (x: number, y: number) => inCore(x, y) && foot[idx(x, y)] === 1;

  // The gate: where the highway leaves, on the east edge in the campus's rows (a street that reaches the edge there).
  const eastLines = streets.filter((s) => s.axis === 'x' && s.to === N - 1 && !isRing(s, N)).map((s) => s.at);
  const campusMid = m.campus.y + 5;
  const inBand = eastLines.filter((y) => y >= m.campus.y && y < m.campus.y + m.campus.h);
  const gateY = inBand.sort((a, b) => Math.abs(a - campusMid) - Math.abs(b - campusMid) || a - b)[0] ?? Math.max(3, Math.min(N - 4, campusMid));
  const gate: Tile = { x: N - 1, y: gateY };

  // Every work spot on foot from the gate.
  {
    const seen = new Uint8Array(N * N);
    const stack = [idx(gate.x, gate.y)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const x = c % N;
      const y = (c / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx;
        const Y = y + dy;
        const j = idx(X, Y);
        if (!inCore(X, Y) || seen[j] || foot[j] || water[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    for (const l of landmarks) if (!seen[idx(l.workSpot.x, l.workSpot.y)]) no(`${l.id}'s work spot can't be reached`);
  }

  // Edge lines (where bridges can cross): the streets that reach each edge, and the corners.
  const reach = (side: EdgeSide) => {
    const lines = streets
      .filter((s) => (side === 'N' || side === 'S' ? s.axis === 'y' : s.axis === 'x') && !isRing(s, N) && (side === 'N' || side === 'W' ? s.from === 0 : s.to === N - 1))
      .map((s) => s.at);
    return [...new Set([0, ...lines, N - 1])].sort((a, b) => a - b);
  };
  const edgeLines = { N: reach('N'), W: reach('W'), S: reach('S'), E: reach('E') } as Record<EdgeSide, readonly number[]>;
  const slotsMemo = new Map<number, readonly string[]>();
  const azSlots = (n: number) => {
    const k = Math.max(1, Math.min(6, Math.round(n) || 1));
    let s = slotsMemo.get(k);
    if (!s) slotsMemo.set(k, (s = islandSlots(k, edgeLines, N)));
    return s;
  };

  const plotAt = (t: Tile): string | undefined => {
    if (!inCore(t.x, t.y) || road[idx(t.x, t.y)]) return undefined;
    const s = superAt.get(idx(t.x, t.y));
    if (s) return s;
    const b = blockOf[idx(t.x, t.y)];
    return b >= 0 && owner[b] >= 0 ? districtIds[owner[b]] : undefined;
  };
  const groundAt = (x: number, y: number): GroundKind | undefined => {
    if (!inCore(x, y) || road[idx(x, y)] || superAt.has(idx(x, y))) return undefined;
    if (water[idx(x, y)]) return 'water';
    const b = blockOf[idx(x, y)];
    return b < 0 ? undefined : blocks[b].kind === 'hood' && owner[b] >= 0 ? undefined : blocks[b].kind;
  };
  const spareLots = blocks.filter((b) => b.kind === 'hood' && owner[b.id] < 0).flatMap((b) => b.lots.map(strip));

  return {
    id: opts.id ?? `osm:${m.region}`,
    kind: 'osm',
    city: m.city,
    attribution: m.attribution,
    size: N,
    isRoad,
    roadAt,
    streets,
    square: m.square,
    day1: m.day1,
    campus: m.campus,
    districts,
    landmarks,
    globalLandmarks: globalMarks,
    landmarkLayout: (id) => byId.get(id),
    openLots: (d) => open.get(d) ?? [],
    plotAt,
    homeRectFor: (id) => {
      const l = byId.get(id);
      if (l?.global) return m.campus;
      const d = l?.districtId ?? services.find((s) => s.id === id)?.districtId;
      return d ? districts[d as DistrictId]?.bbox : undefined;
    },
    isFootprint,
    gate,
    globalGateSign: moveTile(GLOBAL_GATE_SIGN, CAMPUS_PLOT.rect, m.campus),
    spawn: moveTile(PLAYER_SPAWN, TOWN_SQUARE.rect, m.square),
    fountain: moveTile(FOUNTAIN, TOWN_SQUARE.rect, m.square),
    benches: BENCHES.map((b) => moveTile(b, TOWN_SQUARE.rect, m.square)),
    edgeLines,
    azSlots,
    groundAt,
    isWater,
    density: m.density,
    masks: { water: m.water, green: m.green },
    capacity,
    spareLots,
  };
}

/**
 * n island slots on the north and west edge lines (half each, the north taking the odd one), spread evenly along the
 * edge and at least ISLAND_GAP apart; a side short of lines hands its islands to the other.
 */
export function islandSlots(n: number, edgeLines: Record<EdgeSide, readonly number[]>, size: number): string[] {
  const pick = (side: 'N' | 'W', k: number): number[] => {
    const lines = edgeLines[side];
    const out: number[] = [];
    for (let i = 0; i < k; i++) {
      const aim = ((i + 0.5) / k) * (size - 1);
      const best = lines
        .filter((l) => out.every((o) => Math.abs(o - l) >= ISLAND_GAP))
        .sort((a, b) => Math.abs(a - aim) - Math.abs(b - aim) || a - b)[0];
      if (best === undefined) break;
      out.push(best);
    }
    return out.sort((a, b) => b - a);
  };
  const wWant = Math.floor(n / 2);
  let w = pick('W', wWant);
  let nn = pick('N', n - w.length);
  if (nn.length < n - w.length) w = pick('W', n - nn.length);
  if (w.length + nn.length < n) nn = pick('N', n - w.length);
  // Legacy order: west islands first (south to north), then north (west to east).
  return [...w.map((l) => `W${l}`), ...nn.sort((a, b) => a - b).map((l) => `N${l}`)].slice(0, n);
}
