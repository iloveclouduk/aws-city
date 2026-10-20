// City Clients: real kinds of business in every city (an airport hub, a bank, a stadium, a hospital, a shop, a school)
// with Among-Us-style side jobs. Each business has three job levels of four to six tasks; a task is done at a named
// station of its site (Kai walks there, the task opens on arrival) and reuses a part the game already has: the
// architecture board (wire), the practice terminal (run), a choose card, the practice console's Copilot (click), a
// finding-style settings list (fix), Explain it back, or a small station panel (src/learning/stations/).
//
// Content is data (shared/clients.json, checked by tests/clients.test.ts): facts come only from each business's fetched
// sources or cited flashcards. This module is pure: the content, the gating rule, the pay rule and where each
// business stands in a Region's city (no rng(): the same plan and landscape always give the same sites).
import data from '../../shared/clients.json' with { type: 'json' };
import type { Progress } from '@/backend/contract';
import type { TerminalError } from '@/learning/terminal';
import type { StationPanel } from '@/learning/stations/types';
import { landmarkOf } from '@/state/cities';
import { branded } from './brand';
import type { ChoiceOption } from './content';
import { frontRowTiles, type Rect, type Tile } from './layout';
import type { CityPlan } from './plan';

export type ClientTaskType = 'wire' | 'run' | 'choose' | 'click' | 'fix' | 'explain' | 'station';

export interface ClientSource {
  kind: string;
  title: string;
  url: string;
  facts: string[];
}

interface TaskBase {
  id: string;
  title: string;
  /** The place at the business Kai walks to (several tasks can share one). */
  station: string;
  services: string[];
  stars: number;
  why: string;
  /** A fetched source's URL, or `card:<flashcard id>`. */
  basis: string[];
  /** One starter job: open from day one in every city (its buildings go up when it pays). */
  starter?: boolean;
}

export interface WireJob {
  story: string;
  requirements: string[];
  required: string[];
  optional: string[];
  distractors: string[];
  flow: string[];
  why: string;
  simpleWhy: string;
  reference: { title: string; url: string };
}
export interface RunJob {
  body: string;
  cli: string;
  output: string;
  errors?: TerminalError[];
  verify: { manual: true };
}
export interface ChooseJob {
  question: string;
  options: ChoiceOption[];
}
export interface ClickJob {
  /** The practice console's Copilot flow (a service id). */
  flow: string;
  goal: string;
}
export interface FixSetting {
  id: string;
  label: string;
  /** What it's set to now. */
  now: string;
  /** True: this one should change. False: it's already right (leave it). */
  switchIt: boolean;
  why: string;
  /** The shared/wa-rules.json rule it matches, when one does. */
  rule?: string;
}
export interface FixJob {
  settings: FixSetting[];
}
export interface ExplainJob {
  question: string;
  keywords: string[];
  minWords: number;
}

export type ClientTask =
  | (TaskBase & { type: 'wire'; wire: WireJob })
  | (TaskBase & { type: 'run'; run: RunJob })
  | (TaskBase & { type: 'choose'; choose: ChooseJob })
  | (TaskBase & { type: 'click'; click: ClickJob })
  | (TaskBase & { type: 'fix'; fix: FixJob })
  | (TaskBase & { type: 'explain'; explain: ExplainJob })
  | (TaskBase & { type: 'station'; panel: StationPanel });

export interface ClientLevel {
  level: number;
  title: string;
  goal: string;
  bonusStars: number;
  celebrate: string;
  tasks: ClientTask[];
}

export interface Business {
  id: string;
  name: string;
  /** With the brand switched off (shared/brand.json), this name shows instead. */
  nameUnbranded?: string;
  brand?: string;
  domain: string;
  /** The atlas sprite stem: `client:<id>:<level 0..3>` (+ `@lights`). */
  art: string;
  story: string;
  simple: string;
  sources: ClientSource[];
  /** What each level looks like (the art brief). */
  growth: { level: number; look: string }[];
  levels: ClientLevel[];
}

