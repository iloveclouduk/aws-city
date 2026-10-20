// Build mode: the player decorates their own city with trees, fountains, benches, statues and a sign with the city's
// name (art/tiles/builder_art.py draws them as deco:<kind>). Pure rules, so they're tested without Phaser
// (tests/buildmode.test.ts): what's in the catalogue and what it costs, which tiles may hold a decoration, the caps,
// and placing, moving, removing and undoing. Decorations are kept per Region city in Progress.decor (contract v2.13).
// v2.14: they cost City Coins (Progress.wallet, src/state/wallet.ts), never stars: stars are knowledge, they grow
// buildings and are never spent. Decorations bought with stars before then were given back as coins (migrateWallet).
import type { CityDecor, DecorProp, Progress } from '@/backend/contract';
import { frontRowTiles, type Tile } from '@/world/layout';
import type { CityPlan } from '@/world/plan';
import type { DistrictId } from '@/world/taxonomy';
import { badgeById, earnedBadges } from './badges';
import { dayKey } from './progress';
import { cityRank, RANKS, type Rank } from './rank';
import { charge, coins, refund, spend } from './wallet';
import { COSMETICS, DROP_POOL, type Rarity } from './cosmetics';
import { dropsOf, ownsCosmetic } from './rewards';

/** Caps (the server holds the same: server/src/contract/progress.ts). */
export const MAX_PER_CITY = 120;
export const MAX_TOTAL = 240;
export const MAX_CITIES = 20;
/** Removing a decoration gives back half its price (rounded down). Moving is free. */
export const REFUND = 0.5;
/** Undo steps kept (this session only). */
export const UNDO_DEPTH = 30;
/** v2.16: removed props remembered per city (so a merge never brings one back), the most recent. */
export const GONE_MAX = 200;
/**
 * v2.16 sinks that renew: the first FREE_COPIES of an item in a city cost its price, each copy after that COPY_STEP of
 * the price more than the last (a city full of one thing costs more than a varied one).
 */
export const FREE_COPIES = 5;
export const COPY_STEP = 0.2;
/** …and a busy city costs more to fill: past CROWD_FREE props in a city, every decoration costs CROWD_STEP more per prop. */
export const CROWD_FREE = 40;
export const CROWD_STEP = 0.03;
/** v2.16: a crate item not won yet can be bought in Decorate's Rewards for City Coins (monuments stay earned-only). */
export const MARKET_PRICE: Record<Rarity, number> = { common: 60, rare: 150, epic: 300 };

export type BuildCategory = 'nature' | 'furniture' | 'water' | 'monuments' | 'paving' | 'signs' | 'rewards';
export const CATEGORIES: { id: BuildCategory; name: string; icon: string }[] = [
  { id: 'nature', name: 'Trees and flowers', icon: '🌳' },
  { id: 'furniture', name: 'Street life', icon: '🪑' },
  { id: 'water', name: 'Water', icon: '⛲' },
  { id: 'monuments', name: 'Landmarks and play', icon: '🗿' },
  { id: 'paving', name: 'Paving', icon: '🧱' },
  { id: 'signs', name: 'Signs and banners', icon: '🚩' },
  // v2.15: won from Supply Drops, season roads and Codex sets (src/state/rewards.ts): free to place.
  { id: 'rewards', name: 'Rewards', icon: '🎁' },
];

export interface BuildItem {
  id: string;
  /** Shown in the palette (the sprite itself is in the city). */
  icon: string;
  name: string;
  category: BuildCategory;
  /** Footprint: size×size tiles from the prop's north tile. */
  size: 1 | 2;
  /** City Coins (🪙) it costs (0 = free once unlocked). */
  price: number;
  /** Sprite names (deco:<kind>), stored as the prop's `kind`; R steps through them (turned, or another colour). */
  variants: string[];
  /** What it says when R steps through the variants. */
  variantNoun?: 'way round' | 'colour' | 'style';
  /** Unlocked by a badge (src/state/badges.ts) or this city's rank (src/state/rank.ts). */
  unlock?: { badge?: string; rank?: Rank['id']; cosmetic?: string };
  /** At most this many in a city. */
  max?: number;
}

const DISTRICTS7 = ['compute', 'storage', 'database', 'networking', 'security', 'aiml', 'management'] as const;
const v = (...kinds: string[]) => kinds.map((k) => `deco:${k}`);

