// Decorate's helpers for the city scene (pure): every tile a decoration may stand on now, the one nearest a point (where
// Decorate opens, so it never opens over water), and snapping a tap to the nearest legal tile within a short reach, so
// placing isn't pixel-hunting.
import type { Tile } from './layout';

/** How far (in tiles, either way) a tap snaps to a legal tile. */
export const SNAP_REACH = 2;

/** Every tile of a size×size city where `ok` holds, in reading order. */
export function freeTiles(size: number, ok: (x: number, y: number) => boolean): Tile[] {
  const out: Tile[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (ok(x, y)) out.push({ x, y });
  return out;
}

const dist2 = (a: Tile, b: Tile) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** The tile of `tiles` nearest `to` (ties: the first in reading order); undefined when there are none. */
export function nearestTile(tiles: readonly Tile[], to: Tile): Tile | undefined {
  let best: Tile | undefined;
  for (const t of tiles) if (!best || dist2(t, to) < dist2(best, to)) best = t;
  return best;
}

/**
 * Where a tap on `t` builds: `t` itself when legal, else the nearest legal tile at most `reach` tiles away either way
 * (ties go to the first in reading order), else undefined (the tap is refused with its reason).
 */
export function snapTile(t: Tile, ok: (x: number, y: number) => boolean, reach = SNAP_REACH): Tile | undefined {
  if (ok(t.x, t.y)) return t;
  let best: Tile | undefined;
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      const c = { x: t.x + dx, y: t.y + dy };
      if ((dx || dy) && ok(c.x, c.y) && (!best || dist2(c, t) < dist2(best, t))) best = c;
    }
  return best;
}
