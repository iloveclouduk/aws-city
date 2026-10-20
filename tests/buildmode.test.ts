import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CityDecor, Progress } from '@/backend/contract';
import {
  CATALOGUE,
  cantBuy,
  cityDecor,
  counterText,
  groundFor,
  itemById,
  itemOfKind,
  lockedBecause,
  MAX_CITIES,
  MAX_PER_CITY,
  MAX_TOTAL,
  moveProp,
  nextVariant,
  placeProp,
  propAt,
  pushUndo,
  refundFor,
  removeProp,
  coinsToSpend,
  COPY_STEP,
  FREE_COPIES,
  MARKET_PRICE,
  mergeDecor,
  priceFor,
  starsEarned,
  tilesFor,
  UNDO_DEPTH,
  undoStep,
  whyNot,
  type Ground,
} from '@/state/buildmode';
import { mergeProgress } from '@/state/progress';
import { frontRowTiles } from '@/world/layout';
import { cityPlanFor, legacyPlan } from '@/world/plan';
import { decorPlan, tilesOf } from '@/game/decor';
import { mappedRegions } from '@/world/citymap';

// Build mode: the player's own decorations (src/state/buildmode.ts).
const atlas = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/sprites.json'), 'utf8')) as { sprites: Record<string, { w: number }> };
const R = 'us-west-2';
const T0 = '2026-10-19T10:00:00.000Z';
const at = (s: number) => new Date(Date.parse(T0) + s * 1000).toISOString();
/** `coins` City Coins to spend (v2.14: decorations cost coins) and 5,000 stars, which are never spent. */
const rich = (coins = 5000): Progress => ({ version: 2, landmarks: { s3: { discovered: true, xp: 5000 } }, wallet: { earned: coins, spent: 0 }, updatedAt: T0 }) as Progress;
const plan = legacyPlan();
const openGround = groundFor(plan, { districtOpen: () => true, taken: () => false });
/** Every tile a 1×1 decoration may stand on in the classic city with every district open. */
const legal = (g: Ground = openGround) => {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < plan.size; y++) for (let x = 0; x < plan.size; x++) if (!g(x, y)) out.push({ x, y });
  return out;
};
const place = (p: Progress, kind: string, t: { x: number; y: number }, s = 0, region = R) => {
  const r = placeProp(p, region, openGround, kind, t.x, t.y, { now: at(s), today: '2026-10-19', id: `d${s}-${t.x}-${t.y}` });
  if (!r.ok) throw new Error(r.why);
  return r.progress;
};

describe('the catalogue', () => {
  it('has about forty decorations, each drawn (deco:<kind> in the atlas) and every drawn one offered', () => {
    const kinds = CATALOGUE.flatMap((it) => it.variants);
    expect(kinds.length).toBeGreaterThanOrEqual(40);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const k of kinds) expect(atlas.sprites[k], k).toBeDefined();
    const drawn = Object.keys(atlas.sprites).filter((n) => n.startsWith('deco:') && !n.includes('@'));
    expect(drawn.sort()).toEqual(kinds.filter((k) => k.startsWith('deco:')).sort());
  });

  it('sizes match the art: a 2×2 prop is drawn on a 2×2 canvas (16 × (w + h) + 4 px wide)', () => {
    for (const it of CATALOGUE) for (const k of it.variants) if (k.startsWith('deco:')) expect(atlas.sprites[k].w, k).toBe(16 * 2 * it.size + 4);
  });

  it('v2.15 rewards (src/state/cosmetics.ts) are free once won, their art fits their footprint, and a monument stands once a city', () => {
    const rewards = CATALOGUE.filter((it) => it.category === 'rewards');
    expect(rewards.length).toBeGreaterThan(20);
    for (const it of rewards) {
      expect(it.price, it.id).toBe(0);
      expect(it.unlock?.cosmetic, it.id).toBeTruthy();
      // Season and park art is drawn on its own canvas (a pixel or two either way), never wider than a tile more.
      for (const k of it.variants) expect(atlas.sprites[k].w, k).toBeLessThanOrEqual(16 * 2 * it.size + 4 + 32);
      expect(it.max, it.id).toBe(it.id.startsWith('reward-mon-') ? 1 : 2);
    }
  });

  it('kinds fit the server’s kind pattern, and R steps through an item’s variants and back', () => {
    for (const it of CATALOGUE) {
      for (const k of it.variants) expect(k).toMatch(/^[a-z0-9][a-z0-9:-]{0,39}$/);
      let k = it.variants[0];
      for (let i = 0; i < it.variants.length; i++) k = nextVariant(k);
      expect(k).toBe(it.variants[0]);
    }
    expect(nextVariant('deco:bench')).toBe('deco:bench-r');
    expect(itemOfKind('deco:fountain-aiml')?.id).toBe('fountain-district');
  });
});