export const CLIENTS = (data as unknown as { businesses: Business[] }).businesses;
/** Levels a business has (each grows its site once). */
export const MAX_CLIENT_LEVEL = 3;

export const clientById = (id: string) => CLIENTS.find((b) => b.id === id);
/** The business's name as players read it (branded only while the brand is on). */
export const clientName = (b: Business) => branded(b);

export interface TaskRef {
  client: Business;
  level: ClientLevel;
  task: ClientTask;
}
const TASKS = new Map<string, TaskRef>(CLIENTS.flatMap((client) => client.levels.flatMap((level) => level.tasks.map((task) => [task.id, { client, level, task }] as const))));
export const taskById = (id: string) => TASKS.get(id);
export const ALL_TASKS: TaskRef[] = [...TASKS.values()];

/** The emoji each runner shows in the task list. */
export const TASK_ICON: Record<ClientTaskType, string> = { wire: '🧩', run: '⌨️', choose: '🤔', click: '🖱️', fix: '🔧', explain: '✍️', station: '⚡' };
export const TASK_VERB: Record<ClientTaskType, string> = { wire: 'Wire it', run: 'Run it', choose: 'Choose it', click: 'Click it', fix: 'Fix it', explain: 'Explain it', station: 'Station' };

// ── Progress (contract v2.13 Progress.clients) ────────────────────────────────

export type ClientProgress = NonNullable<Progress['clients']>[string];
export const clientProgress = (p: Progress, id: string): ClientProgress => p.clients?.[id] ?? { level: 0, done: [] };

/** The level being worked on now (1..3), or undefined once all three are finished. */
export function currentLevel(p: Progress, b: Business): ClientLevel | undefined {
  const done = clientProgress(p, b.id).level;
  return b.levels.find((l) => l.level === done + 1);
}

/** "3 of 5": the current level's tasks done. */
export function levelCount(p: Progress, b: Business, lv = currentLevel(p, b)) {
  const done = new Set(clientProgress(p, b.id).done);
  return { done: lv ? lv.tasks.filter((t) => done.has(t.id)).length : 0, of: lv?.tasks.length ?? 0 };
}

export const taskDone = (p: Progress, taskId: string) => !!taskById(taskId) && (p.clients?.[taskById(taskId)!.client.id]?.done ?? []).includes(taskId);

/**
 * The services a task needs that aren't put up in this city yet (the task says "Put up <X> first"). A starter job needs
 * none: one station is open from day one in every city, and doing it puts its buildings up (addXp discovers them).
 */
export const missingFor = (p: Progress, task: Pick<ClientTask, 'services'> & { starter?: boolean }, region?: string) =>
  task.starter ? [] : task.services.filter((s) => !landmarkOf(p, s, region)?.discovered);

/** The starter jobs (one station, open from day one). */
export const STARTER_TASKS = ALL_TASKS.filter((r) => r.task.starter);

/** A task the player can do now: its level is the current one, it isn't done, and its services are put up here. */
export function taskOpen(p: Progress, taskId: string, region?: string) {
  const ref = taskById(taskId);
  if (!ref || taskDone(p, taskId)) return false;
  return currentLevel(p, ref.client)?.level === ref.level.level && missingFor(p, ref.task, region).length === 0;
}

/**
 * Stars a task pays each of its services: split evenly (like a puzzle's), at least one each. Paid once ever: the task's
 * id goes into Progress.clients and a task already there pays nothing.
 */
export function taskPay(task: Pick<ClientTask, 'services' | 'stars'>): Record<string, number> {
  const each = Math.max(1, Math.round(task.stars / task.services.length));
  return Object.fromEntries(task.services.map((s) => [s, each]));
}

/** A level's bonus, split over every service its tasks used (at least one each). */
export function levelPay(lv: ClientLevel): Record<string, number> {
  const services = [...new Set(lv.tasks.flatMap((t) => t.services))];
  const each = Math.max(1, Math.round(lv.bonusStars / services.length));
  return Object.fromEntries(services.map((s) => [s, each]));
}