export const CATALOGUE: BuildItem[] = [
  { id: 'oak', icon: '🌳', name: 'Oak tree', category: 'nature', size: 1, price: 5, variants: v('oak') },
  { id: 'pine', icon: '🌲', name: 'Pine tree', category: 'nature', size: 1, price: 5, variants: v('pine') },
  { id: 'cherry', icon: '🌸', name: 'Cherry blossom', category: 'nature', size: 1, price: 12, variants: v('cherry') },
  { id: 'palm', icon: '🌴', name: 'Palm tree', category: 'nature', size: 1, price: 12, variants: v('palm') },
  { id: 'flowers', icon: '🌷', name: 'Flower bed', category: 'nature', size: 1, price: 4, variants: v('flowers-warm', 'flowers-cool'), variantNoun: 'colour' },
  { id: 'hedge', icon: '🌿', name: 'Hedge', category: 'nature', size: 1, price: 4, variants: v('hedge', 'hedge-r'), variantNoun: 'way round' },
  { id: 'bench', icon: '🪑', name: 'Bench', category: 'furniture', size: 1, price: 6, variants: v('bench', 'bench-r'), variantNoun: 'way round' },
  { id: 'lamp', icon: '💡', name: 'Street lamp', category: 'furniture', size: 1, price: 8, variants: v('lamp') },
  { id: 'picnic', icon: '🧺', name: 'Picnic table', category: 'furniture', size: 1, price: 8, variants: v('picnic') },
  { id: 'bikerack', icon: '🚲', name: 'Bike rack', category: 'furniture', size: 1, price: 6, variants: v('bikerack', 'bikerack-r'), variantNoun: 'way round' },
  { id: 'busstop', icon: '🚏', name: 'Bus stop', category: 'furniture', size: 1, price: 15, variants: v('busstop', 'busstop-r'), variantNoun: 'way round' },
  { id: 'lights', icon: '✨', name: 'String lights', category: 'furniture', size: 1, price: 15, variants: v('lights', 'lights-r'), variantNoun: 'style' },
  { id: 'kiosk-coffee', icon: '☕', name: 'Coffee kiosk', category: 'furniture', size: 1, price: 25, variants: v('kiosk-coffee') },
  { id: 'kiosk-icecream', icon: '🍦', name: 'Ice cream kiosk', category: 'furniture', size: 1, price: 25, variants: v('kiosk-icecream') },
  { id: 'solartree', icon: '🔆', name: 'Solar tree', category: 'furniture', size: 1, price: 30, variants: v('solartree') },
  { id: 'fountain', icon: '⛲', name: 'Fountain', category: 'water', size: 1, price: 20, variants: v('fountain') },
  { id: 'fountain-district', icon: '⛲', name: 'District fountain', category: 'water', size: 1, price: 30, variants: v(...DISTRICTS7.map((d) => `fountain-${d}`)), variantNoun: 'colour' },
  { id: 'pond', icon: '🦆', name: 'Duck pond', category: 'water', size: 2, price: 50, variants: v('pond') },
  { id: 'fountain-big', icon: '⛲', name: 'Grand fountain', category: 'water', size: 2, price: 80, variants: v('fountain-big'), unlock: { rank: 'town' } },
  { id: 'gazebo', icon: '🏡', name: 'Pergola', category: 'monuments', size: 1, price: 30, variants: v('gazebo') },
  { id: 'obelisk', icon: '🗼', name: 'Obelisk', category: 'monuments', size: 1, price: 40, variants: v('obelisk') },
  { id: 'statue', icon: '🗿', name: 'Statue', category: 'monuments', size: 1, price: 40, variants: v('statue'), unlock: { badge: 'first-crown' } },
  { id: 'sculpture-cube', icon: '🟧', name: 'Cube sculpture', category: 'monuments', size: 1, price: 35, variants: v('sculpture-cube') },
  { id: 'sculpture-sphere', icon: '🪩', name: 'Mirror ball sculpture', category: 'monuments', size: 1, price: 35, variants: v('sculpture-sphere') },
  { id: 'sculpture-cloud', icon: '☁️', name: 'Cloud sculpture', category: 'monuments', size: 1, price: 35, variants: v('sculpture-cloud'), unlock: { badge: 'first-workshop' } },
  { id: 'windmill', icon: '🌬️', name: 'Windmill', category: 'monuments', size: 1, price: 45, variants: v('windmill'), unlock: { badge: 'streak-7' } },
  { id: 'clocktower', icon: '🕰️', name: 'Clock tower', category: 'monuments', size: 1, price: 60, variants: v('clocktower'), unlock: { rank: 'city' } },
  { id: 'playground', icon: '🛝', name: 'Playground', category: 'monuments', size: 2, price: 60, variants: v('playground') },
  { id: 'bandstand', icon: '🎺', name: 'Bandstand', category: 'monuments', size: 2, price: 70, variants: v('bandstand'), unlock: { badge: 'first-quest' } },
  { id: 'plaza', icon: '🧱', name: 'Paving', category: 'paving', size: 1, price: 2, variants: v('plaza') },
  { id: 'plaza-big', icon: '🧭', name: 'Compass paving', category: 'paving', size: 2, price: 6, variants: v('plaza-big') },
  { id: 'citysign', icon: '🪧', name: 'City name sign', category: 'signs', size: 2, price: 25, variants: v('citysign'), max: 1 },
  { id: 'banner', icon: '🚩', name: 'District banner', category: 'signs', size: 1, price: 10, variants: v(...DISTRICTS7.map((d) => `banner-${d}`)), variantNoun: 'colour' },
  // v2.15 City Hall: its higher levels (the Mayor's rank) open grander buildings for the city's own streets.
  { id: 'townhouses', icon: '🏘️', name: 'Town houses', category: 'monuments', size: 2, price: 90, variants: ['sig:rowhouses:white'], unlock: { rank: 'metropolis' } },
  { id: 'market-row', icon: '🏪', name: 'Market row', category: 'monuments', size: 2, price: 110, variants: ['sig:rowhouses:shop'], unlock: { rank: 'megacity' } },
  { id: 'old-town', icon: '🏡', name: 'Old town row', category: 'monuments', size: 2, price: 130, variants: ['sig:rowhouses:timber'], unlock: { rank: 'global' } },
  // v2.15 rewards: every decoration cosmetic, free once won (a monument once a city, the rest twice).
  ...COSMETICS.filter((c) => c.kind === 'decor').map(
    (c): BuildItem => ({
      id: `reward-${c.id}`,
      icon: c.icon,
      name: c.name,
      category: 'rewards',
      size: c.size ?? 1,
      price: 0,
      variants: c.variants!,
      ...(c.variants!.length > 1 ? { variantNoun: 'colour' as const } : {}),
      unlock: { cosmetic: c.id },
      max: c.id.startsWith('mon-') ? 1 : 2,
    }),
  ),
];

