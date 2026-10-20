/**
 * Edge Cache rules (CloudFront; pure: no Phaser, no store), so tests can play whole rounds. Four slots at the edge hold
 * files for a TTL. A request for a fresh cached file is a hit; a cached file that changed at the origin is served stale
 * until it's invalidated or expires; anything else is a miss (a trip to the origin). Caching a file pays nothing by
 * itself: points come from the hits it brings, so caching everything in sight doesn't score. A full cache makes room
 * by dropping the file asked for least recently (as a cache evicts), so popular files stay put: caching each miss is a
 * fair first strategy, and caching the files asked for most (their heat, `asked`) is the winning one.
 */
export const EDGE_RULES = {
  slots: 4,
  ttlMs: 15000,
  /** A cached file changes at the origin every this many ms. */
  changeMs: 9000,
  /** A miss stays in the feed (clickable) this long. */
  feedMs: 4000,
  /** The tip about popular files shows this long into a round. */
  tipMs: 10000,
  /** Asked for this many times, and among the four most asked: a popular file (🔥). */
  hotFrom: 3,
  hit: 3,
  miss: -1,
  stale: -4,
  /** Invalidating a changed file, and invalidating one that was still fresh (a wasted trip for every viewer). */
  invalidate: 8,
  wrongInvalidate: -10,
} as const;

export interface Cached {
  name: string;
  version: number;
  until: number;
  /** When a viewer last got it (the least recently used is evicted first). */
  used: number;
}

export interface EdgeState {
  slots: (Cached | undefined)[];
  versions: Map<string, number>;
  hits: number;
  misses: number;
  stale: number;
  /** Requests per file so far (its heat). */
  asked: Map<string, number>;
}

export const newEdge = (files: string[]): EdgeState => ({
  slots: Array.from({ length: EDGE_RULES.slots }, () => undefined),
  versions: new Map(files.map((f) => [f, 1])),
  hits: 0,
  misses: 0,
  stale: 0,
  asked: new Map(),
});

export const isChanged = (s: EdgeState, c: Cached) => (s.versions.get(c.name) ?? 1) > c.version;

/** A viewer asks for `name` at `now`: a hit, a stale copy, or a miss. */
export function request(s: EdgeState, name: string, now = 0): 'hit' | 'stale' | 'miss' {
  s.asked.set(name, (s.asked.get(name) ?? 0) + 1);
  const c = s.slots.find((x) => x?.name === name);
  if (!c) return (s.misses++, 'miss');
  c.used = now;
  if (isChanged(s, c)) return (s.stale++, 'stale');
  return (s.hits++, 'hit');
}

/** Is `name` one of the files asked for most so far (its heat shows as 🔥)? */
export function isPopular(s: EdgeState, name: string): boolean {
  const n = s.asked.get(name) ?? 0;
  if (n < EDGE_RULES.hotFrom) return false;
  const top = [...s.asked.values()].sort((a, b) => b - a)[EDGE_RULES.slots - 1] ?? 0;
  return n >= top;
}

/** Caches `name` (an empty slot first, else the least recently used, as a cache evicts); its slot, or -1 if cached already. */
export function store(s: EdgeState, name: string, now: number, ttl: number = EDGE_RULES.ttlMs): number {
  if (s.slots.some((c) => c?.name === name)) return -1;
  let i = s.slots.findIndex((c) => !c);
  if (i < 0) i = s.slots.reduce((best, c, k) => (c!.used < s.slots[best]!.used ? k : best), 0);
  s.slots[i] = { name, version: s.versions.get(name) ?? 1, until: now + ttl, used: now };
  return i;
}

/** The file changed at the origin. */
export const change = (s: EdgeState, name: string) => void s.versions.set(name, (s.versions.get(name) ?? 1) + 1);

/** Invalidates slot `i`: right if its file had changed, wrong if it was still fresh; undefined for an empty slot. */
export function invalidate(s: EdgeState, i: number): 'right' | 'wrong' | undefined {
  const c = s.slots[i];
  if (!c) return undefined;
  s.slots[i] = undefined;
  return isChanged(s, c) ? 'right' : 'wrong';
}

/** Drops copies past their TTL; the slots it emptied. */
export function expire(s: EdgeState, now: number): number[] {
  const out: number[] = [];
  s.slots.forEach((c, i) => {
    if (c && now > c.until) {
      s.slots[i] = undefined;
      out.push(i);
    }
  });
  return out;
}

/** Hits over all requests, percent. */
export const hitRatio = (s: EdgeState) => {
  const n = s.hits + s.misses + s.stale;
  return n ? Math.round((s.hits / n) * 100) : 0;
};