export interface TaskOutcome {
  /** The new Progress.clients entry (the same object when nothing changed). */
  next: ClientProgress;
  /** Stars by service for the task (empty when it was already done). */
  pay: Record<string, number>;
  /** The level this task finished, with its bonus. */
  levelUp?: { level: ClientLevel; pay: Record<string, number> };
}

/**
 * A task done: its id is recorded (once ever), and when it was the current level's last one the level is finished
 * (dated `today`) and its bonus paid. A task of a later level, or one already done, changes nothing.
 */
export function completeTask(p: Progress, taskId: string, today: string): TaskOutcome {
  const ref = taskById(taskId);
  const prev = ref ? clientProgress(p, ref.client.id) : { level: 0, done: [] };
  if (!ref || prev.done.includes(taskId) || currentLevel(p, ref.client)?.level !== ref.level.level) return { next: prev, pay: {} };
  const done = [...prev.done, taskId];
  const finished = ref.level.tasks.every((t) => done.includes(t.id));
  const next: ClientProgress = finished
    ? { ...prev, done, level: ref.level.level, at: { ...prev.at, [String(ref.level.level)]: today } }
    : { ...prev, done };
  return { next, pay: taskPay(ref.task), ...(finished ? { levelUp: { level: ref.level, pay: levelPay(ref.level) } } : {}) };
}

/** Two copies of one business's progress merge in src/state/progress.ts (mergeClient). */
export { mergeClient } from '@/state/progress';

// ── Where the businesses stand ────────────────────────────────────────────────

/** A business's lot, in tiles (the airport hub uses the airport's own site). */
export const CLIENT_LOT = 4;

export interface ClientSite {
  clientId: string;
  rect: Rect;
  /** The airport's site, a neighbourhood block inside the core (walkable round it), or open land on the ring. */
  where: 'airport' | 'hood' | 'ring';
  /** Each station's tile, by station name. Inside the core it's a walkable tile beside the lot. */
  stations: Record<string, Tile>;
}

/** Station names in the order the business's tasks first use them. */
export const stationsOf = (b: Business) => [...new Set(b.levels.flatMap((l) => l.tasks.map((t) => t.station)))];

/** The businesses that need a lot of their own (every one but the airport hub, which stands on the airport). */
export const LOT_CLIENTS = CLIENTS.filter((b) => b.id !== 'airport').map((b) => b.id);

const key = (x: number, y: number) => `${x},${y}`;

/** Wave 1 is the first six businesses in shared/clients.json (the airport hub to the school); the rest are wave 2. */
export const WAVE1 = 6;
export const waveOf = (clientId: string) => (CLIENTS.findIndex((b) => b.id === clientId) < WAVE1 ? 1 : 2);

/**
 * The lot each business stands on: the bank and the shop are drawn on 3×3 (art/tiles/clients_art.py), the rest on the
 * full 4×4 lot.
 */
export const CLIENT_FOOT: Record<string, number> = { bank: 3, shop: 3 };
export const lotSizeOf = (clientId: string) => CLIENT_FOOT[clientId] ?? CLIENT_LOT;

/**
 * Lots inside a real map's core (a business with no room inside goes to the ring), nearest the Town Square first, a street's sidewalk beside each, a tile apart. Neighbourhood blocks (ground
 * no district took) come first; a real downtown is often all districts, so then the quiet back of a district block:
 * never a landmark's lot, the tile round it, its front row or work spot, a pocket-park lot, the Town Square, the campus,
 * the Day 1 Quarter, water, a road or a sidewalk. The legacy city has no neighbourhoods: none.
 */
