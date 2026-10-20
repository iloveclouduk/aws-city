// Infill (src/game/infill.ts): the ordinary buildings that fill a real map's blocks, and the street furniture.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearBehind, decorPlan, tilesOf } from '@/game/decor';
import { buildingTiles, CLASS_MAX_PX, CLEAR_BAND, CLEAR_MARGIN, HEIGHT_CLASSES, infillPlan, levelClass, segmentTiles, type InfillResult, type InfillSprite, type InfillWorld } from '@/game/infill';
import { ShelfPacker } from '@/game/infillPack';
import { CITY_ISO, footprintDepth } from '@/game/iso';
import { findPath } from '@/game/pathfinding';
import { frontRowTiles } from '@/world/layout';
import { legacyPlan, type CityPlan } from '@/world/plan';
import { infillStyleFor } from '@/world/regions';
import { signalPhase, SIGNAL_CYCLE_MS } from '@/world/traffic';
import { DISTRICTS } from '@/world/taxonomy';
import { samplePlans, somePlans } from './support/plans';
import { fakeCatalogue } from './support/infill';

/** Mirror CityMap: the sidewalk is the ground beside a road (not a footprint or water); decor's tiles are taken. */
function worldFor(plan: CityPlan, region: string, tier: number, catalogue: readonly InfillSprite[] = fakeCatalogue()): { w: InfillWorld; decorTiles: Set<number> } {
  const N = plan.size;
  const foot = new Set<number>();
  for (const l of plan.landmarks) for (const t of tilesOf({ ...l.footprint, sprite: '', block: true })) foot.add(t.y * N + t.x);
  const isSidewalk = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < N && y < N && !plan.isRoad({ x, y }) && !foot.has(y * N + x) && !plan.isWater?.(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => plan.isRoad({ x: x + dx, y: y + dy }));
  const base = { plan, landmarks: plan.landmarks, isSidewalk, districtOpen: () => tier >= 0, tierOf: () => tier };
  const decorTiles = new Set(decorPlan(base).filter((d) => d.block).flatMap(tilesOf).map((t) => t.y * N + t.x));
  return { w: { ...base, region, catalogue, style: infillStyleFor(region), taken: (x, y) => decorTiles.has(y * N + x) }, decorTiles };
}

const rank = (c: string) => HEIGHT_CLASSES.indexOf(c as never);

