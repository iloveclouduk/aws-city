import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { ALL_RIDES, ANNEX_H, ANNEX_RIDES, parkLayout, PARK_H, PARK_W, rideHint, rideOpen, RIDES, RIDE_TIER, openRides } from '@/world/park';
import { terrainFor } from '@/world/terrain';
import { FACTS } from '@/world/regions';
import { TIER_XP } from '@/world/places';
import { SERVICES } from '@/world/taxonomy';
import { outsideOf } from '@/world/terrain';
import { zonesFor } from '@/world/regions';
import { somePlans } from './support/plans';

// re:Play Park: an AWS theme park whose rides open as their buildings reach Practitioner.
const atlas = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/sprites.json'), 'utf8')) as { sprites: Record<string, unknown> };
// Each Region's terrain is built once for this file (~30 ms each; two tests walk every Region).
const terrains = new Map<string, ReturnType<typeof terrainFor>>();
const terrainOnce = (code: string) => terrains.get(code) ?? terrains.set(code, terrainFor(code)).get(code)!;
const progress = (xp: Record<string, number>, region = 'us-west-2'): Progress =>
  ({ landmarks: {}, cities: { [region]: { landmarks: Object.fromEntries(Object.entries(xp).map(([id, x]) => [id, { discovered: true, xp: x }])) } }, updatedAt: '' }) as unknown as Progress;

describe('re:Play Park', () => {
  it('every ride is a real service, with its sprites in the atlas (open frames and the under-wraps one)', () => {
    for (const r of ALL_RIDES) {
      expect(SERVICES.some((s) => s.id === r.serviceId), r.serviceId).toBe(true);
      const frames = r.frames ? Array.from({ length: r.frames }, (_, i) => `park:${r.id}${i}`) : [`park:${r.id}`];
      for (const f of [...frames, `park:${r.id}:locked`]) expect(atlas.sprites[f], f).toBeTruthy();
    }
    for (const f of ['park:arch', 'park:booth', 'park:fenceX', 'crane1x1', 'scaffold1x1']) expect(atlas.sprites[f], f).toBeTruthy();
  });

  it('a ride opens at Practitioner in this city, not before, and not in another city', () => {
    const lambda = RIDES.find((r) => r.serviceId === 'lambda')!;
    expect(rideOpen(progress({ lambda: TIER_XP[RIDE_TIER] - 1 }), lambda, 'us-west-2')).toBe(false);
    expect(rideOpen(progress({ lambda: TIER_XP[RIDE_TIER] }), lambda, 'us-west-2')).toBe(true);
    expect(rideOpen(progress({ lambda: TIER_XP[RIDE_TIER] }), lambda, 'eu-west-1')).toBe(false);
    expect(openRides(progress({ lambda: 500, s3: 500 }), 'us-west-2')).toBe(2);
    expect(rideHint(lambda)).toMatch(/^Reach Practitioner at .+ to open the Lambda Coaster$/);
  });

  it('lays out inside its site with nothing overlapping, and shows closed rides under wraps', () => {
    const site = { x: 10, y: 20, w: PARK_W, h: PARK_H };
    const pieces = parkLayout(site, progress({ lambda: 500 }), 'us-west-2');
    const used = new Set<string>();
    for (const p of pieces)
      for (let y = p.y; y < p.y + p.h; y++)
        for (let x = p.x; x < p.x + p.w; x++) {
          expect(x >= site.x && y >= site.y && x < site.x + site.w && y < site.y + site.h, p.sprite).toBe(true);
          expect(used.has(`${x},${y}`), `${p.sprite} overlaps`).toBe(false);
          used.add(`${x},${y}`);
        }
    expect(pieces.find((p) => p.ride?.serviceId === 'lambda')?.sprite).toBe('park:coaster');
    expect(pieces.find((p) => p.ride?.serviceId === 's3')?.sprite).toBe('park:flume:locked');
  });

  it('every Region has a site, clear of every other prop, the roads and the highway', () => {
    for (const code of Object.keys(FACTS.regions)) {
      const t = terrainOnce(code);
      const site = t.park!;
      expect(site, code).toBeTruthy();
      const inSite = (x: number, y: number) => x >= site.x && y >= site.y && x < site.x + site.w && y < site.y + site.h;
      // Collect what lands in the site and check once per Region (an expect per tile made this the suite's slowest test).
      const clash: string[] = [];
      for (const p of t.props) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (inSite(x, y)) clash.push(`${p.sprite} at ${x},${y}`);
      for (const r of [...t.roads, ...t.highway]) if (inSite(r.x, r.y)) clash.push(`road at ${r.x},${r.y}`);
      expect(clash, code).toEqual([]);
    }
  }, 30_000); // builds every Region's terrain: ~1 s alone, several when every test file runs at once
});

