// A city that looks and feels alive (round 3, Step 3): combos, seasons, learning couriers and rush hour, next-level
// previews, pocket-park variety. The pure halves: src/world/{combos,seasons,couriers,preview}.ts and src/game/decor.ts.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Progress } from '@/backend/contract';
import { BIG_PARKS, bigParkFor, decorPlan, flowerFor, PARK_CORNERS, parkCornerFor, POCKET_PARKS, pocketParkFor, seasonDecal, tilesOf, type DecorWorld } from '@/game/decor';
import { DATA_CAP } from '@/world/carriers';
import { comboById, comboMid, COMBOS, combosFound, newCombos, placeCombos } from '@/world/combos';
import { courierLegs, isRushHour, LEARN_CAP, LEARN_RUSH_CAP, learnTarget, SCALERS } from '@/world/couriers';
import { FLOWS } from '@/world/culture';
import { cityPlanFor, legacyPlan, type CityPlan } from '@/world/plan';
import { nextLevelPreview } from '@/world/preview';
import { parseSeason, SEASON_DECALS, SEASON_PROPS, SEASON_TINT, seasonAt, seasonFor, SEASONS } from '@/world/seasons';
import { serviceById } from '@/world/taxonomy';
import { VEHICLE_CAP } from '@/world/traffic';

const sprites = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/sprites.json'), 'utf8')) as { sprites: Record<string, unknown> }).sprites;

/** Decor's world for a plan, as CityMap builds it: sidewalks are the ring next to a road. */
function worldFor(plan: CityPlan, built: (id: string) => boolean, extra: Partial<DecorWorld> = {}): DecorWorld {
  const N = plan.size;
  const foot = new Set<number>();
  for (const l of plan.landmarks) for (let y = l.footprint.y; y < l.footprint.y + l.footprint.h; y++) for (let x = l.footprint.x; x < l.footprint.x + l.footprint.w; x++) foot.add(y * N + x);
  const isSidewalk = (x: number, y: number) =>
    !plan.isRoad({ x, y }) && !foot.has(y * N + x) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => plan.isRoad({ x: x + dx, y: y + dy }));
  return { plan, landmarks: plan.landmarks, isSidewalk, districtOpen: () => true, tierOf: (id) => (built(id) ? 2 : -1), ...extra };
}

describe('combos (shared/combos.json, src/world/combos.ts)', () => {
  it('are found only when every service is put up and stands in this city', () => {
    const edge = comboById('edge-arch')!;
    const only = (ids: string[]) => combosFound((id) => (ids.includes(id) ? 1 : -1), () => true);
    expect(only(['s3']).map((c) => c.id)).not.toContain(edge.id);
    expect(only(['s3', 'cloudfront']).map((c) => c.id)).toContain(edge.id);
    // A construction site (tier 0) counts; a service with no lot here doesn't.
    expect(combosFound((id) => (edge.services.includes(id) ? 0 : -1), () => true).map((c) => c.id)).toContain(edge.id);
    expect(combosFound(() => 1, (id) => id !== 'cloudfront').map((c) => c.id)).not.toContain(edge.id);
    expect(newCombos(only(['s3', 'cloudfront']), new Set([edge.id]))).toEqual([]);
  });

  it.each(['us-east-1', 'us-west-2', 'eu-west-1'])('%s: with everything put up, each prop stands near its buildings, on free ground, a tile apart', (code) => {
    const plan = cityPlanFor(code);
    const found = combosFound(() => 2, (id) => !!plan.landmarkLayout(id));
    expect(found.length).toBeGreaterThanOrEqual(15);
    const items = decorPlan(worldFor(plan, () => true, { combos: found }));
    const props = items.filter((d) => d.sprite.startsWith('combo:'));
    // Most combos find ground (a crowded downtown may leave one out: it's still found).
    expect(props.length).toBeGreaterThanOrEqual(Math.ceil(found.length * 0.6));
    const doors = new Set(plan.landmarks.map((l) => `${l.workSpot.x},${l.workSpot.y}`));
    const seen = new Set<string>();
    for (const p of props) {
      const c = COMBOS.find((x) => x.sprite === p.sprite)!;
      expect([p.w, p.h]).toEqual(c.size);
      const mid = comboMid(c, (id) => plan.landmarkLayout(id))!;
      const near = [mid, ...c.services.map((s) => plan.landmarkLayout(s)!.footprint).map((f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 }))];
      expect(near.some((a) => Math.hypot(p.x + p.w / 2 - a.x, p.y + p.h / 2 - a.y) <= c.radius + 1e-9), c.id).toBe(true);
      for (const t of tilesOf(p)) {
        expect(plan.isRoad(t), `${c.id} on a road`).toBe(false);
        expect(plan.isFootprint(t.x, t.y), `${c.id} on a building`).toBe(false);
        expect(plan.isWater?.(t.x, t.y) ?? false, `${c.id} on water`).toBe(false);
        expect(doors.has(`${t.x},${t.y}`), `${c.id} on a work spot`).toBe(false);
        expect(seen.has(`${t.x},${t.y}`), `${c.id} overlaps`).toBe(false);
        seen.add(`${t.x},${t.y}`);
      }
    }
    // The same city puts the same props on the same tiles (no rng()).
    expect(decorPlan(worldFor(plan, () => true, { combos: found })).filter((d) => d.sprite.startsWith('combo:'))).toEqual(props);
  });

  it('placeCombos keeps props apart and off the tiles beside a door', () => {
    const plan = legacyPlan();
    const found = combosFound(() => 2, (id) => !!plan.landmarkLayout(id));
    const spots = placeCombos(found, { size: plan.size, free: (x, y) => !plan.isRoad({ x, y }) && !plan.isFootprint(x, y), layout: (id) => plan.landmarkLayout(id), workSpots: plan.landmarks.map((l) => l.workSpot) });
    for (const [i, a] of spots.entries()) {
      for (const w of plan.landmarks.map((l) => l.workSpot))
        for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) expect(Math.abs(x - w.x) + Math.abs(y - w.y), a.combo.id).toBeGreaterThan(1);
      for (const b of spots.slice(i + 1)) {
        const apart = a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y;
        expect(apart, `${a.combo.id} / ${b.combo.id}`).toBe(true);
      }
    }
  });
});