const BY_KIND = new Map(CATALOGUE.flatMap((it) => it.variants.map((k) => [k, it] as const)));
export const itemById = (id: string) => CATALOGUE.find((it) => it.id === id);
/** The catalogue item a stored kind (a sprite name) belongs to. */
export const itemOfKind = (kind: string) => BY_KIND.get(kind);
/** The next variant (R): turned the other way, or the next colour. */
export const nextVariant = (kind: string) => {
  const it = itemOfKind(kind);
  if (!it) return kind;
  return it.variants[(it.variants.indexOf(kind) + 1) % it.variants.length];
};

// ── stars and coins ──────────────────────────────────────────────────────────

/** Every star earned (each building's stars, in every city): what the HUD shows. Never spent. */
export const starsEarned = (p: Progress) =>
  [p.landmarks, ...Object.values(p.cities ?? {}).map((c) => c.landmarks)].reduce((n, ls) => n + Object.values(ls).reduce((m, l) => m + l.xp, 0), 0);
/** City Coins the player can spend on decorations now. */
export const coinsToSpend = coins;
/** Removing a decoration gives back half its price in coins. */
export const refundFor = (kind: string) => Math.floor((itemOfKind(kind)?.price ?? 0) * REFUND);

/** Undefined when the item is unlocked in this city, else what unlocks it ("Earn the First Crown badge"). */
export function lockedBecause(p: Progress, region: string, it: BuildItem): string | undefined {
  const u = it.unlock;
  if (!u) return undefined;
  if (u.badge && !earnedBadges(p).includes(u.badge)) {
    const b = badgeById(u.badge);
    return `Earn the ${b?.icon ?? ''} ${b?.name ?? u.badge} badge: ${b?.how ?? ''}`.replace(/\s+/g, ' ').trim();
  }
  if (u.cosmetic && !ownsCosmetic(p, u.cosmetic) && !marketPrice(u.cosmetic)) return 'Win it: a season road or a Service Codex set (My City)';
  if (u.rank) {
    const need = RANKS.findIndex((r) => r.id === u.rank);
    const have = RANKS.indexOf(cityRank(p, region).rank);
    if (have < need) return `Grow this city to ${RANKS[need].icon} ${RANKS[need].name}`;
  }
  return undefined;
}