describe('buildings grow between levels', async () => {
  const { constructionStage, growthOf, growthLine } = await import('@/state/growth');

  it('scaffolding at a third of the way to the next level, a crane at two-thirds, none when fully grown', () => {
    expect([0, 0.2, 0.34, 0.5, 0.67, 0.99].map((p) => constructionStage(p, false))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(constructionStage(0.9, true)).toBe(0);
  });

  it('says how far a building is from its next level', () => {
    const g = growthOf(progress({ s3: TIER_XP[2] + 10 }), 's3', 'us-west-2');
    expect(g.tier).toBe(2);
    expect(g.next).toBe(TIER_XP[3]);
    expect(g.pct).toBeCloseTo(10 / (TIER_XP[3] - TIER_XP[2]));
    expect(growthLine(g)).toBe(`${g.place} · ${TIER_XP[2] + 10}/${TIER_XP[3]} to Expert`);
    expect(growthLine(growthOf(progress({ s3: 99_999 }), 's3', 'us-west-2'))).toMatch(/fully grown$/);
  });
});

describe('riding the park (src/game/Park.ts)', () => {
  it('an open ride is ridden; a closed one, or a plain prop, opens its building instead', async () => {
    const { rideAction, RIDES } = await import('@/world/park');
    expect(rideAction({ ride: RIDES[0], open: true })).toBe('ride');
    expect(rideAction({ ride: RIDES[0], open: false })).toBe('select');
    expect(rideAction({ open: true })).toBe('select');
  });

  it('the annex holds three more rides behind the park, clear of every prop and the airport, the same each time', () => {
    let sited = 0;
    for (const code of Object.keys(FACTS.regions)) {
      const t = terrainOnce(code);
      const a = t.parkAnnex;
      if (!a) continue;
      sited++;
      expect(a.w * a.h).toBe(PARK_W * ANNEX_H);
      const inA = (x: number, y: number) => x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h;
      const clash: string[] = [];
      for (const p of t.props) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (inA(x, y)) clash.push(p.sprite);
      for (const r of [...t.roads, ...t.highway]) if (inA(r.x, r.y)) clash.push('road');
      const air = t.airport;
      if (air) for (let y = air.y; y < air.y + air.h; y++) for (let x = air.x; x < air.x + air.w; x++) if (inA(x, y)) clash.push('airport');
      expect(clash, code).toEqual([]);
    }
    expect(sited / Object.keys(FACTS.regions).length).toBeGreaterThan(0.9);
    const site = { x: 10, y: 20, w: PARK_W, h: PARK_H };
    const annex = { x: 10, y: 18, w: PARK_W, h: ANNEX_H };
    const pieces = parkLayout(site, progress({ agentcore: 500 }), 'us-west-2', annex);
    expect(pieces.filter((p) => p.ride && ANNEX_RIDES.includes(p.ride)).map((p) => p.sprite)).toEqual(['park:maze:locked', 'park:rapids:locked', 'park:robots0']);
  }, 30_000);
});

describe.each(somePlans().map((s) => [s.name, s] as const))('re:Play Park beside the real streets of %s', (_n, s) => {
  it('has a site on open land beyond the river, clear of the islands, roads and highway', () => {
    const p = s.plan;
    const t = terrainFor(s.region, zonesFor(s.region), [], p);
    for (const site of [t.park, t.parkAnnex].filter(Boolean)) {
      for (let y = site!.y; y < site!.y + site!.h; y++)
        for (let x = site!.x; x < site!.x + site!.w; x++) {
          expect(['land', 'field', 'forest', 'beach'], `${x},${y}`).toContain(t.kind(x, y));
          expect(outsideOf(p.size)(x, y)).toBeGreaterThan(4);
          expect(t.roads.some((r) => r.x === x && r.y === y)).toBe(false);
          expect(Object.values(t.reserved).some((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h)).toBe(false);
        }
    }
  });
});
