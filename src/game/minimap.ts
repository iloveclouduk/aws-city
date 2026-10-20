// The minimap (pure, no Phaser, no DOM): one colour per tile of the whole map (core and landscape ring) from the city's
// plan and its landscape, and the mapping between the minimap and world pixels. src/ui/Minimap.tsx draws the grid
// turned to the city's isometric view (so the minimap reads like the city), the camera's view as a rectangle over it,
// and pans the camera where it's clicked.
import type { CityPlan } from '@/world/plan';
import type { Terrain, TerrainKind } from '@/world/terrain';
import { ringOf } from '@/world/terrain';
import { DISTRICTS, type DistrictId } from '@/world/taxonomy';
import { CITY_ISO, cornerScreen } from './iso';
import { SEA_COLOR } from './palette';

/** Minimap colours, 0xrrggbb. Districts use their own colour (dimmed while locked). */
export const MINI = {
  sea: SEA_COLOR,
  road: 0x9ea3ab,
  avenue: 0xc4c8ce,
  highway: 0x6b6f76,
  park: 0x4f8f4a,
  hood: 0x7f9466,
  land: 0x6f8f55,
  field: 0xa8a35a,
  forest: 0x456b3c,
  beach: 0xe1d29b,
  island: 0x9a9a9a,
  square: 0xe8d9b0,
  day1: 0xd9a35b,
  campus: 0xb7a0d6,
  landmark: 0xfff1b8,
} as const;

const TERRAIN: Partial<Record<TerrainKind, number>> = {
  river: MINI.sea,
  sea: MINI.sea,
  promenade: MINI.road,
  beach: MINI.beach,
  land: MINI.land,
  field: MINI.field,
  forest: MINI.forest,
  highway: MINI.highway,
  bridge: MINI.highway,
  island: MINI.island,
};

/** Mix a colour toward the dark graphite (locked districts read as dim). */
export const dim = (c: number, k = 0.55) => {
  const f = (s: number) => Math.round(((c >> s) & 255) * (1 - k) + 0x15 * k);
  return (f(16) << 16) | (f(8) << 8) | f(0);
};

export interface MiniGrid {
  /** The first tile on each axis (the ring's), and the grid's width in tiles (square). */
  min: number;
  size: number;
  /** One 0xrrggbb a tile, row-major from (min, min). */
  colours: Uint32Array;
}

export interface MiniInput {
  plan: CityPlan;
  terrain?: Pick<Terrain, 'kind'>;
  /** Is a district open (its buildings in colour)? Locked ones are dimmed. */
  districtOpen?: (d: DistrictId) => boolean;
}

/** The minimap's colours for a plan (and its landscape, when built). */
export function miniGrid({ plan, terrain, districtOpen = () => true }: MiniInput): MiniGrid {
  const { min, size } = ringOf(plan.size);
  const colours = new Uint32Array(size * size);
  const tint = new Map(DISTRICTS.map((d) => [d.id, districtOpen(d.id) ? d.color : dim(d.color)]));
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const x = min + i;
      const y = min + j;
      let c: number;
      if (x < 0 || y < 0 || x >= plan.size || y >= plan.size) c = TERRAIN[terrain?.kind(x, y) ?? 'sea'] ?? MINI.land;
      else {
        const road = plan.roadAt(x, y);
        const plot = road ? undefined : plan.plotAt({ x, y });
        const ground = road || plot ? undefined : plan.groundAt?.(x, y);
        if (road) c = road.width === 2 ? MINI.avenue : MINI.road;
        else if (plan.isWater?.(x, y)) c = MINI.sea;
        else if (plot === 'square' || plot === 'day1' || plot === 'campus') c = MINI[plot];
        else if (plot && tint.has(plot as DistrictId)) c = plan.isFootprint(x, y) ? tint.get(plot as DistrictId)! : dim(tint.get(plot as DistrictId)!, 0.35);
        else if (ground === 'water') c = MINI.sea;
        else if (ground === 'park') c = MINI.park;
        else c = MINI.hood;
      }
      colours[j * size + i] = c;
    }
  return { min, size, colours };
}

/** A box in world pixels. */
export interface WorldBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The mapping between a minimap `w`×`h` px and the world: the `focus` diamond (min..min+size on both axes; the whole
 * grid by default) fits the box, kept to its 2:1 shape. `toMini`/`toWorld` convert points; `gridMatrix` is the canvas transform that draws grid pixel
 * (i, j) (one per tile) as its diamond.
 */
export function miniView(grid: Pick<MiniGrid, 'min' | 'size'>, w: number, h: number, focus: Pick<MiniGrid, 'min' | 'size'> = grid) {
  const { min, size } = focus;
  const left = cornerScreen(CITY_ISO, min, min + size).x;
  const right = cornerScreen(CITY_ISO, min + size, min).x;
  const top = cornerScreen(CITY_ISO, min, min).y;
  const bottom = cornerScreen(CITY_ISO, min + size, min + size).y;
  const k = Math.min(w / (right - left), h / (bottom - top));
  const ox = (w - (right - left) * k) / 2 - left * k;
  const oy = (h - (bottom - top) * k) / 2 - top * k;
  const n = cornerScreen(CITY_ISO, grid.min, grid.min);
  return {
    k,
    toMini: (x: number, y: number) => ({ x: x * k + ox, y: y * k + oy }),
    toWorld: (x: number, y: number) => ({ x: (x - ox) / k, y: (y - oy) / k }),
    /** [a, b, c, d, e, f] for ctx.setTransform: grid (i, j) → minimap px. */
    gridMatrix: [CITY_ISO.halfW * k, CITY_ISO.halfH * k, -CITY_ISO.halfW * k, CITY_ISO.halfH * k, n.x * k + ox, n.y * k + oy] as const,
    box: (b: WorldBox): WorldBox => ({ x: b.x * k + ox, y: b.y * k + oy, w: b.w * k, h: b.h * k }),
  };
}

/** `#rrggbb` for a colour. */
export const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** What the minimap frames: the core and a few tiles of landscape round it (the river and the bridges). */
export const MINI_MARGIN = 7;
export const miniFocus = (coreSize: number) => ({ min: -MINI_MARGIN, size: coreSize + 2 * MINI_MARGIN });
