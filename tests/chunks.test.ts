import { describe, expect, it } from 'vitest';
import { chunkCount, chunkOf, chunkRects, chunksTouching, dirtyChunks, overlaps, spriteBox, unionBox, type Box } from '@/game/chunks';
import { CITY_ISO } from '@/game/iso';

const GRID = 40;
const SIZE = 10;
const FLAT = { ax: 16, ay: 0, w: 32, h: 16 };
const tileBox = (x: number, y: number) => spriteBox(CITY_ISO, FLAT, x, y);
const rects = chunkRects(GRID, SIZE, tileBox);

describe('baked ground chunks (src/game/chunks.ts)', () => {
  it('splits the 40×40 core into 16 chunks of 10×10 tiles, row-major', () => {
    expect(chunkCount(GRID, SIZE)).toBe(16);
    expect(chunkOf(0, 0, GRID, SIZE)).toBe(0);
    expect(chunkOf(9, 9, GRID, SIZE)).toBe(0);
    expect(chunkOf(10, 0, GRID, SIZE)).toBe(1);
    expect(chunkOf(0, 10, GRID, SIZE)).toBe(4);
    expect(chunkOf(39, 39, GRID, SIZE)).toBe(15);
  });

  it("places a tile's box where addSprite draws it (the N corner at the anchor)", () => {
    // Tile (0, 0)'s N corner is at (0, −8): the diamond spans x −16..16, y −8..8.
    expect(tileBox(0, 0)).toEqual({ x: -16, y: -8, w: 32, h: 16 });
    expect(tileBox(1, 0)).toEqual({ x: 0, y: 0, w: 32, h: 16 });
  });

  it("each chunk's rectangle holds every tile it owns, and every rectangle stays under the 4096 px texture limit", () => {
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const r = rects[chunkOf(x, y, GRID, SIZE)]!;
        const b = tileBox(x, y);
        expect(b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h).toBe(true);
      }
    for (const r of rects) expect(r!.w <= 4096 && r!.h <= 4096).toBe(true);
    // A 10×10 block of 32×16 diamonds: 320 × 160 px.
    expect(rects[0]).toMatchObject({ w: 320, h: 160 });
  });

  it('leaves a chunk with no tiles out (the edge slabs only line two sides)', () => {
    const edges = chunkRects(GRID, SIZE, (x, y) => (x === GRID - 1 || y === GRID - 1 ? spriteBox(CITY_ISO, { ax: 16, ay: 0, w: 32, h: 26 }, x, y) : undefined));
    expect(edges.filter(Boolean)).toHaveLength(7);
    expect(edges[0]).toBeUndefined();
    expect(edges[15]).toBeDefined();
  });

  it("a tile is drawn into every chunk its box reaches (the rectangles of diamond-shaped blocks overlap), so no seam shows", () => {
    // The top corner of chunk 0 is in no other chunk's rectangle; its middle is also in the corners of its neighbours'.
    expect(chunksTouching(rects, tileBox(0, 0))).toEqual([0]);
    expect(chunksTouching(rects, tileBox(5, 5))).toEqual([0, 1, 4]);
    for (const c of chunksTouching(rects, tileBox(9, 9))) expect(overlaps(rects[c]!, tileBox(9, 9))).toBe(true);
  });

  it('re-bakes only the chunks a change touches; the first bake (or a lost context) bakes them all', () => {
    const before = Array.from({ length: GRID * GRID }, () => 'grass0');
    expect(dirtyChunks(undefined, before, GRID, rects, tileBox).size).toBe(16);
    expect(dirtyChunks(before, before, GRID, rects, tileBox).size).toBe(0);
    const after = [...before];
    after[0] = 'dirt';
    expect([...dirtyChunks(before, after, GRID, rects, tileBox)]).toEqual([0]);
    after[5 * GRID + 5] = 'water0';
    expect([...dirtyChunks(before, after, GRID, rects, tileBox)].sort((a, b) => a - b)).toEqual([0, 1, 4]);
    // A change far away leaves those chunks alone.
    const far = [...before];
    far[39 * GRID + 39] = 'sand';
    expect(dirtyChunks(before, far, GRID, rects, tileBox).has(0)).toBe(false);
  });

  it('boxes overlap only when they share a pixel', () => {
    const a: Box = { x: 0, y: 0, w: 10, h: 10 };
    expect(overlaps(a, { x: 9, y: 9, w: 5, h: 5 })).toBe(true);
    expect(overlaps(a, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
    expect(unionBox([a, { x: 20, y: -5, w: 5, h: 5 }])).toEqual({ x: 0, y: -5, w: 25, h: 15 });
    expect(unionBox([])).toBeUndefined();
  });
});