/** What a crate item costs to buy (0: not for sale, a monument or not a crate item). */
export const marketPrice = (cosmeticId: string) => {
  const c = DROP_POOL.find((x) => x.id === cosmeticId && x.kind === 'decor');
  return c ? MARKET_PRICE[c.rarity] : 0;
};

/** A Rewards item the player hasn't won yet but may buy (its cosmetic id), else undefined. */
export const forSale = (p: Progress, it: BuildItem) => (it.unlock?.cosmetic && !ownsCosmetic(p, it.unlock.cosmetic) && marketPrice(it.unlock.cosmetic) ? it.unlock.cosmetic : undefined);

/** At most this many of `it` in a city: its own cap, plus the spare copies crates gave (src/state/drops.ts). */
export const maxFor = (p: Progress, it: BuildItem) => (it.max === undefined ? undefined : it.max + (it.unlock?.cosmetic ? (dropsOf(p).spares?.[it.unlock.cosmetic] ?? 0) : 0));

/**
 * What one more `it` costs in this city now: its price, raised COPY_STEP a copy past FREE_COPIES and CROWD_STEP a
 * prop past CROWD_FREE in the city, plus (a crate item not won yet) buying it. What Decorate shows on the item.
 */
export function priceFor(p: Progress, region: string, it: BuildItem): { place: number; buy: number; total: number } {
  const props = cityDecor(p, region).props;
  const copies = props.filter((q) => itemOfKind(q.kind) === it).length;
  const crowd = 1 + CROWD_STEP * Math.max(0, props.length + 1 - CROWD_FREE);
  const place = it.price ? Math.round(it.price * (1 + COPY_STEP * Math.max(0, copies + 1 - FREE_COPIES)) * crowd) : 0;
  const sale = forSale(p, it);
  const buy = sale ? marketPrice(sale) : 0;
  return { place, buy, total: place + buy };
}

// ── where a decoration may stand ─────────────────────────────────────────────

/** Why a tile can't hold a decoration. */
export type Why = 'outside' | 'road' | 'water' | 'sidewalk' | 'building' | 'doorstep' | 'locked' | 'entrance' | 'taken' | 'prop';
export const WHY_TEXT: Record<Why, string> = {
  outside: 'Only on your own city: open districts, parks, neighbourhoods and the Town Square’s lawn',
  road: 'Not on a road',
  water: 'Not on the water',
  sidewalk: 'Keep the sidewalks clear for walkers',
  building: 'A building stands here',
  doorstep: 'Keep the space in front of a building clear',
  locked: 'This district isn’t open yet',
  entrance: 'Keep the way into the square clear',
  taken: 'Something already stands here',
  prop: 'Another decoration is here',
};

export interface GroundOpts {
  districtOpen: (d: DistrictId) => boolean;
  /** Tiles the city's own things stand on: trees, homes, infill buildings, street furniture, businesses. */
  taken: (x: number, y: number) => boolean;
}

/** The ground's verdict for one tile, ignoring decorations already placed (canPlace checks those). */
export type Ground = (x: number, y: number) => Why | undefined;

/**
 * A city plan's buildable ground: the free tiles of open districts (their pocket parks included), a real map's parks
 * and neighbourhoods, and the Town Square's lawn ring (not its entrances, fountain, benches or where Kai starts).
 * Never roads, water, sidewalks, buildings, work spots or the row in front of a building.
 */
