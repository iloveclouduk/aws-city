// Chunk maths for baked ground (pure, tested in tests/chunks.test.ts). Ground that never moves is stamped into a few
// RenderTextures instead of one Image a tile (src/game/GroundBake.ts): the core's 40×40 tiles in 10×10-tile chunks, so a
// district opening re-bakes the chunks it touches, not the whole city.
import { cornerScreen, type Iso } from './iso';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A sprite's anchor in the atlas (sprites.json): the tile's N corner sits at (ax, ay) inside a w×h frame. */
export interface Anchor {
  ax: number;
  ay: number;
  w: number;
  h: number;
}

/** The world-px box a sprite covers when anchored on tile (x, y)'s N corner (as addSprite places it). */
export function spriteBox(iso: Iso, a: Anchor, x: number, y: number): Box {
  const n = cornerScreen(iso, x, y);
  return { x: n.x - a.ax, y: n.y - a.ay, w: a.w, h: a.h };
}

/** Whether two boxes share any pixel (touching edges don't). */
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The smallest box holding every one of `boxes` (undefined for none). */
export function unionBox(boxes: Iterable<Box>): Box | undefined {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return x0 === Infinity ? undefined : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Which chunk tile (x, y) of a `grid`-wide map belongs to, with `size`-tile square chunks (row-major ids). */
export const chunkOf = (x: number, y: number, grid: number, size: number) => Math.floor(y / size) * Math.ceil(grid / size) + Math.floor(x / size);

/** How many chunks a `grid`×`grid` map has. */
export const chunkCount = (grid: number, size: number) => Math.ceil(grid / size) ** 2;

/**
 * Each chunk's world-px rectangle: the union of the boxes of the tiles it owns, each tile's box from `box` (a flat
 * 32×16 diamond, or taller for an edge slab). Undefined for a chunk with no tiles (`box` returns undefined to skip one).
 */
export function chunkRects(grid: number, size: number, box: (x: number, y: number) => Box | undefined): (Box | undefined)[] {
  const per: Box[][] = Array.from({ length: chunkCount(grid, size) }, () => []);
  for (let y = 0; y < grid; y++)
    for (let x = 0; x < grid; x++) {
      const b = box(x, y);
      if (b) per[chunkOf(x, y, grid, size)].push(b);
    }
  return per.map((bs) => unionBox(bs));
}

/** The chunks whose rectangle a box overlaps (a stamp is drawn into each of them, so seams never show). */
export function chunksTouching(rects: readonly (Box | undefined)[], b: Box): number[] {
  const out: number[] = [];
  rects.forEach((r, i) => r && overlaps(r, b) && out.push(i));
  return out;
}

/**
 * The chunks to re-bake after the ground changed from `prev` to `next` (one key a tile, row-major): every chunk any
 * changed tile's box touches. No `prev` (the first bake, or a lost WebGL context) means all of them.
 */
export function dirtyChunks(
  prev: readonly string[] | undefined,
  next: readonly string[],
  grid: number,
  rects: readonly (Box | undefined)[],
  box: (x: number, y: number) => Box | undefined,
): Set<number> {
  const dirty = new Set<number>();
  if (!prev) {
    rects.forEach((r, i) => r && dirty.add(i));
    return dirty;
  }
  for (let i = 0; i < next.length; i++) {
    if (prev[i] === next[i]) continue;
    const x = i % grid;
    const y = Math.floor(i / grid);
    // A tile that changed either way covers the same box (every ground frame is the same flat diamond).
    const b = box(x, y);
    if (b) for (const c of chunksTouching(rects, b)) dirty.add(c);
  }
  return dirty;
}