describe.each(somePlans(3).map((s) => [s.name, s] as const))('infill on %s', (_n, s) => {
  const plan = s.plan;
  const N = plan.size;
  const runs = [-1, 1, 4].map((tier) => ({ tier, ...worldFor(plan, s.region, tier), r: undefined as unknown as InfillResult }));
  for (const run of runs) run.r = infillPlan(run.w);

  it('cuts near-square segments (one depth orders each) and tiles them with non-overlapping buildings', () => {
    for (const { r } of runs) {
      expect(r.segments.length).toBeGreaterThan(50);
      const seen = new Set<number>();
      for (const g of r.segments) {
        expect(Math.abs(g.w - g.h), g.id).toBeLessThanOrEqual(1);
        expect(Math.max(g.w, g.h), g.id).toBeLessThanOrEqual(4);
        expect(g.w * g.h, g.id).toBeLessThanOrEqual(12);
        expect(g.depth).toBe(footprintDepth(CITY_ISO, g));
        for (const t of segmentTiles(g)) {
          expect(seen.has(t.y * N + t.x), `${g.id} overlaps at ${t.x},${t.y}`).toBe(false);
          seen.add(t.y * N + t.x);
        }
        const inSeg = new Set<number>();
        for (const b of g.buildings)
          for (const t of segmentTiles(b)) {
            expect(t.x >= g.x && t.y >= g.y && t.x < g.x + g.w && t.y < g.y + g.h, `${b.sprite} outside ${g.id}`).toBe(true);
            expect(inSeg.has(t.y * N + t.x)).toBe(false);
            inSeg.add(t.y * N + t.x);
          }
      }
    }
  });

  it('never stands on a road, sidewalk, work spot, front row, footprint, water, park, superblock or decor', () => {
    const spots = new Set(plan.landmarks.map((l) => l.workSpot.y * N + l.workSpot.x));
    const fronts = new Set(plan.landmarks.flatMap((l) => frontRowTiles(l)).map((t) => t.y * N + t.x));
    for (const { w, r, decorTiles } of runs)
      for (const g of r.segments)
        for (const t of segmentTiles(g)) {
          const k = t.y * N + t.x;
          const where = `${g.id} ${t.x},${t.y}`;
          expect(plan.isRoad(t), where).toBe(false);
          expect(w.isSidewalk(t.x, t.y), where).toBe(false);
          expect(spots.has(k) || fronts.has(k) || decorTiles.has(k), where).toBe(false);
          expect(plan.isFootprint(t.x, t.y) || !!plan.isWater?.(t.x, t.y), where).toBe(false);
          expect(plan.groundAt?.(t.x, t.y), where).not.toBe('park');
          expect(['square', 'day1', 'campus']).not.toContain(plan.plotAt(t));
        }
  });

  it('never hides a landmark drawn behind it: each building is no taller than the clear ground behind each of its tiles', () => {
    for (const { r } of runs)
      for (const g of r.segments) {
        const hidden = (x: number, y: number) => {
          if (x <= -5 || y <= -5) return true;
          const l = plan.landmarks.find((m) => x >= m.footprint.x && y >= m.footprint.y && x < m.footprint.x + m.footprint.w && y < m.footprint.y + m.footprint.h);
          return !!l && footprintDepth(CITY_ISO, l.footprint) < g.depth;
        };
        for (const b of g.buildings) {
          expect(b.px).toBeLessThanOrEqual(CLASS_MAX_PX[b.cls]);
          for (const t of segmentTiles(b)) expect(b.px + 8 * (t.x - b.x + t.y - b.y), `${b.sprite} at ${t.x},${t.y}`).toBeLessThanOrEqual((clearBehind(t.x, t.y, hidden, CLEAR_BAND) - CLEAR_MARGIN) * 8);
        }
      }
  });

  it('keeps locked districts low-rise (walk-ups only where the real place is built up) and follows the density everywhere', () => {
    const locked = runs[0].r;
    for (const g of locked.segments)
      for (const b of g.buildings) {
        if (g.group === 'hood') continue;
        const dens = Math.min(...segmentTiles(b).map((t) => plan.density!(t.x, t.y)));
        expect(rank(b.cls), `${b.sprite} in ${g.id}`).toBeLessThanOrEqual(dens >= 2 ? 1 : 0);
      }
    for (const { r } of runs) for (const g of r.segments) for (const b of g.buildings) expect(rank(b.cls), `${b.sprite} at ${b.x},${b.y}`).toBeLessThanOrEqual(Math.max(...segmentTiles(b).map((t) => plan.density!(t.x, t.y))));
  });

  it('grows with what you learn: the districts rise as their landmarks level up', () => {
    // The average height class of the districts' buildings (an open district keeps its open lots as parks).
    const tall = (r: InfillResult) => {
      const bs = r.segments.filter((g) => g.group !== 'hood').flatMap((g) => g.buildings);
      return bs.reduce((n, b) => n + rank(b.cls), 0) / bs.length;
    };
    expect(tall(runs[1].r)).toBeGreaterThan(tall(runs[0].r));
    expect(tall(runs[2].r)).toBeGreaterThan(tall(runs[1].r));
    expect(levelClass(false, 4)).toBe(0);
    expect([0.5, 1, 2, 3.5].map((l) => levelClass(true, l))).toEqual([0, 1, 2, 3]);
  });

  it('leaves every work spot reachable from the gate', () => {
    for (const { r, decorTiles } of runs) {
      const blocked = new Set([...decorTiles, ...r.segments.flatMap(buildingTiles).map((t) => t.y * N + t.x)]);
      const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && !blocked.has(y * N + x) && !plan.isFootprint(x, y) && !plan.isWater?.(x, y);
      for (const l of plan.landmarks) expect(findPath(plan.gate, l.workSpot, N, N, ok).length, l.id).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    expect(infillPlan(runs[2].w)).toEqual(runs[2].r);
  });

  it('puts trees on sidewalks, signals on avenue corners and plain cars on avenue kerbs', () => {
    const { w, r } = runs[1];
    const spots = new Set(plan.landmarks.map((l) => `${l.workSpot.x},${l.workSpot.y}`));
    const trees = r.street.filter((i) => i.kind === 'tree');
    const signals = r.street.filter((i) => i.kind === 'signal');
    const cars = r.street.filter((i) => i.kind === 'car');
    expect(trees.length).toBeGreaterThan(30);
    for (const t of trees) {
      const x = Math.round(t.x);
      const y = Math.round(t.y);
      expect(w.isSidewalk(x, y), `${x},${y}`).toBe(true);
      expect(spots.has(`${x},${y}`)).toBe(false);
    }
    for (const sg of signals) {
      expect(w.isSidewalk(sg.x, sg.y)).toBe(true);
      expect(sg.sprite).toMatch(/^signal:(ns|ew)$/);
      const near = [-1, 1].flatMap((dx) => [-1, 1].map((dy) => plan.roadAt(sg.x + dx, sg.y + dy)));
      expect(near.some((n) => n?.axis === 'junction' && n.width === 2)).toBe(true);
    }
    expect(cars.length).toBeLessThanOrEqual(48);
    for (const c of cars) {
      expect(c.sprite).toMatch(/^veh:car:(navy|orange|white|teal):(SE|SW|NE|NW)$/);
      const road = plan.roadAt(Math.round(c.x), Math.round(c.y));
      expect(road?.width, `${c.x},${c.y}`).toBe(2);
      expect(road?.axis).not.toBe('junction');
    }
  });
});

describe('infill variety', () => {
  it('mixes kinds and styles, puts shops on block corners and leaves the odd courtyard garden', () => {
    const s = somePlans(3)[1];
    const { w } = worldFor(s.plan, s.region, -1);
    const r = infillPlan(w);
    const all = r.segments.flatMap((g) => g.buildings);
    const kinds = new Set(all.map((b) => b.sprite.split(':')[2]));
    expect(kinds.size, [...kinds].join(' ')).toBeGreaterThanOrEqual(4);
    const styles = new Set(all.map((b) => b.sprite.split(':')[1]));
    expect(styles.size).toBe(2);
    expect(all.filter((b) => b.sprite.split(':')[1] === w.style).length).toBeGreaterThan(all.length / 2);
    const corners = all.filter((b) => b.sprite.includes(':corner:'));
    expect(corners.length).toBeGreaterThan(10);
    for (const c of corners) expect((w.isSidewalk(c.x + 1, c.y) || w.isSidewalk(c.x - 1, c.y)) && (w.isSidewalk(c.x, c.y + 1) || w.isSidewalk(c.x, c.y - 1)), `${c.x},${c.y}`).toBe(true);
    const gardens = r.street.filter((i) => i.kind === 'garden');
    const big = r.segments.filter((g) => g.w * g.h >= 9).length;
    expect(gardens.length).toBeGreaterThan(0);
    expect(gardens.length).toBeLessThan(big / 4);
    const covered = new Set(r.segments.flatMap(buildingTiles).map((t) => `${t.x},${t.y}`));
    for (const g of gardens) expect(covered.has(`${g.x},${g.y}`)).toBe(false);
  });
});

describe('infill across every Region', () => {
  it('fills at least 60% of each real plan\'s free build ground', () => {
    for (const s of samplePlans()) {
      const r = infillPlan(worldFor(s.plan, s.region, 2).w);
      expect(r.free, s.name).toBeGreaterThan(300);
      expect(r.filled / r.free, s.name).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('leaves the legacy city to decor', () => {
    const plan = legacyPlan();
    expect(infillPlan({ ...worldFor(plan, 'us-east-1', 4).w }).segments).toHaveLength(0);
  });

  it('on a real map, decor keeps hoardings for locked districts and leaves homes and towers to infill', () => {
    const s = samplePlans()[0];
    const locked = decorPlan(worldFor(s.plan, s.region, -1).w);
    const open = decorPlan(worldFor(s.plan, s.region, 4).w);
    for (const d of DISTRICTS) {
      const inD = (x: { x: number; y: number }) => s.plan.plotAt(x) === d.id;
      expect(locked.filter(inD).some((i) => i.sprite.startsWith('hoarding')), d.id).toBe(true);
      expect(open.filter(inD).some((i) => i.sprite.startsWith('hoarding')), d.id).toBe(false);
    }
    expect([...locked, ...open].some((i) => i.sprite.startsWith('house:') || i.sprite.startsWith('tower:'))).toBe(false);
  });
});

describe('the generated catalogue (art/tiles/infill.json)', () => {
  const file = path.resolve(__dirname, '../art/tiles/infill.json');
  it.skipIf(!fs.existsSync(file))('keeps each class within its height and every sprite in the atlas, in both styles', () => {
    const cat = JSON.parse(fs.readFileSync(file, 'utf8')) as InfillSprite[];
    const sprites = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/sprites.json'), 'utf8')).sprites as Record<string, { ay: number }>;
    const atlas = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/atlas.json'), 'utf8')) as { textures: { frames: { filename: string; spriteSourceSize: { y: number } }[] }[] };
    const frames = new Map(atlas.textures.flatMap((t) => t.frames.map((f) => [f.filename, f.spriteSourceSize.y] as const)));
    for (const style of ['warm', 'cool'] as const) for (const cls of HEIGHT_CLASSES) expect(cat.some((c) => c.style === style && c.cls === cls), `${style} ${cls}`).toBe(true);
    for (const c of cat) {
      expect(c.h, c.name).toBeLessThanOrEqual(CLASS_MAX_PX[c.cls]);
      expect(sprites[c.name], c.name).toBeTruthy();
      // The listed height is what the drawing reaches above its anchor (its trimmed top, atlas.json).
      expect(c.h, c.name).toBeGreaterThanOrEqual(sprites[c.name].ay - (frames.get(c.name) ?? 0) - 1);
    }
  });
});

describe('traffic lights (signalPhase)', () => {
  it('never shows green both ways, cycles green → amber → red, and is the same for the same junction and time', () => {
    for (const node of [0, 1, 7, 42])
      for (let t = 0; t < SIGNAL_CYCLE_MS * 2; t += 250) {
        const p = signalPhase(node, t);
        expect(p.ns === 'r' || p.ew === 'r', `${node} @ ${t}`).toBe(true);
        expect(signalPhase(node, t)).toEqual(p);
      }
    const seen = new Set<string>();
    for (let t = 0; t < SIGNAL_CYCLE_MS; t += 100) seen.add(signalPhase(3, t).ns);
    expect([...seen].sort()).toEqual(['a', 'g', 'r']);
    expect(signalPhase(0, 0)).not.toEqual(signalPhase(1, 0)); // junctions don't all change together
  });
});

describe('the infill pages (ShelfPacker)', () => {
  it('hands out non-overlapping slots, reuses freed room and stops at its page limit', () => {
    const p = new ShelfPacker(256, 1);
    const slots = Array.from({ length: 40 }, (_, i) => p.alloc(20 + (i % 3) * 10, 30 + (i % 4) * 8)).filter((s) => !!s);
    for (const a of slots)
      for (const b of slots) if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    for (const s of slots) expect(s.x + s.w <= 256 && s.y + s.h <= 256).toBe(true);
    let full = 0;
    while (p.alloc(40, 40) && full < 1000) full++;
    expect(p.alloc(40, 40)).toBeUndefined();
    p.free(slots[0]);
    expect(p.alloc(slots[0].w, slots[0].h)).toBeDefined();
    expect(p.pages).toBe(1);
  });
});