export function groundFor(plan: CityPlan, opts: GroundOpts): Ground {
  const n = plan.size;
  const k = (x: number, y: number) => y * n + x;
  const doorstep = new Set<number>();
  for (const l of plan.landmarks) {
    doorstep.add(k(l.workSpot.x, l.workSpot.y));
    for (const t of frontRowTiles(l)) doorstep.add(k(t.x, t.y));
    // The row south of the lot too (where decor never goes either: src/game/decor.ts).
    for (let x = l.footprint.x; x < l.footprint.x + l.footprint.w; x++) doorstep.add(k(x, l.footprint.y + l.footprint.h));
  }
  const sq = plan.square;
  const keep = new Set([plan.fountain, plan.spawn, ...plan.benches].map((t) => k(t.x, t.y)));
  const isRoad = (x: number, y: number) => plan.isRoad({ x, y });
  return (x, y) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return 'outside';
    if (isRoad(x, y)) return 'road';
    if (plan.isWater?.(x, y)) return 'water';
    if (plan.isFootprint(x, y)) return 'building';
    if (doorstep.has(k(x, y))) return 'doorstep';
    const plot = plan.plotAt({ x, y });
    if (plot === 'square') {
      const edge = x === sq.x || y === sq.y || x === sq.x + sq.w - 1 || y === sq.y + sq.h - 1;
      if (!edge) return 'outside';
      // The middle of each side is the way in.
      const along = x === sq.x || x === sq.x + sq.w - 1 ? y - sq.y : x - sq.x;
      const len = x === sq.x || x === sq.x + sq.w - 1 ? sq.h : sq.w;
      if (Math.abs(along - (len - 1) / 2) < 2) return 'entrance';
      if (keep.has(k(x, y))) return 'taken';
    } else {
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isRoad(x + dx, y + dy))) return 'sidewalk';
      if (plot === undefined) {
        const g = plan.groundAt?.(x, y);
        if (g !== 'park' && g !== 'hood') return 'outside';
      } else if (plot === 'day1' || plot === 'campus' || plot.startsWith('future')) return 'outside';
      else if (!opts.districtOpen(plot as DistrictId)) return 'locked';
    }
    if (opts.taken(x, y)) return 'taken';
    return undefined;
  };
}

/** The tiles a prop of `kind` covers with its north tile at (x, y). */
export function tilesFor(kind: string, x: number, y: number): Tile[] {
  const s = itemOfKind(kind)?.size ?? 1;
  const out: Tile[] = [];
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) out.push({ x: x + i, y: y + j });
  return out;
}

export const cityDecor = (p: Progress, region: string): CityDecor => p.decor?.[region] ?? { updatedAt: new Date(0).toISOString(), props: [] };
const totalProps = (p: Progress) => Object.values(p.decor ?? {}).reduce((n, c) => n + c.props.length, 0);

/** Why a prop can't stand at (x, y) on this ground among the city's other props (`ignore`: the one being moved). */
export function whyNot(ground: Ground, props: DecorProp[], kind: string, x: number, y: number, ignore?: string): Why | undefined {
  const taken = new Set(props.filter((q) => q.id !== ignore).flatMap((q) => tilesFor(q.kind, q.x, q.y)).map((t) => `${t.x},${t.y}`));
  for (const t of tilesFor(kind, x, y)) {
    const why = ground(t.x, t.y);
    if (why) return why;
    if (taken.has(`${t.x},${t.y}`)) return 'prop';
  }
  return undefined;
}

// ── placing, moving, removing ────────────────────────────────────────────────

/**
 * `coins`: what the step did to the wallet that undo gives back (−price placed, +half back removed, 0 moved). `bought`:
 * a crate item bought to place it (its coins are spent for good: it stays the player's, undo or not).
 */
export type BuildResult = { ok: true; progress: Progress; prop?: DecorProp; coins: number; bought?: { id: string; coins: number } } | { ok: false; why: string };

interface Clock {
  /** ISO time for updatedAt. */
  now?: string;
  /** Local date for the prop's `at`. */
  today?: string;
}

const withCity = (p: Progress, region: string, c: CityDecor): Progress => ({ ...p, decor: { ...p.decor, [region]: { ...c, gone: c.gone ?? [] } }, updatedAt: c.updatedAt > p.updatedAt ? c.updatedAt : p.updatedAt });

/** Removed prop ids, the last GONE_MAX (ids start with their time, so they sort by it). */
const tidyGone = (ids: Iterable<string>) => [...new Set(ids)].sort().slice(-GONE_MAX);

