// City Lights, the forgiving streak (contract v2.15 Progress.lights). Each learning day lights a window on the player's
// skyline, for good: the count only grows. A missed day dims one window, and the next learning day relights it, so a
// break costs a little glow, never the city. Freezes are earned by playing (one per FREEZE_EVERY learning days, at most
// MAX_FREEZES held) and each covers one missed day so no window dims; v2.16 counts them earned and used (freezeCounters). Progress.streak and nextStreak stay as they were
// (badges read the longest run); this is what the HUD and My City show. Pure (tests/lights.test.ts).
import type { CityLights, Progress } from '@/backend/contract';
import { daysBetween } from './progress';

export type { CityLights };

/** One earned freeze per this many learning days. */
export const FREEZE_EVERY = 7;
/** Freezes held at most. */
export const MAX_FREEZES = 3;
/** Learning days (and covered days) kept in Progress. */
export const KEEP_DAYS = 60;

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

const tidy = (days: Iterable<string>) => [...new Set(days)].sort().slice(-KEEP_DAYS);

/**
 * The player's City Lights. A save from before v2.15 has none: its streak's current run becomes the first windows (the
 * days in a row up to its last day), so nothing earned is lost.
 */
export function lightsOf(p: Pick<Progress, 'lights' | 'streak'>): CityLights {
  if (p.lights) return p.lights;
  const s = p.streak;
  if (!s) return { days: [], freezes: 0 };
  const n = Math.max(1, Math.min(s.days, KEEP_DAYS));
  return { days: Array.from({ length: n }, (_, i) => addDays(s.last, i - n + 1)), total: s.days, freezes: 0 };
}

/** Learning days ever (every window lit). */
export const totalOf = (l: CityLights) => Math.max(l.total ?? 0, l.days.length);

/**
 * v2.16: freezes as two counters that only go up (earned, used), like the wallet, so two copies merge without losing a
 * freeze earned on one and spent on the other. A save from before v2.16 has only `freezes` (held) and `usedFreezes`.
 */
export function freezeCounters(l: CityLights): { earned: number; used: number } {
  // Before v2.16: the days a freeze covered count as used (so a copy that spent one still says so), the rest as held.
  if (l.freezesEarned === undefined) {
    const used = (l.usedFreezes ?? []).length;
    return { earned: Math.max(0, l.freezes) + used, used };
  }
  return { earned: l.freezesEarned, used: Math.min(l.freezesUsed ?? 0, l.freezesEarned) };
}

/** Freezes held now (earned − used, at most MAX_FREEZES). */
export const heldFreezes = (l: CityLights) => {
  const c = freezeCounters(l);
  return Math.max(0, Math.min(MAX_FREEZES, c.earned - c.used));
};

/** The lights with these counters (and `freezes`, what an older client reads, kept equal to what's held). */
const withCounters = (l: CityLights, earned: number, used: number): CityLights => {
  // Never more than MAX_FREEZES held: a merge that would hold more forgets the extra earned ones.
  const e = Math.min(earned, used + MAX_FREEZES);
  return { ...l, freezes: Math.max(0, e - used), freezesEarned: e, freezesUsed: used };
};

/**
 * The lights after learning on `today`: the same day changes nothing (the same object back). Missed days since the last
 * learning day are covered by freezes held, most recent first; every FREEZE_EVERY-th learning day earns a freeze.
 */
export function lightDay(l: CityLights | undefined, today: string): CityLights {
  const cur = l ?? { days: [], freezes: 0 };
  if (cur.days.includes(today)) return cur;
  const last = cur.days.at(-1);
  // A clock that went backwards: light the day, but cover nothing.
  const missed = last && last < today ? Math.max(0, daysBetween(last, today) - 1) : 0;
  const used = cur.usedFreezes ?? [];
  const held = heldFreezes(cur);
  const cover: string[] = [];
  for (let i = 1; i <= missed && cover.length < held; i++) {
    const d = addDays(today, -i);
    if (!used.includes(d)) cover.push(d);
  }
  const total = totalOf(cur) + 1;
  const c = freezeCounters(cur);
  const earn = total % FREEZE_EVERY === 0 && held - cover.length < MAX_FREEZES ? 1 : 0;
  const out: CityLights = withCounters({ days: tidy([...cur.days, today]), total, freezes: 0 }, c.earned + earn, c.used + cover.length);
  const usedFreezes = tidy([...used, ...cover]);
  if (usedFreezes.length) out.usedFreezes = usedFreezes;
  return out;
}

/** One more earned freeze (a season road step), at most MAX_FREEZES held. `full`: none added. */
export function addFreeze(l: CityLights | undefined): { lights: CityLights; full: boolean } {
  const cur = l ?? { days: [], freezes: 0 };
  if (heldFreezes(cur) >= MAX_FREEZES) return { lights: cur, full: true };
  const c = freezeCounters(cur);
  return { lights: withCounters(cur, c.earned + 1, c.used), full: false };
}

