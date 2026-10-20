import type { Tile } from '@/world/layout';

/**
 * Most tiles A* expands before it gives up (plan B6): the 40×40 core is 1,600 tiles, and a 64×64 street plan's core
 * 4,096, so this only stops runaway searches.
 */
export const MAX_EXPANDED = 6000;

/**
 * A* on a 4-connected grid. Returns tiles from start (exclusive) to goal (inclusive), or [] if unreachable or the
 * search expands more than `maxExpanded` tiles (callers already treat [] as "can't get there").
 *
 * The open set is a binary heap ordered by f, then by when the tile first joined the open set: the same tile the old
 * linear scan picked (the first-inserted of the lowest f), so every route is the one it found. A tile whose g improves
 * is pushed again with its new f and its old order; the stale entry is skipped when it surfaces.
 */
export function findPath(
  start: Tile,
  goal: Tile,
  w: number,
  h: number,
  walkable: (x: number, y: number) => boolean,
  maxExpanded = MAX_EXPANDED,
): Tile[] {
  if (start.x === goal.x && start.y === goal.y) return [];
  const key = (x: number, y: number) => y * w + x;
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  /** Open tiles: their current f and the order they joined the open set (kept while they stay open). */
  const open = new Map<number, { f: number; seq: number }>();
  const heap = new OpenHeap();
  let seq = 0;
  const hdist = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const s = key(start.x, start.y);
  g.set(s, 0);
  open.set(s, { f: hdist(start.x, start.y), seq });
  heap.push(hdist(start.x, start.y), seq++, s);
  const goalKey = key(goal.x, goal.y);

  let expanded = 0;
  while (heap.size) {
    const top = heap.pop();
    const cur = open.get(top.k);
    if (!cur || cur.f !== top.f || cur.seq !== top.seq) continue; // stale: closed, or improved since
    if (++expanded > maxExpanded) return [];
    const bestK = top.k;
    open.delete(bestK);
    if (bestK === goalKey) {
      const out: Tile[] = [];
      let k = goalKey;
      while (k !== s) {
        out.push({ x: k % w, y: Math.floor(k / w) });
        k = came.get(k)!;
      }
      return out.reverse();
    }
    const bx = bestK % w;
    const by = Math.floor(bestK / w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = bx + dx;
      const ny = by + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = key(nx, ny);
      if (nk !== goalKey && !walkable(nx, ny)) continue;
      const ng = g.get(bestK)! + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, bestK);
        const f = ng + hdist(nx, ny);
        const was = open.get(nk);
        const order = was ? was.seq : seq++;
        open.set(nk, { f, seq: order });
        heap.push(f, order, nk);
      }
    }
  }
  return [];
}

/** A binary min-heap of open-set entries by (f, seq). */
class OpenHeap {
  private f: number[] = [];
  private seq: number[] = [];
  private k: number[] = [];

  get size() {
    return this.k.length;
  }

  private less(i: number, j: number) {
    return this.f[i] < this.f[j] || (this.f[i] === this.f[j] && this.seq[i] < this.seq[j]);
  }

  private swap(i: number, j: number) {
    for (const a of [this.f, this.seq, this.k]) [a[i], a[j]] = [a[j], a[i]];
  }

  push(f: number, seq: number, k: number) {
    this.f.push(f);
    this.seq.push(seq);
    this.k.push(k);
    let i = this.k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): { f: number; seq: number; k: number } {
    const top = { f: this.f[0], seq: this.seq[0], k: this.k[0] };
    const last = this.k.length - 1;
    this.swap(0, last);
    this.f.pop();
    this.seq.pop();
    this.k.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < last && this.less(l, m)) m = l;
      if (r < last && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

/**
 * Routes reused between the same two tiles (plan B6): the baseline packets run the same flows over and over, and
 * citizens walk to the same benches and work spots. `version` names what the grid looked like; when it changes
 * (decor that blocks tiles came or went) every cached route is dropped. Small and least-recently-used.
 */
export class RouteCache {
  private routes = new Map<string, Tile[]>();
  private at: number;

  constructor(
    private version: () => number = () => 0,
    private max = 64,
  ) {
    this.at = version();
  }

  /** A copy of the route from `from` to `goal` (callers walk it by shifting), computed once per grid version. */
  get(from: Tile, goal: Tile, compute: () => Tile[]): Tile[] {
    const v = this.version();
    if (v !== this.at) {
      this.routes.clear();
      this.at = v;
    }
    const k = `${from.x},${from.y}>${goal.x},${goal.y}`;
    let r = this.routes.get(k);
    if (r) this.routes.delete(k);
    else r = compute();
    this.routes.set(k, r);
    if (this.routes.size > this.max) this.routes.delete(this.routes.keys().next().value!);
    return r.slice();
  }

  get size() {
    return this.routes.size;
  }
}
