// What sits on the ground of each plot besides the landmarks and the infill (src/game/infill.ts): the Day 1 Quarter's walk, the Global Gate's yard, parks with
// construction hoardings in locked districts, and a lot sign on each lot not discovered yet. Pure (no Phaser), so
// tests can check that decor never blocks a work spot or cuts one off from the roads.
import { frontRowTiles, inRect, type LandmarkLayout, type Rect, type Tile } from '@/world/layout';
import { legacyPlan, type CityPlan } from '@/world/plan';
import { serviceById, servicesIn, type DistrictId } from '@/world/taxonomy';
import { placeCombos, type Combo } from '@/world/combos';
import { SEASON_DECALS, SEASON_PROP_SHARE, SEASON_PROPS, type Season } from '@/world/seasons';

/** Share of a district's free street-facing grass that holds a home, at level 0 and per average landmark tier. */
export const HOME_BASE = 0.12;
export const HOME_PER_LEVEL = 0.06;
const COTTAGES = 6;
const SHOPS = 4;
const FLATS = 3;
/** Which home stands on a tile: mostly cottages, some corner shops, and flats once the district has grown (level ≥ 2). */
export function homeFor(x: number, y: number, level: number): string {
  const k = tileHash(x, y, 13);
  const pick = (n: number) => Math.floor(tileHash(x, y, 17) * n);
  if (level >= 2 && k < 0.2) return `house:flats:${pick(FLATS)}`;
  if (k > 0.75) return `house:shop:${pick(SHOPS)}`;
  return `house:cottage:${pick(COTTAGES)}`;
}

/**
 * The skyline: each district grows towers in its AWS colour (art/tiles/towers_art.py) as its landmarks level up, so the
 * city rises with what the player has learned. A tower may only be as tall as the ground behind it is clear: on screen
 * a sprite covers what stands behind it (smaller x + y), so it never hides a landmark. Each step back is 8 px of screen.
 */
export type TowerSize = 'mid' | 'tall' | 'sky';
/** Steps of clear ground behind a tower each size needs (its sprite's height above its base / 8 px, sprites.json). */
export const TOWER_STEPS: Record<TowerSize, number> = { mid: 12, tall: 21, sky: 28 };
/** The district level (average landmark tier, 0–4) a size needs: mid-rise from 1, towers from 2, skyscrapers from 3. */
export const TOWER_LEVEL: Record<TowerSize, number> = { mid: 1, tall: 2, sky: 3 };
/** Towers per district: two per level, at most eight. */
export const towerCount = (level: number) => Math.min(8, Math.floor(level * 2));
const SIZES_TALL_FIRST: TowerSize[] = ['sky', 'tall', 'mid'];

/**
 * Clear steps behind tile (x, y) before a landmark it would cover (a band of `band` columns either side on screen); 99 when
 * none. `hidden(tx, ty)`: a footprint tile of a landmark drawn behind this tile (its front corner is further back):
 * one whose front reaches further forward is drawn over the tower, so it can't be hidden by it.
 */
export function clearBehind(x: number, y: number, hidden: (x: number, y: number) => boolean, band = 2): number {
  for (let s = 1; s <= TOWER_STEPS.sky; s++)
    for (let d = -band; d <= band; d++) {
      // Tiles s steps further back (x' + y' = x + y − s) and d columns aside (x' − y' = x − y + d), when whole.
      if ((s + d) % 2 !== 0) continue;
      const tx = x - (s - d) / 2;
      const ty = y - (s + d) / 2;
      if (hidden(tx, ty)) return s - 1;
    }
  return 99;
}

/** The tallest tower this level allows that fits the clear ground behind, or undefined. */
export const towerFor = (level: number, clear: number): TowerSize | undefined =>
  SIZES_TALL_FIRST.find((sz) => level >= TOWER_LEVEL[sz] && clear >= TOWER_STEPS[sz]);

/** A landmark is drawn by its front corner: it's behind a thing standing on a tile with x + y = `depth` when its front is further back. */
export const drawnBehind = (l: LandmarkLayout | undefined, depth: number) =>
  !!l && l.footprint.x + l.footprint.w - 1 + l.footprint.y + l.footprint.h - 1 < depth;

export const tileHash = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const grass = (x: number, y: number) => `grass${Math.floor(tileHash(x, y) * 3)}`;
const grow = (r: Rect, n = 1): Rect => ({ x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n });