describe('where a decoration may stand', () => {
  it('never on roads, water, sidewalks, buildings, work spots or the row in front of a building', () => {
    const ok = legal();
    expect(ok.length).toBeGreaterThan(200);
    for (const t of ok) {
      expect(plan.isRoad(t)).toBe(false);
      expect(plan.isFootprint(t.x, t.y)).toBe(false);
      // Off the square's lawn ring, nothing beside a road (that's the sidewalk).
      if (plan.plotAt(t) !== 'square') expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => plan.isRoad({ x: t.x + dx, y: t.y + dy }))).toBe(false);
    }
    const keys = new Set(ok.map((t) => `${t.x},${t.y}`));
    for (const l of plan.landmarks) {
      expect(keys.has(`${l.workSpot.x},${l.workSpot.y}`), l.id).toBe(false);
      for (const t of frontRowTiles(l)) expect(keys.has(`${t.x},${t.y}`), l.id).toBe(false);
    }
    const road = plan.streets[0];
    expect(openGround(road.axis === 'x' ? road.from + 1 : road.at, road.axis === 'x' ? road.at : road.from + 1)).toBe('road');
    expect(openGround(-1, 3)).toBe('outside');
  });

  it('only in open districts; on the Town Square only its lawn ring, never its ways in or the fountain', () => {
    const shut = groundFor(plan, { districtOpen: () => false, taken: () => false });
    const sq = plan.square;
    for (const t of legal(shut)) {
      expect(plan.plotAt(t)).toBe('square');
      expect(t.x === sq.x || t.y === sq.y || t.x === sq.x + sq.w - 1 || t.y === sq.y + sq.h - 1).toBe(true);
    }
    expect(legal(shut).length).toBeGreaterThan(8);
    expect(shut(sq.x + Math.floor(sq.w / 2), sq.y)).toBe('entrance');
    expect(shut(sq.x + 4, sq.y + 4)).not.toBeUndefined();
    const d = plan.districts.compute!.bbox;
    const inside = legal().find((t) => plan.plotAt(t) === 'compute')!;
    expect(inside).toBeDefined();
    expect(shut(inside.x, inside.y)).toBe('locked');
    expect(d.w).toBeGreaterThan(0);
  });

  it('not where the city’s own things stand, and a 2×2 needs all four tiles', () => {
    const t = legal()[0];
    const taken = groundFor(plan, { districtOpen: () => true, taken: (x, y) => x === t.x && y === t.y });
    expect(taken(t.x, t.y)).toBe('taken');
    // A 2×2 whose far corner is on a sidewalk is refused, though its north tile is fine.
    const edge = legal().find((q) => !!openGround(q.x + 1, q.y + 1))!;
    expect(whyNot(openGround, [], 'deco:pond', edge.x, edge.y)).toBeDefined();
    const room = legal().find((q) => tilesFor('deco:pond', q.x, q.y).every((c) => !openGround(c.x, c.y)))!;
    expect(whyNot(openGround, [], 'deco:pond', room.x, room.y)).toBeUndefined();
  });

  it('every real map offers room to build once its districts open (pocket parks, parks, leftover grass)', () => {
    for (const region of mappedRegions().slice(0, 3)) {
      const real = cityPlanFor(region);
      const g = groundFor(real, { districtOpen: () => true, taken: () => false });
      let n = 0;
      for (let y = 0; y < real.size; y++) for (let x = 0; x < real.size; x++) if (!g(x, y)) n++;
      expect(n, region).toBeGreaterThan(20);
    }
  });

  it('decor (trees, homes, pocket parks) leaves the tiles decorations stand on', () => {
    const base = decorPlan({ landmarks: plan.landmarks, isSidewalk: () => false, districtOpen: () => true, tierOf: () => 2 });
    const tree = base.find((d) => d.sprite.startsWith('tree') || d.sprite.startsWith('house'))!;
    const built = (x: number, y: number) => x === tree.x && y === tree.y;
    const after = decorPlan({ landmarks: plan.landmarks, isSidewalk: () => false, districtOpen: () => true, tierOf: () => 2, built });
    expect(after.some((d) => tilesOf(d).some((t) => built(t.x, t.y)))).toBe(false);
  });
});

