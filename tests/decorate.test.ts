import { describe, expect, it } from 'vitest';
import { freeTiles, nearestTile, snapTile, SNAP_REACH } from '@/world/decorate';

// A 10×10 city where only a 2×2 lawn at (6,6)–(7,7) is free.
const lawn = (x: number, y: number) => x >= 6 && x <= 7 && y >= 6 && y <= 7;

describe('Decorate helpers', () => {
  it('lists every free tile in reading order', () => {
    expect(freeTiles(10, lawn)).toEqual([
      { x: 6, y: 6 },
      { x: 7, y: 6 },
      { x: 6, y: 7 },
      { x: 7, y: 7 },
    ]);
  });

  it('opens on the free tile nearest Kai, never elsewhere', () => {
    expect(nearestTile(freeTiles(10, lawn), { x: 0, y: 0 })).toEqual({ x: 6, y: 6 });
    expect(nearestTile(freeTiles(10, lawn), { x: 9, y: 9 })).toEqual({ x: 7, y: 7 });
    expect(nearestTile([], { x: 1, y: 1 })).toBeUndefined();
  });

  it('keeps a tap on a legal tile where it is', () => {
    expect(snapTile({ x: 7, y: 6 }, lawn)).toEqual({ x: 7, y: 6 });
  });

  it(`snaps a near miss to the nearest legal tile within ${SNAP_REACH} tiles`, () => {
    expect(snapTile({ x: 5, y: 6 }, lawn)).toEqual({ x: 6, y: 6 });
    expect(snapTile({ x: 9, y: 9 }, lawn)).toEqual({ x: 7, y: 7 });
    // Straight neighbours beat diagonals.
    expect(snapTile({ x: 8, y: 6 }, lawn)).toEqual({ x: 7, y: 6 });
  });

  it('refuses a tap too far from any legal tile', () => {
    expect(snapTile({ x: 3, y: 3 }, lawn)).toBeUndefined();
    expect(snapTile({ x: 3, y: 6 }, lawn, 2)).toBeUndefined();
  });
});