describe('seasons (src/world/seasons.ts)', () => {
  it('follow the calendar, flip south of the equator, and stay summer in the tropics', () => {
    const jan = new Date('2026-01-15T12:00:00Z');
    const jul = new Date('2026-07-15T12:00:00Z');
    const oct = new Date('2026-10-20T12:00:00Z');
    expect(seasonAt(jan, 51)).toBe('winter');
    expect(seasonAt(jul, 51)).toBe('summer');
    expect(seasonAt(oct, 51)).toBe('autumn');
    expect(seasonAt(new Date('2026-04-15T12:00:00Z'), 51)).toBe('spring');
    expect(seasonAt(jan, -33)).toBe('summer');
    expect(seasonAt(oct, -33)).toBe('spring');
    expect(seasonAt(jan, 1.3)).toBe('summer');
    // Real Regions: Dublin in winter, Sydney in summer, Singapore always summer.
    expect(seasonFor('eu-west-1', jan)).toBe('winter');
    expect(seasonFor('ap-southeast-2', jan)).toBe('summer');
    expect(seasonFor('ap-southeast-1', jul)).toBe('summer');
  });

  it('the ?season= override wins, in any case; anything else is ignored', () => {
    expect(parseSeason('Winter')).toBe('winter');
    expect(parseSeason('monsoon')).toBeUndefined();
    expect(seasonFor('us-east-1', new Date('2026-07-01T00:00:00Z'), 'winter')).toBe('winter');
    expect(seasonFor('us-east-1', new Date('2026-07-01T00:00:00Z'), 'nope')).toBe('summer');
  });

  it('every decal and seasonal prop is drawn, and the tints stay close to white', () => {
    for (const s of SEASONS) {
      for (const n of [...SEASON_DECALS[s].names, ...SEASON_PROPS[s]]) expect(sprites[n], n).toBeDefined();
      const t = SEASON_TINT[s];
      for (const ch of [t >> 16, (t >> 8) & 0xff, t & 0xff]) expect(ch, s).toBeGreaterThanOrEqual(0xd0);
    }
  });

  it('swaps some flower beds for the season\'s prop (nothing added) and stamps decals on a stable share of grass', () => {
    const plan = cityPlanFor('eu-west-1');
    // Level 1 districts (flower beds in the pocket parks).
    const summer = decorPlan(worldFor(plan, () => true, { tierOf: () => 1 }));
    const winter = decorPlan(worldFor(plan, () => true, { tierOf: () => 1, season: 'winter' }));
    expect(winter.length).toBe(summer.length);
    expect(winter.some((d) => d.sprite === 'season:winter:snowman')).toBe(true);
    expect(winter.map((d) => `${d.x},${d.y}`)).toEqual(summer.map((d) => `${d.x},${d.y}`));
    expect(flowerFor(3, 4)).toBe('flowers');
    let snow = 0;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (seasonDecal('winter', x, y)) snow++;
    expect(snow / 1600).toBeGreaterThan(0.2);
    expect(snow / 1600).toBeLessThan(0.4);
    expect(seasonDecal('winter', 5, 7)).toBe(seasonDecal('winter', 5, 7));
    expect(seasonDecal('summer', 5, 7)).toBeUndefined();
  });
});