/** One decor prop. (x, y) is its north tile; w×h tiles are blocked when `block`. `glow` = a street lamp's night glow. */
export interface DecorItem {
  sprite: string;
  x: number;
  y: number;
  w: number;
  h: number;
  block: boolean;
  glow?: boolean;
}
/** The tiles a decor prop stands on. */
export const tilesOf = (d: DecorItem): Tile[] =>
  Array.from({ length: d.w * d.h }, (_, i) => ({ x: d.x + (i % d.w), y: d.y + Math.floor(i / d.w) }));
export const decorKey = (d: DecorItem) => `${d.sprite}@${d.x},${d.y}`;

export interface DecorWorld {
  /** The city's street plan (the legacy 3×3 city when left out). */
  plan?: CityPlan;
  /** Placed landmarks (culture sites only count once their art exists). */
  landmarks: LandmarkLayout[];
  /** Sidewalk ring tiles (a plot's edge next to a road). */
  isSidewalk: (x: number, y: number) => boolean;
  districtOpen: (d: DistrictId) => boolean;
  /** Tier of a service's landmark: -1 not discovered, 0 construction, 1..4. */
  tierOf: (serviceId: string) => number;
  /** Tiles the player's own decorations stand on (build mode): nothing else is put there. */
  built?: (x: number, y: number) => boolean;
  /** The combos found in this city (src/world/combos.ts): each prop goes down before the rest of the decor. */
  combos?: readonly Combo[];
  /** The city's season (src/world/seasons.ts): some flower beds become its props (snowmen, umbrellas). */
  season?: Season;
}

/**
 * Pocket parks (art/tiles/park_art.py and the decor art): each lot takes the next piece in turn (`turn` counts the
 * parks laid so far), so neighbouring parks differ; the corner piece and the second centrepiece start further along,
 * so a lot's pieces don't match.
 */
export const POCKET_PARKS = ['park:gazebo', 'park:pocket:0', 'park:pocket:1', 'park:pocket:2', 'park:pocket:3'];
export const pocketParkFor = (turn: number) => POCKET_PARKS[turn % POCKET_PARKS.length];
/** A grown district's pocket park (level 2+): a 2×2 centrepiece. */
export const BIG_PARKS = ['park:amphitheatre', 'deco:bandstand', 'deco:pond', 'deco:fountain-big', 'deco:playground'];
export const bigParkFor = (turn: number) => BIG_PARKS[turn % BIG_PARKS.length];
/** A pocket park's corner piece: a playground, an ice-cream kiosk, a picnic table or a statue. */
export const PARK_CORNERS = ['park:playground', 'deco:kiosk-icecream', 'park:playground', 'deco:picnic', 'deco:statue'];
export const parkCornerFor = (turn: number) => PARK_CORNERS[(turn + 2) % PARK_CORNERS.length];

/** The season's ground decal on a grass tile (snow, leaves, petals), or undefined: stable for a tile. */
export function seasonDecal(season: Season | undefined, x: number, y: number): string | undefined {
  const d = season ? SEASON_DECALS[season] : undefined;
  if (!d?.names.length || tileHash(x, y, 41) >= d.share) return undefined;
  return d.names[Math.floor(tileHash(x, y, 43) * d.names.length)];
}

/** A flower bed, or (on about half of them) the season's prop instead: the same tile, so nothing is added. */
export function flowerFor(x: number, y: number, season?: Season): string {
  const props = season ? SEASON_PROPS[season] : [];
  if (!props.length || tileHash(x, y, 51) >= SEASON_PROP_SHARE) return 'flowers';
  return props[Math.floor(tileHash(x, y, 53) * props.length)];
}

/** Ground for the Day 1 Quarter and the campus (sidewalk is decided before this; the global landmarks' lots by the map). */
export function siteGround(plot: 'day1' | 'campus', t: Tile, plan: CityPlan = legacyPlan()): string {
  const { x, y } = t;
  if (plot === 'day1') {
    const ly = y - plan.day1.y;
    if (ly >= 6 && ly <= 8) return 'paver'; // the LP Walk
    if (ly <= 4 || ly >= 10) return 'plazaStone';
    return grass(x, y);
  }
  // The Global Gate: a paved forecourt in front of its row of global landmarks.
  const ly = y - plan.campus.y;
  if (ly === 9) return 'paver';
  const ful = plan.landmarkLayout('fulfilment')?.footprint;
  if ((ful && inRect(t, grow(ful))) || y - plan.campus.y >= 10) return 'plazaStone'; // loading yard, front apron
  return grass(x, y);
}