const lotMemo = new WeakMap<CityPlan, Map<string, Rect>>();
const hoodLotMap = (plan: CityPlan) => {
  let lots = lotMemo.get(plan);
  if (!lots) lotMemo.set(plan, (lots = findHoodLots(plan)));
  return lots;
};
/** The lots inside the core, in LOT_CLIENTS order (a business with no room inside is left out: it goes to the ring). */
export const hoodLots = (plan: CityPlan): Rect[] => LOT_CLIENTS.flatMap((id) => hoodLotMap(plan).get(id) ?? []);
/** A business's lot inside the core, if it has one. */
export const hoodLotOf = (plan: CityPlan, clientId: string): Rect | undefined => hoodLotMap(plan).get(clientId);

const DISTRICT_PLOTS = new Set(['square', 'campus', 'day1']);

function findHoodLots(plan: CityPlan): Map<string, Rect> {
  const out = new Map<string, Rect>();
  if (!plan.groundAt) return out;
  const N = plan.size;
  const road = (x: number, y: number) => plan.isRoad({ x, y });
  const sidewalk = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && !road(x, y) && !plan.isWater?.(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => road(x + dx, y + dy));
  // A landmark's lot with a tile round it, its front row and work spot, and the pocket parks' lots stay clear.
  const keep = new Set<string>();
  for (const l of plan.landmarks) {
    const f = l.footprint;
    for (let y = f.y - 1; y <= f.y + f.h; y++) for (let x = f.x - 1; x <= f.x + f.w; x++) keep.add(key(x, y));
    for (const t of frontRowTiles(l)) keep.add(key(t.x, t.y));
    keep.add(key(l.workSpot.x, l.workSpot.y));
  }
  for (const d of Object.keys(plan.districts)) for (const r of plan.openLots(d)) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) keep.add(key(x, y));
  const base = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && !road(x, y) && !plan.isWater?.(x, y) && !sidewalk(x, y) && !plan.isFootprint(x, y);
  const hood = (x: number, y: number) => base(x, y) && plan.plotAt({ x, y }) === undefined && plan.groundAt!(x, y) === 'hood';
  const district = (x: number, y: number) => {
    const plot = plan.plotAt({ x, y });
    return base(x, y) && !!plot && !DISTRICT_PLOTS.has(plot) && !plot.startsWith('future') && !keep.has(key(x, y));
  };
  const c = { x: plan.square.x + plan.square.w / 2, y: plan.square.y + plan.square.h / 2 };
  const candidates = (n: number, ok: (x: number, y: number) => boolean) => {
    const cands: { r: Rect; d: number }[] = [];
    for (let y = 0; y + n <= N; y++)
      for (let x = 0; x + n <= N; x++) {
        let fits = true;
        for (let j = 0; j < n && fits; j++) for (let i = 0; i < n && fits; i++) fits = ok(x + i, y + j);
        if (!fits) continue;
        // A walkable way in: a sidewalk on the ring round the lot (its front, ideally).
        let walk = false;
        for (let i = -1; i <= n && !walk; i++) walk = sidewalk(x + i, y + n) || sidewalk(x + n, y + i) || sidewalk(x + i, y - 1) || sidewalk(x - 1, y + i);
        if (walk) cands.push({ r: { x, y, w: n, h: n }, d: Math.hypot(x + n / 2 - c.x, y + n / 2 - c.y) });
      }
    return cands.sort((a, b) => a.d - b.d || a.r.y - b.r.y || a.r.x - b.r.x).map((x) => x.r);
  };
  const pools = new Map<number, Rect[][]>();
  const poolsFor = (n: number) => {
    let p = pools.get(n);
    if (!p) pools.set(n, (p = [candidates(n, hood), candidates(n, district)]));
    return p;
  };
  const apart = (a: Rect, b: Rect) => a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y;
  // Wave 1 chooses first (the city's first businesses always stand downtown when there's room), then wave 2; within a
  // wave the big lots choose first (a small one fits in gaps a big one can't), then LOT_CLIENTS order. A business that
  // finds no room inside is left for the ring, and the rest still try.
  const order = [...LOT_CLIENTS].sort((a, b) => waveOf(a) - waveOf(b) || lotSizeOf(b) - lotSizeOf(a) || LOT_CLIENTS.indexOf(a) - LOT_CLIENTS.indexOf(b));
  for (const id of order) {
    const found = poolsFor(lotSizeOf(id))
      .flat()
      .find((r) => [...out.values()].every((o) => apart(o, r)));
    if (found) out.set(id, found);
  }
  return out;
}