describe('learning traffic (src/world/couriers.ts)', () => {
  it('drives only the legs of shared/flows.json whose two ends are put up, once a pair, each explained', () => {
    expect(courierLegs(FLOWS, () => false)).toEqual([]);
    const built = new Set(['cloudfront', 's3', 'apigateway', 'lambda', 'dynamodb']);
    const legs = courierLegs(FLOWS, (id) => built.has(id));
    expect(legs.length).toBeGreaterThan(0);
    const pairs = legs.map((l) => [l.from, l.to].sort().join('+'));
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const l of legs) {
      expect(built.has(l.from) && built.has(l.to)).toBe(true);
      const f = FLOWS.find((x) => x.id === l.flowId)!;
      expect(f.serviceIds.indexOf(l.to) - f.serviceIds.indexOf(l.from), l.title).toBe(1);
      expect(l.title).toContain('→');
      expect(l.text.length).toBeGreaterThan(10);
      expect(l.source).toMatch(/^https:\/\//);
    }
    // A pair that's also a combo explains the leg with the combo's own sentence.
    const edge = legs.find((l) => [l.from, l.to].sort().join('+') === 'cloudfront+s3');
    if (edge) expect(edge.text).toBe(comboById('edge-arch')!.simple);
  });

  it('stays inside the vehicle cap beside the data carriers, with more at rush hour (8–9 and 17–18 local)', () => {
    for (const s of ['panel', 'tab'] as const) {
      expect(LEARN_RUSH_CAP[s]).toBeGreaterThan(LEARN_CAP[s]);
      expect(LEARN_RUSH_CAP[s] + DATA_CAP[s]).toBeLessThan(VEHICLE_CAP[s]);
      expect(learnTarget(0, s, true)).toBe(0);
      expect(learnTarget(1, s, false)).toBeLessThanOrEqual(2);
      expect(learnTarget(20, s, true)).toBe(LEARN_RUSH_CAP[s]);
    }
    expect([7.9, 8, 8.5, 9, 12, 17, 17.99, 18].map(isRushHour)).toEqual([false, true, true, false, false, true, true, false]);
    for (const id of SCALERS) expect(serviceById(id), id).toBeDefined();
  });
});

describe('next-level previews (src/world/preview.ts)', () => {
  const at = (xp: number): Progress => ({ version: 1, landmarks: { ec2: { discovered: true, xp } }, updatedAt: '2026-10-20T00:00:00Z' });

  it('names the next level, what it adds and the reviews to go; the ghost is that level\'s sprite', () => {
    const pv = nextLevelPreview(at(12), 'ec2')!;
    expect(pv.tier).toBe(1);
    expect(pv.next).toBe(2);
    expect(pv.nextName).toBe('Practitioner');
    expect(pv.sprite).toBe('lm:ec2:2');
    expect(sprites[pv.sprite]).toBeDefined();
    expect(pv.adds).toBe('you pick the right instance family');
    expect(pv.reviews).toBe(Math.ceil((40 - 12) / 4));
    expect(pv.text).toBe(`Next: Practitioner · adds “you pick the right instance family” · ${pv.reviews} reviews to go`);
    expect(nextLevelPreview(at(39), 'ec2')!.text).toMatch(/· 1 review to go$/);
  });

  it('shows nothing for a building not put up, or fully grown', () => {
    expect(nextLevelPreview({ version: 1, landmarks: {}, updatedAt: '2026-10-20T00:00:00Z' }, 'ec2', undefined, -1)).toBeUndefined();
    expect(nextLevelPreview(at(500), 'ec2')).toBeUndefined();
  });
});

describe('pocket parks (src/game/decor.ts)', () => {
  it('each lot takes the next piece in turn, from art that exists, so neighbouring parks differ', () => {
    for (const n of [...POCKET_PARKS, ...BIG_PARKS, ...PARK_CORNERS]) expect(sprites[n], n).toBeDefined();
    for (let t = 0; t < 20; t++) {
      expect(pocketParkFor(t + 1)).not.toBe(pocketParkFor(t));
      expect(bigParkFor(t + 1)).not.toBe(bigParkFor(t));
      expect(parkCornerFor(t + 1)).not.toBe(parkCornerFor(t));
    }
    expect(new Set(Array.from({ length: 10 }, (_, t) => parkCornerFor(t))).size).toBe(new Set(PARK_CORNERS).size);
  });

  it('a real city\'s parks aren\'t all gazebos', () => {
    const counts = new Map<string, number>();
    for (const code of ['us-east-1', 'eu-west-1', 'ap-southeast-2', 'us-west-2']) {
      const plan = cityPlanFor(code);
      for (const tier of [1, 2]) {
        const items = decorPlan(worldFor(plan, () => true, { tierOf: () => tier }));
        for (const d of items) if ([...POCKET_PARKS, ...BIG_PARKS].includes(d.sprite)) counts.set(d.sprite, (counts.get(d.sprite) ?? 0) + 1);
      }
    }
    expect(counts.size).toBeGreaterThanOrEqual(8);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(counts.get('park:gazebo') ?? 0).toBeLessThan(total / 2);
  });
});