/** Every decor prop for the current progress. Stable for the same inputs, so the map can diff it. */
export function decorPlan(w: DecorWorld): DecorItem[] {
  const plan = w.plan ?? legacyPlan();
  const GRID = plan.size;
  const isRoad = plan.isRoad;
  const foot = new Map<number, LandmarkLayout>();
  for (const l of w.landmarks)
    for (let y = l.footprint.y; y < l.footprint.y + l.footprint.h; y++) for (let x = l.footprint.x; x < l.footprint.x + l.footprint.w; x++) foot.set(y * GRID + x, l);
  const workSpots = new Set(w.landmarks.map((l) => l.workSpot.y * GRID + l.workSpot.x));
  /** The row in front of each building (south of it, or east for an east-facing lot on a real map). */
  const fronts = new Set(w.landmarks.filter((l) => l.front === 'E').flatMap((l) => frontRowTiles(l).map((t) => t.y * GRID + t.x)));
  const real = plan.kind === 'osm';
  const water = (x: number, y: number) => !!plan.isWater?.(x, y);
  /** Grass a prop may stand on: not a footprint, sidewalk, work spot, water, or the row in front of a building. */
  /** Tiles a pocket park took (nothing else is put there). */
  const parkTaken = new Set<number>();
  const free = (x: number, y: number) =>
    !parkTaken.has(y * GRID + x) &&
    !w.built?.(x, y) &&
    !foot.has(y * GRID + x) &&
    !w.isSidewalk(x, y) &&
    !isRoad({ x, y }) &&
    !workSpots.has(y * GRID + x) &&
    !foot.has((y - 1) * GRID + x) &&
    !fronts.has(y * GRID + x) &&
    !water(x, y);
  const out: DecorItem[] = [];
  const put = (sprite: string, x: number, y: number, block = true, wh: [number, number] = [1, 1], glow = false) =>
    out.push({ sprite, x, y, w: wh[0], h: wh[1], block, ...(glow ? { glow } : {}) });
  const flower = (x: number, y: number) => flowerFor(x, y, w.season);

  // Combos first (src/world/combos.ts): on open ground near their buildings, before parks, towers and trees take it.
  if (w.combos?.length) {
    const ground = (x: number, y: number) => {
      const plot = plan.plotAt({ x, y });
      if (plot === undefined) return plan.groundAt?.(x, y) !== undefined || !real;
      if (plot === 'campus') return siteGround('campus', { x, y }, plan).startsWith('grass');
      if (plot === 'square' || plot === 'day1' || plot.startsWith('future')) return false;
      return w.districtOpen(plot as DistrictId);
    };
    const spots = placeCombos(w.combos, { size: GRID, free: (x, y) => free(x, y) && ground(x, y), layout: (id) => w.landmarks.find((l) => l.id === id), workSpots: w.landmarks.map((l) => l.workSpot) });
    for (const c of spots) {
      put(c.combo.sprite, c.x, c.y, true, [c.w, c.h]);
      for (let j = c.y; j < c.y + c.h; j++) for (let i = c.x; i < c.x + c.w; i++) parkTaken.add(j * GRID + i);
    }
  }

  // Pocket parks laid so far (each lot takes the next piece in turn).
  let parkTurn = 0;
  for (const [id, district] of Object.entries(plan.districts) as [DistrictId, { bbox: Rect }][]) {
    const r = district.bbox;
    if (w.districtOpen(id)) {
      // Homes and corner shops on the street-facing grass, more as the district levels up (flats from level 2).
      // The level averages the buildings the player has put up (at least two), not the district's undiscovered ones:
      // one building growing visibly raises its district's skyline, instead of a sixth of a step.
      const tiers = servicesIn(id)
        .map((s) => w.tierOf(s.id))
        .filter((t) => t >= 0);
      const level = tiers.reduce((a, b) => a + b, 0) / Math.max(2, tiers.length);
      const homes = HOME_BASE + HOME_PER_LEVEL * level;
      const street = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.isSidewalk(x + dx, y + dy));
      // Pocket parks on the lots the district's global services left open (they stand at the Global Gate): a
      // playground and a centrepiece once the district opens (a gazebo, a fountain, a picnic, a garden or a duck pond),
      // a band shell, bandstand or pond from level 2 (art/tiles/park_art.py), each picked by the lot.
      for (const lot of plan.openLots(id)) {
        const turn = parkTurn++;
        const spots: [string, number, number, [number, number]][] =
          level >= 2
            ? [[bigParkFor(turn), lot.x, lot.y, [2, 2]], [parkCornerFor(turn), lot.x + 2, lot.y + 2, [1, 1]], [pocketParkFor(turn * 3 + 1), lot.x + 2, lot.y, [1, 1]]]
            : [[pocketParkFor(turn), lot.x + 1, lot.y + 1, [1, 1]], [parkCornerFor(turn), lot.x, lot.y, [1, 1]], [flower(lot.x + 2, lot.y + 2), lot.x + 2, lot.y + 2, [1, 1]]];
        for (const [sprite, x, y, [pw, ph]] of spots) {
          let ok = true;
          for (let j = y; j < y + ph; j++) for (let i = x; i < x + pw; i++) ok &&= free(i, j);
          if (!ok) continue;
          put(sprite, x, y, true, [pw, ph]);
          for (let j = y; j < y + ph; j++) for (let i = x; i < x + pw; i++) parkTaken.add(j * GRID + i);
        }
      }
      // A real map's free ground is infill (src/game/infill.ts: its buildings rise with the district's level). The
      // legacy city keeps its skyline here: towers on the lots with the most clear ground behind them, a tile apart.
      const towers: Tile[] = [];
      const want = real ? 0 : towerCount(level);
      if (want > 0) {
        const spots: { x: number; y: number; size: TowerSize; clear: number }[] = [];
        for (let y = r.y; y < r.y + r.h; y++)
          for (let x = r.x; x < r.x + r.w; x++) {
            if (!free(x, y) || (real && plan.plotAt({ x, y }) !== id)) continue;
            const clear = clearBehind(x, y, (tx, ty) => drawnBehind(foot.get(ty * GRID + tx), x + y));
            const size = towerFor(level, clear);
            if (size) spots.push({ x, y, size, clear });
          }
        spots.sort((a, b) => TOWER_STEPS[b.size] - TOWER_STEPS[a.size] || tileHash(a.x, a.y, 21) - tileHash(b.x, b.y, 21));
        for (const t of spots) {
          if (towers.length >= want) break;
          if (towers.some((o) => Math.max(Math.abs(o.x - t.x), Math.abs(o.y - t.y)) < 2)) continue;
          towers.push(t);
          put(`tower:${id}:${t.size}`, t.x, t.y);
        }
      }
      const towerAt = (x: number, y: number) => towers.some((t) => t.x === x && t.y === y);
      for (let y = r.y; y < r.y + r.h && !real; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          if (!free(x, y) || towerAt(x, y)) continue;
          const h = tileHash(x, y, 7);
          if (h < 0.1) put(['tree0', 'tree1', 'pine', 'tree1'][Math.floor(h * 40)], x, y);
          else if (h < 0.1 + homes && street(x, y)) put(homeFor(x, y, level), x, y);
          else if (h > 0.94) put(flower(x, y), x, y);
        }
      // A lot that isn't discovered yet: a sign on the graded pad (the lot's tiles are blocked already).
      for (const l of w.landmarks)
        if (l.districtId === id && !l.global && serviceById(l.id) && w.tierOf(l.id) < 0) put('lotSign', l.footprint.x + 1, l.footprint.y + l.footprint.h - 1);
      continue;
    }
    if (real) {
      // Locked, on a real map: construction hoardings along the street edges of the district's blocks (the tiles just
      // inside a sidewalk to their south or east, the sides facing the viewer), in runs of three with a gap, and one
      // billboard. Low-rise infill stands behind them (src/game/infill.ts) until the district opens.
      let board = false;
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          if (!free(x, y) || plan.plotAt({ x, y }) !== id || parkTaken.has(y * GRID + x)) continue;
          if (!board && free(x + 1, y) && plan.plotAt({ x: x + 1, y }) === id && w.isSidewalk(x, y + 1) && w.isSidewalk(x + 1, y + 1)) {
            put('billboard', x, y, true, [2, 1]);
            parkTaken.add(y * GRID + x).add(y * GRID + x + 1);
            board = true;
            x++;
          } else if (w.isSidewalk(x, y + 1) && x % 4 !== 3) put('hoardingX', x, y);
          else if (w.isSidewalk(x + 1, y) && !w.isSidewalk(x, y + 1) && y % 4 !== 3) put('hoardingY', x, y);
        }
      continue;
    }
    // Locked: a park behind friendly construction fencing, one tile inside the sidewalk ring. Only along the two
    // edges that face the viewer (south-west and south-east), in runs of three with a gap, so the plot stays calm.
    const x0 = r.x + 1;
    const y0 = r.y + 1;
    const x1 = r.x + r.w - 2;
    const y1 = r.y + r.h - 2;
    for (let x = x0; x <= x1; x++) if ((x - x0) % 4 !== 3 && free(x, y1)) put('hoardingX', x, y1);
    for (let y = y0; y < y1; y++) if ((y - y0) % 4 !== 3 && free(x1, y)) put('hoardingY', x1, y);
    const bx = r.x + 2;
    const by = r.y + 5;
    if (free(bx, by) && free(bx + 1, by)) put('billboard', bx, by, true, [2, 1]);
    // The site office: a small construction frame on the bottom-middle lot, which is blocked anyway.
    const lot = { x: r.x + 5, y: r.y + 6 };
    const lotTiles = [0, 1].flatMap((dy) => [0, 1].map((dx) => foot.get((lot.y + dy) * GRID + lot.x + dx)));
    if (lotTiles.every((l) => l && serviceById(l.id))) put('construction2x2', lot.x, lot.y, true, [2, 2]);
    // Cones and a few trees only on the middle row: the columns between lots are the only way to the back row, and
    // the row in front of the north lots stays a clear corridor beside it.
    for (const dx of [7, 9]) if (free(r.x + dx, r.y + 5)) put('cone', r.x + dx, r.y + 5);
    const taken = new Set(out.flatMap(tilesOf).map((t) => t.y * GRID + t.x));
    for (let x = x0 + 1; x < x1; x++) {
      const y = r.y + 5;
      if (free(x, y) && !taken.has(y * GRID + x) && tileHash(x, y, 11) < 0.3) put(tileHash(x, y, 3) < 0.5 ? 'tree0' : 'pine', x, y);
    }
  }

  // Day 1 Quarter: trees and lamps along the walk's north edge, benches and flowers to its south.
  const d = plan.day1;
  [2, 6, 10].forEach((dx, i) => free(d.x + dx, d.y + 5) && put(i === 1 ? 'tree1' : 'tree0', d.x + dx, d.y + 5));
  [4, 8].forEach((dx) => free(d.x + dx, d.y + 5) && put('pack:lamp_post', d.x + dx, d.y + 5, true, [1, 1], true));
  for (let x = d.x + 1; x < d.x + d.w - 1; x++) {
    if (!free(x, d.y + 9)) continue;
    put((x - d.x) % 2 === 0 ? 'pack:bench_SE' : flower(x, d.y + 9), x, d.y + 9, (x - d.x) % 2 !== 0);
  }
  for (const dx of [6, 9]) if (free(d.x + dx, d.y + 10)) put('tree1', d.x + dx, d.y + 10);

  // The Global Gate (campus): a lot sign on each global service's lot not discovered yet (the campus is always open,
  // so a global landmark never waits for its district), lamps on the access road, trees on the grass.
  const c = plan.campus;
  for (const l of w.landmarks) if (l.global && serviceById(l.id) && w.tierOf(l.id) < 0) put('lotSign', l.footprint.x + 1, l.footprint.y + l.footprint.h - 1);
  for (const dx of [4, 8]) if (free(c.x + dx, c.y + 5)) put('pack:lamp_post', c.x + dx, c.y + 5, true, [1, 1], true);
  for (let y = c.y; y < c.y + c.h; y++)
    for (let x = c.x; x < c.x + c.w; x++) {
      if (!free(x, y) || !siteGround('campus', { x, y }, plan).startsWith('grass')) continue;
      if (out.some((o) => o.x === x && o.y === y)) continue;
      if (tileHash(x, y, 5) < 0.3) put(tileHash(x, y, 9) < 0.5 ? 'tree0' : 'bush', x, y);
    }
  if (free(c.x + 6, c.y + 10)) put('pack:bench_SW', c.x + 6, c.y + 10, false);
  if (real) out.push(...groundDecor(plan, free, w.season));
  return out;
}

/**
 * A real map's parks outside the districts (src/world/zoning.ts) get trees and flowers; its neighbourhoods are infill
 * (src/game/infill.ts). Nothing blocks a sidewalk, and the same plan always gets the same decor.
 */
function groundDecor(plan: CityPlan, free: (x: number, y: number) => boolean, season?: Season): DecorItem[] {
  const out: DecorItem[] = [];
  for (let y = 0; y < plan.size; y++)
    for (let x = 0; x < plan.size; x++) {
      if (plan.groundAt?.(x, y) !== 'park' || !free(x, y)) continue;
      const h = tileHash(x, y, 7);
      if (h < 0.22) out.push({ sprite: ['tree0', 'tree1', 'pine', 'tree1'][Math.floor(tileHash(x, y, 3) * 4)], x, y, w: 1, h: 1, block: true });
      else if (h > 0.95) out.push({ sprite: flowerFor(x, y, season), x, y, w: 1, h: 1, block: true });
    }
  return out;
}