export interface LightsView {
  /** Windows ever lit (learning days). */
  total: number;
  /** Windows glowing now (total − dim). */
  glowing: number;
  /** Windows dimmed by missed days (a learning day relights one). */
  dim: number;
  /** Missed days a freeze covered (or will cover on the next learning day), in the last KEEP_DAYS. */
  frozen: number;
  /** Freezes held and not yet promised to a missed day. */
  freezes: number;
  /** Learned today: tonight's window is lit. */
  tonight: boolean;
  /** Nights in a row (covered days keep the run going). */
  run: number;
  /** Learning days until the next earned freeze (0 when the freezes are full). */
  toFreeze: number;
}

/** How the skyline looks on `today`. */
export function lightsView(l: CityLights, today: string): LightsView {
  const total = totalOf(l);
  const lit = new Set(l.days);
  const used = new Set(l.usedFreezes ?? []);
  const first = l.days[0];
  const last = l.days.at(-1);
  // Missed days since the last learning day (not today: there's still time) that freezes held will cover.
  const trailing = last && last < today ? Math.max(0, daysBetween(last, today) - 1) : 0;
  const held = heldFreezes(l);
  const promised = new Set<string>();
  for (let i = 1; i <= trailing && promised.size < held; i++) {
    const d = addDays(today, -i);
    if (!used.has(d)) promised.add(d);
  }
  let dim = 0;
  if (first && first <= today) {
    for (let d = first, n = 0; d <= today && n < 400; d = addDays(d, 1), n++) {
      if (lit.has(d)) dim = Math.max(0, dim - 1);
      else if (d !== today && !used.has(d) && !promised.has(d)) dim++;
    }
  }
  dim = Math.min(dim, total);
  let run = 0;
  const kept = (d: string) => lit.has(d) || used.has(d) || promised.has(d);
  for (let d = lit.has(today) ? today : addDays(today, -1); kept(d) && run < 400; d = addDays(d, -1)) run++;
  const frozen = [...used].filter((d) => d <= today).length + promised.size;
  return {
    total,
    glowing: total - dim,
    dim,
    frozen,
    freezes: held - promised.size,
    tonight: lit.has(today),
    run,
    toFreeze: held >= MAX_FREEZES ? 0 : FREEZE_EVERY - (total % FREEZE_EVERY),
  };
}

export type WindowState = 'lit' | 'dim' | 'frozen';

/** The skyline's windows, at most `cap`: the glowing ones, then the dimmed, then the frozen (covered days glint blue). */
export function windowStates(v: LightsView, cap = KEEP_DAYS): WindowState[] {
  const out: WindowState[] = [];
  const dim = Math.min(v.dim, Math.floor(cap / 3));
  const frozen = Math.min(v.frozen, Math.floor(cap / 6));
  for (let i = 0; i < Math.min(v.glowing, cap - dim - frozen); i++) out.push('lit');
  for (let i = 0; i < dim; i++) out.push('dim');
  for (let i = 0; i < frozen; i++) out.push('frozen');
  return out;
}

/** "Your city lights: 12 windows. 2 dimmed: learn today to relight one." */
export function lightsLine(v: LightsView) {
  const w = (n: number) => `${n} ${n === 1 ? 'window' : 'windows'}`;
  if (!v.total) return 'Learn something today to light your first window.';
  const dim = v.dim ? ` ${w(v.dim)} dimmed: ${v.tonight ? 'each learning day relights one.' : 'learn today to relight one.'}` : v.tonight ? ' Tonight’s window is lit.' : ' Learn today to light tonight’s window.';
  return `${w(v.glowing)} glowing.${dim}`;
}

/**
 * Two copies: every day lit in either, the higher total, and freezes from the higher of each counter (earned, used), so a
 * freeze earned on one surface and one spent on the other both count (v2.16).
 */
export function mergeLights(a: CityLights | undefined, b: CityLights | undefined): CityLights | undefined {
  if (!a || !b) return a ?? b;
  const days = tidy([...a.days, ...b.days]);
  const usedFreezes = tidy([...(a.usedFreezes ?? []), ...(b.usedFreezes ?? [])]);
  const ca = freezeCounters(a);
  const cb = freezeCounters(b);
  const total = Math.max(totalOf(a), totalOf(b), days.length);
  const out = withCounters({ days, total, freezes: 0 }, Math.max(ca.earned, cb.earned), Math.max(ca.used, cb.used));
  if (usedFreezes.length) out.usedFreezes = usedFreezes;
  return out;
}
