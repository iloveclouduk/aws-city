// A Region's real street map, baked from OpenStreetMap by `npm run city-maps` into shared/city-maps/<region>.json
// (format v1, docs in that folder's LICENSE.md and the Phase 4 brief): straight streets on a 64×64 core, water and park
// masks over the core and its landscape ring (run-length encoded), and a building-density grid. This module only
// decodes and validates the file (pure, no Phaser); src/world/zoning.ts turns it into a CityPlan.
//
// Map data © OpenStreetMap contributors, ODbL 1.0. The files are bundled: the game never requests map data.
import type { Rect } from './layout';
import type { Street } from './plan';

/** Every baked map, by file path (none until the bake has run: then every Region keeps the legacy city). */
const FILES = import.meta.glob('../../shared/city-maps/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** A street as baked: its class (6 motorway … 1 residential, 0 synthetic) and whether the bake added it. */
export interface MapStreet extends Street {
  cls: number;
  syn: boolean;
}

export interface DecodedCityMap {
  region: string;
  city: string;
  /** The core is size×size tiles. */
  size: number;
  /** The masks cover the core and `ring` tiles round it: (size + 2·ring)² tiles. */
  ring: number;
  /** Metres per tile, and the bearing the map was turned by (degrees). */
  mpt: number;
  bearing: number;
  streets: MapStreet[];
  square: Rect;
  day1: Rect;
  campus: Rect;
  /** Water and park at a core-local tile (the ring included); false off the masks. */
  water(x: number, y: number): boolean;
  green(x: number, y: number): boolean;
  /** Building density 0..3 at a core tile (per 4×4 cell); 0 off the core. */
  density(x: number, y: number): number;
  attribution: string;
  licence: string;
  fetched: string;
}

export class CityMapError extends Error {}

const SUPERBLOCK = 12;
const fail = (why: string): never => {
  throw new CityMapError(why);
};
const int = (v: unknown, lo: number, hi: number, what: string): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fail(`${what}: ${JSON.stringify(v)} is not an integer in ${lo}..${hi}`);
const str = (v: unknown, what: string): string => (typeof v === 'string' ? v : fail(`${what} is not a string`));

/** One mask: rows top to bottom joined by '.', each row base-36 run lengths alternating 0 and 1 (starting with 0). */
export function decodeMask(s: string, w: number): Uint8Array {
  const rows = s.split('.');
  if (rows.length !== w) fail(`mask has ${rows.length} rows, not ${w}`);
  const out = new Uint8Array(w * w);
  rows.forEach((row, y) => {
    let x = 0;
    let v = 0;
    for (const r of row.split(',')) {
      if (!/^[0-9a-z]+$/.test(r)) fail(`mask row ${y}: bad run "${r}"`);
      const n = parseInt(r, 36);
      if (v && n) out.fill(1, y * w + x, y * w + Math.min(w, x + n));
      x += n;
      v ^= 1;
    }
    if (x !== w) fail(`mask row ${y} covers ${x} tiles, not ${w}`);
  });
  return out;
}

/** The encoder (for tests and fixtures): the inverse of decodeMask. */
export function encodeMask(m: ArrayLike<number>, w: number): string {
  const rows: string[] = [];
  for (let y = 0; y < w; y++) {
    const runs: number[] = [];
    let v = 0;
    let n = 0;
    for (let x = 0; x < w; x++) {
      const b = m[y * w + x] ? 1 : 0;
      if (b === v) n++;
      else runs.push(n), (v ^= 1), (n = 1);
    }
    runs.push(n);
    rows.push(runs.map((r) => r.toString(36)).join(','));
  }
  return rows.join('.');
}

/** Decode and check a baked map (shape and ranges; zoning checks it makes a city). Throws CityMapError. */
export function decodeCityMap(raw: unknown): DecodedCityMap {
  if (!raw || typeof raw !== 'object') fail('not an object');
  const d = raw as Record<string, unknown>;
  if (d.v !== 1) fail(`unknown version ${JSON.stringify(d.v)}`);
  const size = int(d.core, 32, 128, 'core');
  const ring = int(d.ring, 0, 64, 'ring');
  const W = size + 2 * ring;
  if (!Array.isArray(d.streets) || d.streets.length < 4) fail('streets missing');
  const streets = (d.streets as unknown[]).map((s, i): MapStreet => {
    if (!Array.isArray(s) || s.length < 6) fail(`street ${i} is not [axis, at, from, to, width, cls, syn?]`);
    const [axis, at, from, to, width, cls, syn] = s as unknown[];
    if (axis !== 'x' && axis !== 'y') fail(`street ${i}: axis ${JSON.stringify(axis)}`);
    const w = int(width, 1, 2, `street ${i} width`) as 1 | 2;
    const a = int(at, 0, size - w, `street ${i} at`);
    const f = int(from, 0, size - 1, `street ${i} from`);
    const t = int(to, f, size - 1, `street ${i} to`);
    return { axis: axis as 'x' | 'y', at: a, from: f, to: t, width: w, cls: int(cls, 0, 6, `street ${i} cls`), syn: syn === 1 };
  });
  const block = (k: string): Rect => {
    const v = d[k];
    if (!Array.isArray(v) || v.length !== 2) fail(`${k} is not [x, y]`);
    const [x, y] = v as unknown[];
    return { x: int(x, 0, size - SUPERBLOCK, `${k} x`), y: int(y, 0, size - SUPERBLOCK, `${k} y`), w: SUPERBLOCK, h: SUPERBLOCK };
  };
  const water = decodeMask(str(d.water, 'water'), W);
  const green = decodeMask(str(d.green, 'green'), W);
  const cells = size / 4;
  const dens = str(d.density, 'density');
  if (!Number.isInteger(cells) || dens.length !== cells * cells || !/^[0-3]+$/.test(dens)) fail(`density is not ${cells}×${cells} digits 0..3`);
  const mask = (m: Uint8Array) => (x: number, y: number) => {
    const i = x + ring;
    const j = y + ring;
    return i >= 0 && j >= 0 && i < W && j < W && m[j * W + i] === 1;
  };
  const centre = d.centre as unknown;
  if (!Array.isArray(centre) || centre.length !== 2 || !centre.every((n) => typeof n === 'number')) fail('centre is not [lat, lon]');
  return {
    region: str(d.region, 'region'),
    city: str(d.city, 'city'),
    size,
    ring,
    mpt: typeof d.mpt === 'number' ? d.mpt : fail('mpt'),
    bearing: typeof d.bearing === 'number' ? d.bearing : 0,
    streets,
    square: block('square'),
    day1: block('day1'),
    campus: block('campus'),
    water: mask(water),
    green: mask(green),
    density: (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : dens.charCodeAt(Math.floor(y / 4) * cells + Math.floor(x / 4)) - 48),
    attribution: str(d.attribution, 'attribution'),
    licence: str(d.licence, 'licence'),
    fetched: str(d.fetched, 'fetched'),
  };
}

/** The raw baked file for a Region, if the bake made one. */
export const rawCityMap = (region: string): unknown => FILES[`../../shared/city-maps/${region}.json`];
/** The Regions with a baked map. */
export const mappedRegions = (): string[] =>
  Object.keys(FILES)
    .map((p) => /\/([^/]+)\.json$/.exec(p)?.[1])
    .filter((c): c is string => !!c)
    .sort();