describe('placing, moving, removing and undoing', () => {
  const [a, b] = legal().filter((t, i, all) => i === 0 || Math.abs(t.x - all[0].x) + Math.abs(t.y - all[0].y) > 3);

  it('placing costs its price in coins, moving is free, removing gives half back', () => {
    let p = rich(100);
    expect(starsEarned(p)).toBe(5000);
    p = place(p, 'deco:cherry', a);
    expect(coinsToSpend(p)).toBe(88);
    expect(p.wallet).toEqual({ earned: 100, spent: 12 });
    expect(cityDecor(p, R).props).toEqual([{ id: `d0-${a.x}-${a.y}`, kind: 'deco:cherry', x: a.x, y: a.y, at: '2026-10-19' }]);
    expect(counterText(p, R)).toBe(`1/${MAX_PER_CITY}`);
    const m = moveProp(p, R, openGround, `d0-${a.x}-${a.y}`, b.x, b.y, { now: at(1) });
    expect(m.ok && coinsToSpend(m.progress)).toBe(88);
    expect(m.ok && propAt(cityDecor(m.progress, R).props, b.x, b.y)?.kind).toBe('deco:cherry');
    const r = removeProp(m.ok ? m.progress : p, R, `d0-${a.x}-${a.y}`, { now: at(2) });
    expect(r.ok && r.coins).toBe(refundFor('deco:cherry'));
    expect(r.ok && coinsToSpend(r.progress)).toBe(94);
    // A refund adds to `earned`: both counters only go up, so a merge never loses a spend.
    expect(r.ok && r.progress.wallet).toEqual({ earned: 106, spent: 12 });
    expect(r.ok && cityDecor(r.progress, R).props).toEqual([]);
    // Stars earned (the buildings' levels) never change.
    expect(r.ok && starsEarned(r.progress)).toBe(5000);
  });

  it('refuses without the coins (stars never buy), a locked item, a second city sign, an illegal tile or an occupied one', () => {
    expect(placeProp(rich(3), R, openGround, 'deco:oak', a.x, a.y)).toMatchObject({ ok: false, why: expect.stringContaining('Needs 5 🪙') });
    expect(lockedBecause(rich(), R, itemById('statue')!)).toContain('First Crown');
    expect(placeProp(rich(), R, openGround, 'deco:statue', a.x, a.y).ok).toBe(false);
    expect(lockedBecause(rich(), R, itemById('clocktower')!)).toContain('City');
    const sign = legal().find((q) => tilesFor('deco:citysign', q.x, q.y).every((c) => !openGround(c.x, c.y)))!;
    const p = place(rich(), 'deco:citysign', sign);
    expect(cantBuy(p, R, 'deco:citysign')).toBe('One city name sign per city');
    expect(placeProp(p, R, openGround, 'deco:oak', sign.x + 1, sign.y + 1)).toMatchObject({ ok: false, why: 'Another decoration is here' });
    expect(placeProp(p, R, openGround, 'deco:oak', plan.landmarks[0].workSpot.x, plan.landmarks[0].workSpot.y).ok).toBe(false);
    expect(moveProp(p, R, openGround, 'nope', a.x, a.y).ok).toBe(false);
  });

  it('a 2×2 may move one tile over its own old footprint, and turning is a move', () => {
    const room = legal().find((q) => [0, 1].every((d) => tilesFor('deco:pond', q.x + d, q.y).every((c) => !openGround(c.x, c.y))))!;
    const p = place(rich(), 'deco:pond', room);
    expect(moveProp(p, R, openGround, `d0-${room.x}-${room.y}`, room.x + 1, room.y).ok).toBe(true);
    const q = place(rich(), 'deco:bench', a);
    const t = moveProp(q, R, openGround, `d0-${a.x}-${a.y}`, a.x, a.y, { kind: 'deco:bench-r' });
    expect(t.ok && cityDecor(t.progress, R).props[0].kind).toBe('deco:bench-r');
    // Not into another item's kind.
    const u = moveProp(q, R, openGround, `d0-${a.x}-${a.y}`, a.x, a.y, { kind: 'deco:statue' });
    expect(u.ok && cityDecor(u.progress, R).props[0].kind).toBe('deco:bench');
  });

  it('caps: 120 a city, 240 in all, 20 cities', () => {
    const props = Array.from({ length: MAX_PER_CITY }, (_, i) => ({ id: `d${i}`, kind: 'deco:plaza', x: i % 40, y: Math.floor(i / 40), at: '2026-10-19' }));
    const full: CityDecor = { updatedAt: T0, props };
    expect(cantBuy({ ...rich(), decor: { [R]: full } }, R, 'deco:oak')).toContain(`all ${MAX_PER_CITY}`);
    expect(cantBuy({ ...rich(), decor: { [R]: full, 'us-east-1': full } }, 'eu-west-1', 'deco:oak')).toContain(`all ${MAX_TOTAL}`);
    const many = Object.fromEntries(Array.from({ length: MAX_CITIES }, (_, i) => [`xx-test-${i}`, { updatedAt: T0, props: [] }]));
    expect(cantBuy({ ...rich(), decor: many }, R, 'deco:oak')).toContain(`${MAX_CITIES} cities`);
    expect(cantBuy({ ...rich(), decor: many }, 'xx-test-3', 'deco:oak')).toBeUndefined();
  });

  it('undo puts the city back as it was, coins included, and wins on merge', () => {
    let p = rich(100);
    const before = p.decor?.[R];
    p = place(p, 'deco:fountain', a, 1);
    let stack = pushUndo([], { region: R, before, label: 'Built', coins: -20 });
    const r = removeProp(p, R, `d1-${a.x}-${a.y}`, { now: at(2) });
    expect(r.ok).toBe(true);
    stack = pushUndo(stack, { region: R, before: p.decor?.[R], label: 'Removed', coins: r.ok ? r.coins : 0 });
    let q = r.ok ? r.progress : p;
    expect(coinsToSpend(q)).toBe(90);
    q = undoStep(q, stack[1], at(3));
    expect(cityDecor(q, R).props).toHaveLength(1);
    expect(coinsToSpend(q)).toBe(80);
    q = undoStep(q, stack[0], at(4));
    expect(cityDecor(q, R).props).toHaveLength(0);
    expect(coinsToSpend(q)).toBe(100);
    // The undone copy is newer, so the other surface's copy (with the fountain) loses.
    expect(cityDecor(mergeProgress(p, q), R).props).toHaveLength(0);
    expect(pushUndo(Array.from({ length: UNDO_DEPTH }, () => stack[0]), stack[1])).toHaveLength(UNDO_DEPTH);
  });

  it('merge keeps the newer copy of each city, and the higher of each coin counter', () => {
    const p = place(rich(), 'deco:oak', a, 1);
    const elsewhere = place(rich(), 'deco:palm', b, 5, 'eu-west-1');
    const moved = moveProp(p, R, openGround, `d1-${a.x}-${a.y}`, b.x, b.y, { now: at(9) });
    const m = mergeProgress(elsewhere, moved.ok ? moved.progress : p);
    expect(cityDecor(m, R).props[0]).toMatchObject({ x: b.x, y: b.y });
    expect(cityDecor(m, 'eu-west-1').props[0].kind).toBe('deco:palm');
    // Both copies started from 5,000 coins; the higher spend counts (src/state/wallet.ts: counters only go up).
    expect(coinsToSpend(m)).toBe(5000 - 12);
  });
});