let seq = 0;
/** A fresh prop id (lowercase letters, digits and dashes, as the server checks). */
export const newPropId = () => `d${Date.now().toString(36)}-${(seq++ % 1296).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Why the player can't buy one more `kind` in this city now (caps, coins, unlocks), or undefined. */
export function cantBuy(p: Progress, region: string, kind: string): string | undefined {
  const it = itemOfKind(kind);
  if (!it) return 'That isn’t in the catalogue';
  const locked = lockedBecause(p, region, it);
  if (locked) return locked;
  const c = cityDecor(p, region);
  if (c.props.length >= MAX_PER_CITY) return `This city has all ${MAX_PER_CITY} decorations it can hold: move or remove one`;
  if (totalProps(p) >= MAX_TOTAL) return `You’ve placed all ${MAX_TOTAL} decorations across your cities: remove one somewhere`;
  if (!p.decor?.[region] && Object.keys(p.decor ?? {}).length >= MAX_CITIES) return `You can decorate up to ${MAX_CITIES} cities`;
  const max = maxFor(p, it);
  if (max && c.props.filter((q) => itemOfKind(q.kind) === it).length >= max) return max === 1 ? `One ${it.name.toLowerCase()} per city` : `${max} of these per city`;
  const price = priceFor(p, region, it).total;
  if (coins(p) < price) return `Needs ${price} 🪙 (you have ${coins(p)}). Jobs, games and workshops pay City Coins`;
  return undefined;
}

export function placeProp(p: Progress, region: string, ground: Ground, kind: string, x: number, y: number, clock: Clock & { id?: string } = {}): BuildResult {
  const no = cantBuy(p, region, kind);
  if (no) return { ok: false, why: no };
  const c = cityDecor(p, region);
  const why = whyNot(ground, c.props, kind, x, y);
  if (why) return { ok: false, why: WHY_TEXT[why] };
  const it = itemOfKind(kind)!;
  const price = priceFor(p, region, it);
  const now = clock.now ?? new Date().toISOString();
  let paid = spend(p, price.total, now);
  if (!paid) return { ok: false, why: `Needs ${price.total} 🪙` };
  // A crate item bought here is the player's from now on (drops.bought), in every city.
  const sale = forSale(p, it);
  if (sale) {
    const d = dropsOf(paid);
    paid = { ...paid, drops: { ...d, bought: [...new Set([...(d.bought ?? []), sale])].sort() } };
  }
  const prop: DecorProp = { id: clock.id ?? newPropId(), kind, x, y, at: clock.today ?? dayKey() };
  const next: CityDecor = { updatedAt: now, props: [...c.props, prop], gone: c.gone ?? [] };
  return { ok: true, progress: withCity(paid, region, next), prop, coins: -price.place, ...(sale ? { bought: { id: sale, coins: price.buy } } : {}) };
}

/** Moves a prop (free); turning it to another variant (`kind`) is a move too. */
export function moveProp(p: Progress, region: string, ground: Ground, id: string, x: number, y: number, clock: Clock & { kind?: string } = {}): BuildResult {
  const c = cityDecor(p, region);
  const cur = c.props.find((q) => q.id === id);
  if (!cur) return { ok: false, why: 'That decoration isn’t here any more' };
  const kind = clock.kind && itemOfKind(clock.kind) === itemOfKind(cur.kind) ? clock.kind : cur.kind;
  const why = whyNot(ground, c.props, kind, x, y, id);
  if (why) return { ok: false, why: WHY_TEXT[why] };
  const prop = { ...cur, kind, x, y };
  const next: CityDecor = { ...c, updatedAt: clock.now ?? new Date().toISOString(), props: c.props.map((q) => (q.id === id ? prop : q)) };
  return { ok: true, progress: withCity(p, region, next), prop, coins: 0 };
}

/** Removes a prop and gives back half its price in coins. */
export function removeProp(p: Progress, region: string, id: string, clock: Clock = {}): BuildResult {
  const c = cityDecor(p, region);
  const cur = c.props.find((q) => q.id === id);
  if (!cur) return { ok: false, why: 'That decoration isn’t here any more' };
  const back = refundFor(cur.kind);
  const now = clock.now ?? new Date().toISOString();
  const { spent: _old, ...rest } = c;
  const next: CityDecor = { ...rest, updatedAt: now, props: c.props.filter((q) => q.id !== id), gone: tidyGone([...(c.gone ?? []), id]) };
  return { ok: true, progress: withCity(refund(p, back, now), region, next), prop: cur, coins: back };
}

/** The prop covering a tile (a 2×2's any tile), last placed first. */
export const propAt = (props: DecorProp[], x: number, y: number) =>
  [...props].reverse().find((q) => tilesFor(q.kind, q.x, q.y).some((t) => t.x === x && t.y === y));

// ── undo (this session only) ─────────────────────────────────────────────────

export interface UndoStep {
  region: string;
  /** The city's decorations before the step (undefined: none yet). */
  before?: CityDecor;
  label: string;
  /** What the step did to the wallet (BuildResult.coins): undo gives a price back, or takes a refund back. */
  coins?: number;
  /** v2.16: the prop the step placed, moved or removed (BuildResult.prop): undo touches only it. */
  prop?: DecorProp;
}

/** Pushes a step, keeping the last UNDO_DEPTH. */
export const pushUndo = (stack: UndoStep[], step: UndoStep) => [...stack, step].slice(-UNDO_DEPTH);

/**
 * Undoes one step, prop by prop (v2.16), coins included (undoing a placement gives its price back; undoing a removal
 * takes its refund back): a prop the step added goes (and is remembered gone), a prop it removed comes back (under a
 * new id, since the old one is remembered gone), a prop it moved goes back. Props the other surface added since stay.
 * A new `updatedAt`, so the undo wins on merge like any other change.
 */
export function undoStep(p: Progress, step: UndoStep, now = new Date().toISOString(), newId: () => string = newPropId): Progress {
  const cur = cityDecor(p, step.region);
  const before = new Map((step.before?.props ?? []).map((q) => [q.id, q] as const));
  const after = new Map(cur.props.map((q) => [q.id, q] as const));
  // Only the step's own prop when it says which (props the other surface added or moved since are left alone).
  const mine = (id: string) => !step.prop || step.prop.id === id;
  const added = cur.props.filter((q) => !before.has(q.id) && mine(q.id)).map((q) => q.id);
  const gone = new Set([...(cur.gone ?? []), ...added]);
  const props: DecorProp[] = [];
  for (const q of cur.props) {
    if (added.includes(q.id)) continue;
    const was = before.get(q.id);
    props.push(was && mine(q.id) && (was.x !== q.x || was.y !== q.y || was.kind !== q.kind) ? { ...q, x: was.x, y: was.y, kind: was.kind } : q);
  }
  for (const q of step.before?.props ?? []) if (!after.has(q.id) && mine(q.id)) props.push(gone.has(q.id) ? { ...q, id: newId() } : q);
  const d = step.coins ?? 0;
  const wallet = d < 0 ? refund(p, -d, now) : d > 0 ? charge(p, d, now) : p;
  const at = now > cur.updatedAt ? now : new Date(Date.parse(cur.updatedAt) + 1).toISOString();
  return withCity(wallet, step.region, { updatedAt: at, props, gone: tidyGone(gone) });
}

/**
 * Two copies of a city's decorations (v2.16), prop by prop: every prop in either, unless either remembers it removed
 * (`gone`); a prop in both stands where the newer copy has it. At most MAX_PER_CITY (the newer copy's first). A copy
 * from before v2.16 (no `gone`) can't say what it removed, so then the newer copy wins whole, as it did.
 */
export function mergeDecor(a: CityDecor, b: CityDecor): CityDecor {
  const [newer, older] = b.updatedAt > a.updatedAt ? [b, a] : [a, b];
  if (!a.gone || !b.gone) return newer;
  const gone = tidyGone([...a.gone, ...b.gone]);
  const dead = new Set([...a.gone, ...b.gone]);
  const byId = new Map<string, DecorProp>();
  for (const q of newer.props) if (!dead.has(q.id)) byId.set(q.id, q);
  for (const q of older.props) if (!dead.has(q.id) && !byId.has(q.id)) byId.set(q.id, q);
  const { spent: _old, ...rest } = newer;
  return { ...rest, props: [...byId.values()].slice(0, MAX_PER_CITY), gone };
}

/** "37/120". */
export const counterText = (p: Progress, region: string) => `${cityDecor(p, region).props.length}/${MAX_PER_CITY}`;
