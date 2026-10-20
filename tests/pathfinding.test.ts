import { describe, expect, it } from 'vitest';
import { findPath, MAX_EXPANDED, RouteCache } from '@/game/pathfinding';
import { mulberry32 } from '@/game/rng';
import { GRID, isFootprint, LANDMARKS } from '@/world/layout';

/** The A* findPath used before the binary heap (a linear scan of the open set), kept to prove the routes are the same. */
function linearScanPath(start: { x: number; y: number }, goal: { x: number; y: number }, w: number, h: number, walkable: (x: number, y: number) => boolean, maxExpanded = 2000) {
  if (start.x === goal.x && start.y === goal.y) return [];
  const key = (x: number, y: number) => y * w + x;
  const open = new Map<number, { x: number; y: number; f: number }>();
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const hdist = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const s = key(start.x, start.y);
  g.set(s, 0);
  open.set(s, { x: start.x, y: start.y, f: hdist(start.x, start.y) });
  const goalKey = key(goal.x, goal.y);
  let expanded = 0;
  while (open.size) {
    if (++expanded > maxExpanded) return [];
    let bestK = -1;
    let best: { x: number; y: number; f: number } | undefined;
    for (const [k, n] of open) if (!best || n.f < best.f) (best = n), (bestK = k);
    if (!best) break;
    open.delete(bestK);
    if (bestK === goalKey) {
      const out: { x: number; y: number }[] = [];
      let k = goalKey;
      while (k !== s) {
        out.push({ x: k % w, y: Math.floor(k / w) });
        k = came.get(k)!;
      }
      return out.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = best.x + dx;
      const ny = best.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = key(nx, ny);
      if (nk !== goalKey && !walkable(nx, ny)) continue;
      const ng = g.get(bestK)! + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, bestK);
        open.set(nk, { x: nx, y: ny, f: ng + hdist(nx, ny) });
      }
    }
  }
  return [];
}

describe('findPath', () => {
  it('walks around a wall', () => {
    const wall = new Set(['1,0', '1,1', '1,2']);
    const path = findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, 4, 4, (x, y) => !wall.has(`${x},${y}`));
    expect(path.at(-1)).toEqual({ x: 2, y: 0 });
    expect(path.some((t) => wall.has(`${t.x},${t.y}`))).toBe(false);
    expect(path).toHaveLength(8);
  });

  it('returns [] when unreachable', () => {
    expect(findPath({ x: 0, y: 0 }, { x: 3, y: 3 }, 4, 4, (x) => x < 2)).toEqual([]);
  });

  it('gives up (returns []) after maxExpanded tiles', () => {
    const open = () => true;
    // The whole 40x40 city core fits under the default guard, however the ties fall.
    expect(findPath({ x: 0, y: 0 }, { x: 39, y: 39 }, 40, 40, open)).toHaveLength(78);
    // A long corridor (down, across, up) needs ~300 expansions: a guard of 50 stops it.
    const corridor = (x: number, y: number) => x === 0 || y === 99 || x === 99;
    expect(findPath({ x: 0, y: 0 }, { x: 99, y: 0 }, 100, 100, corridor)).toHaveLength(297);
    expect(findPath({ x: 0, y: 0 }, { x: 99, y: 0 }, 100, 100, corridor, 50)).toEqual([]);
  });
});

describe('findPath with a binary heap (Phase 2)', () => {
  it('raises the guard to 6,000 expansions (room for a 64×64 core)', () => expect(MAX_EXPANDED).toBe(6000));

  // The heap breaks ties the way the linear scan did (lowest f, then first into the open set), so the routes are the
  // same tiles, not just the same length.
  it('finds exactly the routes the linear scan found on the city core (work spot to work spot)', () => {
    const walk = (x: number, y: number) => !isFootprint(x, y);
    const spots = LANDMARKS.map((l) => l.workSpot);
    let pairs = 0;
    for (let i = 0; i < spots.length; i += 3)
      for (let j = 1; j < spots.length; j += 5) {
        expect(findPath(spots[i], spots[j], GRID, GRID, walk)).toEqual(linearScanPath(spots[i], spots[j], GRID, GRID, walk));
        pairs++;
      }
    expect(pairs).toBeGreaterThan(100);
  });

  it('finds exactly the routes the linear scan found on random mazes, open fields and blocked goals', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = mulberry32(seed);
      const n = 12 + Math.floor(rng() * 30);
      const density = [0, 0.15, 0.3, 0.45][seed % 4];
      const wall = new Set<number>();
      for (let k = 0; k < n * n; k++) if (rng() < density) wall.add(k);
      const walk = (x: number, y: number) => !wall.has(y * n + x);
      for (let p = 0; p < 10; p++) {
        const a = { x: Math.floor(rng() * n), y: Math.floor(rng() * n) };
        const b = { x: Math.floor(rng() * n), y: Math.floor(rng() * n) };
        expect(findPath(a, b, n, n, walk, 2000), `seed ${seed} ${a.x},${a.y}>${b.x},${b.y}`).toEqual(linearScanPath(a, b, n, n, walk, 2000));
      }
    }
  });
});

describe('RouteCache', () => {
  it('finds a route once per grid version and hands out copies', () => {
    let version = 1;
    let runs = 0;
    const cache = new RouteCache(() => version);
    const find = () => (runs++, findPath({ x: 0, y: 0 }, { x: 3, y: 0 }, 4, 4, () => true));
    const a = cache.get({ x: 0, y: 0 }, { x: 3, y: 0 }, find);
    a.shift(); // a walker consumes its copy
    expect(cache.get({ x: 0, y: 0 }, { x: 3, y: 0 }, find)).toHaveLength(3);
    expect(runs).toBe(1);
    version = 2; // decor blocked or freed a tile
    cache.get({ x: 0, y: 0 }, { x: 3, y: 0 }, find);
    expect(runs).toBe(2);
  });

  it('keeps only the most recently used routes', () => {
    const cache = new RouteCache(undefined, 2);
    for (const x of [1, 2, 3]) cache.get({ x: 0, y: 0 }, { x, y: 0 }, () => []);
    expect(cache.size).toBe(2);
  });
});
