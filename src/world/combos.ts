// Service combos (plan round 3, Step 3; shared/combos.json): pairs and trios of services that work together. When every
// service of a combo is put up in a Region's city, the combo is found (the Codex keeps it, S2's `discoverCombo`) and its
// prop stands on free ground near the middle of its buildings, so the city shows what fits together. Pure and
// deterministic (no rng()): the same city always puts the same prop on the same tiles.
//
// Each building has a fixed lot in its district, so how far apart two services stand isn't the player's choice: a
// combo is found by putting its services up, and `radius` is how far from their middle its prop may stand.
import data from '../../shared/combos.json' with { type: 'json' };
import type { LandmarkLayout, Tile } from './layout';

export interface Combo {
  id: string;
  services: string[];
  name: string;
  /** One plain sentence: what the services do together. */
  simple: string;
  /** The AWS page the fact comes from. */
  source: string;
  /** The prop's atlas sprite (art/tiles/combos_art.py), with `@lights` for night. */
  sprite: string;
  /** The prop's footprint in tiles, [w, h]. */
  size: [number, number];
  /** How far (tiles) from the middle of its buildings the prop may stand. */
  radius: number;
}

export const COMBOS: Combo[] = (data as unknown as { combos: Combo[] }).combos;
export const comboById = (id: string) => COMBOS.find((c) => c.id === id);
export const comboBySprite = (sprite: string) => COMBOS.find((c) => c.sprite === sprite);

/**
 * The combos found in a city: every service put up here (tier ≥ 0: a construction site counts) and standing in this
 * city's plan (`placed`: a lot it has here). In combos.json order.
 */
export function combosFound(tierOf: (serviceId: string) => number, placed: (serviceId: string) => boolean): Combo[] {
  return COMBOS.filter((c) => c.services.every((s) => placed(s) && tierOf(s) >= 0));
}

/** A combo that's newly found: in `now` and not in `before` (ids). */
export const newCombos = (now: readonly Combo[], before: ReadonlySet<string>) => now.filter((c) => !before.has(c.id));

const centre = (l: LandmarkLayout) => ({ x: l.footprint.x + l.footprint.w / 2, y: l.footprint.y + l.footprint.h / 2 });

/** The middle of a combo's buildings (the average of their lots' centres), or undefined when one has no lot. */
export function comboMid(c: Combo, layout: (id: string) => LandmarkLayout | undefined): { x: number; y: number } | undefined {
  const ls = c.services.map(layout);
  if (ls.some((l) => !l)) return undefined;
  const pts = (ls as LandmarkLayout[]).map(centre);
  return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
}

/** A combo prop on the map: its north tile and footprint. */
export interface ComboSpot {
  combo: Combo;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A small, stable hash of a tile (ties between equally near spots). */
const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export interface ComboGround {
  /** The grid's size (tiles a side). */
  size: number;
  /** A tile a prop may stand on (the decor's own rule: not a road, sidewalk, footprint, work spot, front row, water…). */
  free: (x: number, y: number) => boolean;
  /** The landmark layouts, for the middles and the work spots. */
  layout: (id: string) => LandmarkLayout | undefined;
  /** Every landmark's work spot: no prop stands next to one (a building's door stays easy to reach). */
  workSpots: readonly Tile[];
}

/**
 * Where each found combo's prop stands: the free footprint (its `size`) nearest the middle of its buildings within its
 * `radius`; failing that, the nearest within `radius` of each of its buildings in turn. Props keep a tile apart, never
 * stand beside a work spot, and a combo with nowhere to stand gets no prop (it's still found).
 */
export function placeCombos(found: readonly Combo[], g: ComboGround): ComboSpot[] {
  const taken = new Set<number>();
  const k = (x: number, y: number) => y * g.size + x;
  const nearDoor = new Set<number>();
  for (const w of g.workSpots) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) nearDoor.add(k(w.x + dx, w.y + dy));
  const fits = (x: number, y: number, w: number, h: number) => {
    if (x < 0 || y < 0 || x + w > g.size || y + h > g.size) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!g.free(i, j) || taken.has(k(i, j)) || nearDoor.has(k(i, j))) return false;
    return true;
  };
  const out: ComboSpot[] = [];
  for (const c of found) {
    const [w, h] = c.size;
    const mid = comboMid(c, g.layout);
    if (!mid) continue;
    const aims = [mid, ...c.services.map((s) => centre(g.layout(s)!))];
    let spot: { x: number; y: number } | undefined;
    for (const aim of aims) {
      let best: { x: number; y: number; d: number; t: number } | undefined;
      const r = Math.ceil(c.radius);
      for (let y = Math.floor(aim.y - r); y <= Math.ceil(aim.y + r); y++)
        for (let x = Math.floor(aim.x - r); x <= Math.ceil(aim.x + r); x++) {
          const d = Math.hypot(x + w / 2 - aim.x, y + h / 2 - aim.y);
          if (d > c.radius || !fits(x, y, w, h)) continue;
          const t = hash(x, y, c.id.length);
          if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && t < best.t)) best = { x, y, d, t };
        }
      if (best) {
        spot = best;
        break;
      }
    }
    if (!spot) continue;
    // Its tiles and a ring round them: the next prop keeps a tile away.
    for (let j = spot.y - 1; j <= spot.y + h; j++) for (let i = spot.x - 1; i <= spot.x + w; i++) taken.add(k(i, j));
    out.push({ combo: c, x: spot.x, y: spot.y, w, h });
  }
  return out;
}