/** How many businesses need a lot on the landscape ring (terrain.ts reserves them after every other site). */
export const ringLotsNeeded = (plan: CityPlan) => Math.max(0, LOT_CLIENTS.length - hoodLotMap(plan).size);

/**
 * A station's tile for each station name, spread round the lot. Inside the core: walkable tiles on the ring round the
 * lot (front row first, then the sides and back), never on water. On the ring or the
 * airport (no walking out there): tiles along the site's front row.
 */
function stationTiles(names: string[], r: Rect, walkable: boolean, wet: (x: number, y: number) => boolean = () => false): Record<string, Tile> {
  let ring: Tile[] = [];
  if (walkable) {
    for (let i = 0; i < r.w; i++) ring.push({ x: r.x + i, y: r.y + r.h });
    for (let j = r.h - 1; j >= 0; j--) ring.push({ x: r.x + r.w, y: r.y + j });
    for (let j = 0; j < r.h; j++) ring.push({ x: r.x - 1, y: r.y + j });
    for (let i = 0; i < r.w; i++) ring.push({ x: r.x + i, y: r.y - 1 });
    // Never in the water (a lot can stand on the shore).
    const dry = ring.filter((t) => !wet(t.x, t.y));
    if (dry.length) ring = dry;
  } else for (let i = 0; i < r.w; i++) ring.push({ x: r.x + i, y: r.y + r.h - 1 });
  const out: Record<string, Tile> = {};
  names.forEach((n, i) => {
    const at = ring[Math.min(ring.length - 1, Math.floor((i * ring.length) / Math.max(names.length, 1)))];
    out[n] = { ...at };
  });
  return out;
}

/**
 * Every business's site in a Region's city: the airport hub on the airport (when the landscape has one), the others on
 * neighbourhood lots inside the core (a real map), then on the lots the landscape reserved on the ring (`ringLots`,
 * terrain.ts `clientLots`). A business with nowhere to stand has no site (its tasks open at once from the panel).
 */
export function clientSites(plan: CityPlan, land: { airport?: Rect; clientLots?: Rect[] } = {}): ClientSite[] {
  const out: ClientSite[] = [];
  for (const b of CLIENTS)
    if (b.id === 'airport' && land.airport) out.push({ clientId: b.id, rect: land.airport, where: 'airport', stations: stationTiles(stationsOf(b), land.airport, false) });
  const ring = [...(land.clientLots ?? [])];
  LOT_CLIENTS.forEach((id) => {
    const b = clientById(id)!;
    const inside = hoodLotOf(plan, id);
    // A ring lot is reserved 4×4; a smaller business stands on its north corner (the art's own size).
    const reserved = inside ? undefined : ring.shift();
    const r = inside ?? (reserved && { ...reserved, w: lotSizeOf(id), h: lotSizeOf(id) });
    if (!r) return;
    const where = inside ? 'hood' : 'ring';
    out.push({ clientId: id, rect: r, where, stations: stationTiles(stationsOf(b), r, where === 'hood', (x, y) => plan.isWater?.(x, y) ?? false) });
  });
  return out;
}

/** The tiles a business's lot covers (infill and decor leave them; walkers go round). */
export const siteTiles = (r: Rect) => {
  const out = new Set<string>();
  for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) out.add(key(i, j));
  return out;
};

/** The sprite a business shows at a level (0 = the empty lot, 1..3 as it grows). */
export const clientSprite = (b: Pick<Business, 'art'>, level: number) => `${b.art}:${Math.max(0, Math.min(MAX_CLIENT_LEVEL, level))}`;