describe('v2.16: sinks that renew, and merges and undo prop by prop', () => {
  const spots = legal();
  it('the first FREE_COPIES of an item in a city cost its price, each copy after that COPY_STEP more', () => {
    const oak = itemById('oak')!;
    let p = rich();
    const paid: number[] = [];
    for (let i = 0; i < FREE_COPIES + 3; i++) {
      paid.push(priceFor(p, R, oak).total);
      p = place(p, 'deco:oak', spots[i]!, i);
    }
    expect(paid).toEqual([...Array(FREE_COPIES).fill(oak.price), ...[1, 2, 3].map((k) => Math.round(oak.price * (1 + COPY_STEP * k)))]);
    expect(coinsToSpend(p)).toBe(5000 - paid.reduce((a, b) => a + b, 0));
    // Another city starts again at the price.
    expect(priceFor(p, 'eu-west-1', oak).total).toBe(oak.price);
  });

  it('a crate item not won yet is bought by placing it, for good: undo gives back nothing of the purchase', () => {
    const snow = itemById('reward-snowman')!;
    const p = rich(100);
    expect(cantBuy(rich(10), R, 'season:winter:snowman')).toMatch(/Needs 60/);
    const r = placeProp(p, R, openGround, 'season:winter:snowman', spots[0]!.x, spots[0]!.y, { now: at(1), id: 'dsnow' });
    expect(r.ok && r.bought).toEqual({ id: 'snowman', coins: MARKET_PRICE.common });
    expect(r.ok && r.coins).toBe(-0);
    const q = r.ok ? r.progress : p;
    expect(q.drops?.bought).toEqual(['snowman']);
    expect(coinsToSpend(q)).toBe(100 - MARKET_PRICE.common);
    // Owned now: free to place again.
    expect(priceFor(q, R, snow).total).toBe(0);
    const u = undoStep(q, { region: R, before: p.decor?.[R], label: 'Built', coins: 0 }, at(2));
    expect(cityDecor(u, R).props).toHaveLength(0);
    expect(u.drops?.bought).toEqual(['snowman']);
    expect(coinsToSpend(u)).toBe(100 - MARKET_PRICE.common);
  });

  it('a spare from a crate lets one more of a reward stand in each city', () => {
    const snow = itemById('reward-snowman')!;
    let p: Progress = { ...rich(), drops: { owned: ['snowman'] } };
    p = place(place(p, 'season:winter:snowman', spots[0]!, 1), 'season:winter:snowman', spots[1]!, 2);
    expect(cantBuy(p, R, 'season:winter:snowman')).toMatch(/2 of these per city/);
    p = { ...p, drops: { owned: ['snowman'], spares: { snowman: 1 } } };
    expect(cantBuy(p, R, 'season:winter:snowman')).toBeUndefined();
    expect(priceFor(p, R, snow).total).toBe(0);
  });

  it('two surfaces buying at once keep both props; a removal stays removed; undo works prop by prop', () => {
    const base = place(rich(), 'deco:oak', spots[0]!, 1);
    const panel = place(base, 'deco:pine', spots[1]!, 2);
    const tab = place(base, 'deco:palm', spots[2]!, 3);
    const both = mergeProgress(panel, tab);
    expect(cityDecor(both, R).props.map((q) => q.kind).sort()).toEqual(['deco:oak', 'deco:palm', 'deco:pine']);
    // The panel removes the oak; the tab's copy (still with the oak) merges in later: the oak stays gone.
    const r = removeProp(both, R, `d1-${spots[0]!.x}-${spots[0]!.y}`, { now: at(9) });
    const removed = r.ok ? r.progress : both;
    const later = { ...tab, decor: { [R]: { ...cityDecor(tab, R), updatedAt: at(10) } } };
    expect(cityDecor(mergeProgress(removed, later), R).props.map((q) => q.kind).sort()).toEqual(['deco:palm', 'deco:pine']);
    // Undoing the panel's pine takes only the pine away; the tab's palm, placed since, stays.
    const pine = cityDecor(panel, R).props.find((q) => q.kind === 'deco:pine')!;
    const undone = undoStep(both, { region: R, before: base.decor?.[R], label: 'Built', coins: -5, prop: pine }, at(11));
    expect(cityDecor(undone, R).props.map((q) => q.kind).sort()).toEqual(['deco:oak', 'deco:palm']);
    expect(cityDecor(undone, R).gone).toEqual([`d2-${spots[1]!.x}-${spots[1]!.y}`]);
  });

  it('undoing a removal brings the prop back under a new id (the old one is remembered gone)', () => {
    const p = place(rich(), 'deco:oak', spots[0]!, 1);
    const id = `d1-${spots[0]!.x}-${spots[0]!.y}`;
    const r = removeProp(p, R, id, { now: at(2) });
    const q = r.ok ? r.progress : p;
    const back = undoStep(q, { region: R, before: p.decor?.[R], label: 'Removed', coins: r.ok ? r.coins : 0 }, at(3), () => 'dback');
    expect(cityDecor(back, R).props).toEqual([{ ...cityDecor(p, R).props[0], id: 'dback' }]);
    // And it survives a merge with a copy that saw the removal.
    expect(cityDecor(mergeProgress(q, back), R).props.map((x) => x.id)).toEqual(['dback']);
  });

  it('a merge keeps at most MAX_PER_CITY a city, and a copy from before v2.16 (no `gone`) still merges newer-wins', () => {
    const many = (n: number, tag: string, t: string): CityDecor => ({ updatedAt: t, gone: [], props: Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, kind: 'deco:plaza', x: i % 40, y: Math.floor(i / 40), at: '2026-10-19' })) });
    expect(mergeDecor(many(100, 'a', at(1)), many(100, 'b', at(2))).props).toHaveLength(MAX_PER_CITY);
    const legacy = { updatedAt: at(5), props: [] };
    expect(mergeDecor(many(3, 'a', at(1)), legacy)).toBe(legacy);
  });
});

