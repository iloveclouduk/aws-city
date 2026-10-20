import { describe, expect, it, vi } from 'vitest';
import { findPath } from '@/game/pathfinding';
import { isZebra, RoadGraph } from '@/game/RoadGraph';
import { GRID, isRoad, LANDMARKS, UNPLACED_SERVICES } from '@/world/layout';
import { cityPlanFor, crossings, legacyForced, legacyPlan, needsRestart, realPlan, roadFromStreets, type CityPlan, type Street } from '@/world/plan';
import { zonesFor } from '@/world/regions';
import { DISTRICTS, SERVICES } from '@/world/taxonomy';
import { EXT, terrainFor } from '@/world/terrain';
import { decodeCityMap, decodeMask, encodeMask, mappedRegions } from '@/world/citymap';
import { zonePlan } from '@/world/zoning';
import { samplePlans } from './support/plans';

// Zoning a tight real map (several fallback efforts, a few hundred ms each) runs many times per test under a busy suite.
vi.setConfig({ testTimeout: 30_000 });

const plan = legacyPlan();
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the legacy city plan', () => {
  it('is today’s 3×3 city: 40×40, eight streets, sixteen junctions, the layout’s landmarks', () => {
    expect(plan.id).toBe('legacy');
    expect(plan.size).toBe(GRID);
    expect(plan.streets).toHaveLength(8);
    expect(crossings(plan.streets)).toHaveLength(16);
    expect(plan.landmarks).toBe(LANDMARKS);
    for (const side of ['N', 'W', 'S', 'E'] as const) expect(plan.edgeLines[side]).toEqual([0, 13, 26, 39]);
  });

  it('roadAt agrees with isRoad on every core tile, and junctions are where streets cross', () => {
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const r = plan.roadAt(x, y);
        expect(!!r, `${x},${y}`).toBe(isRoad({ x, y }));
        if (r) expect(r.axis === 'junction').toBe(x % 13 === 0 && y % 13 === 0);
      }
    expect(plan.roadAt(-1, 0)).toBeUndefined();
    expect(plan.roadAt(GRID, 0)).toBeUndefined();
  });

  it('gives every service it has room for a lot (a global one at the Global Gate); the rest are not in the classic city', () => {
    // The 3×3 city has six lots a district and no plot for the seventh (management): it keeps the first six of each
    // district in world.json order (a later one takes a lot a global service left open), and leaves the rest out.
    for (const s of SERVICES) {
      const l = plan.landmarkLayout(s.id);
      expect(!!l, s.id).toBe(!UNPLACED_SERVICES.includes(s.id));
      if (!l) continue;
      if (l.global) expect(overlap(l.footprint, plan.campus), s.id).toBe(true);
      else expect(overlap(l.footprint, plan.districts[s.districtId]!.bbox), s.id).toBe(true);
    }
    expect(plan.districts.management).toBeUndefined();
    for (const s of SERVICES.filter((x) => x.districtId === 'management')) expect(UNPLACED_SERVICES, s.id).toContain(s.id);
    // Every district with a plot fills its six lots (its global services stand at the Global Gate, and the next
    // services take the lots they left open).
    for (const d of DISTRICTS.filter((x) => plan.districts[x.id])) {
      const local = SERVICES.filter((s) => s.districtId === d.id && !plan.globalLandmarks.some((g) => g.id === s.id));
      expect(local.filter((s) => !UNPLACED_SERVICES.includes(s.id)).length, d.id).toBe(Math.min(6, local.length));
    }
  });

  it('has no overlapping footprints, none on a road, all inside the core', () => {
    const seen = new Map<string, string>();
    for (const l of plan.landmarks) {
      const f = l.footprint;
      for (let y = f.y; y < f.y + f.h; y++)
        for (let x = f.x; x < f.x + f.w; x++) {
          const k = `${x},${y}`;
          expect(seen.get(k), `${l.id} on ${seen.get(k)} at ${k}`).toBeUndefined();
          seen.set(k, l.id);
          expect(plan.isRoad({ x, y }), `${l.id} at ${k}`).toBe(false);
          expect(plan.isFootprint(x, y)).toBe(true);
          expect(x >= 0 && y >= 0 && x < plan.size && y < plan.size).toBe(true);
        }
    }
  });

  it('has the superblocks: the Town Square, the Day 1 Quarter and the campus, apart from each other and the districts', () => {
    const blocks = [plan.square, plan.day1, plan.campus, ...Object.values(plan.districts).map((d) => d.bbox)];
    expect(plan.plotAt({ x: plan.square.x + 1, y: plan.square.y + 1 })).toBe('square');
    expect(plan.plotAt({ x: plan.day1.x + 1, y: plan.day1.y + 1 })).toBe('day1');
    expect(plan.plotAt({ x: plan.campus.x + 1, y: plan.campus.y + 1 })).toBe('campus');
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) expect(overlap(blocks[i], blocks[j])).toBe(false);
    for (const d of Object.values(plan.districts)) for (const lot of d.lots) expect(overlap(lot, d.bbox)).toBe(true);
  });

  it('reaches every work spot on foot from the gate', () => {
    const walk = (x: number, y: number) => !plan.isFootprint(x, y);
    for (const l of plan.landmarks) {
      const path = findPath(plan.gate, l.workSpot, plan.size, plan.size, walk);
      expect(path.length, l.id).toBeGreaterThan(0);
    }
  });

  it('is deterministic: one plan object, kept by every Region without a baked map', () => {
    expect(legacyPlan()).toBe(plan);
    expect(cityPlanFor('eu-west-1')).toBe(cityPlanFor('eu-west-1'));
    for (const code of ['us-gov-west-1', 'xx-nowhere-1']) if (!mappedRegions().includes(code)) expect(cityPlanFor(code)).toBe(plan);
  });

  it('gives n AZ islands slots on its edge roads', () => {
    for (let n = 1; n <= 6; n++) {
      const slots = plan.azSlots(n);
      expect(slots).toHaveLength(n);
      for (const s of slots) expect(plan.edgeLines[s[0] as 'N' | 'W']).toContain(Number(s.slice(1)));
    }
  });
});

describe('switching Region', () => {
  const other: CityPlan = { ...plan, id: 'other' };
  it('restarts the scene only when the plan changes', () => {
    expect(needsRestart(undefined, plan)).toBe(false);
    expect(needsRestart(plan, plan)).toBe(false);
    expect(needsRestart(plan, legacyPlan())).toBe(false);
    expect(needsRestart(plan, other)).toBe(true);
  });
});

describe('a plan built from streets (what later Regions use)', () => {
  // A 20×20 core: a 2-tile avenue along x at y = 9..10, streets round the edge and one along y at x = 9.
  const streets: Street[] = [
    { axis: 'x', at: 0, from: 0, to: 19, width: 1 },
    { axis: 'x', at: 9, from: 0, to: 19, width: 2 },
    { axis: 'x', at: 19, from: 0, to: 19, width: 1 },
    { axis: 'y', at: 0, from: 0, to: 19, width: 1 },
    { axis: 'y', at: 9, from: 0, to: 19, width: 1 },
    { axis: 'y', at: 19, from: 0, to: 19, width: 1 },
  ];
  const roadAt = roadFromStreets(streets, 20);

  it('knows avenues, streets and junctions', () => {
    expect(roadAt(5, 9)).toEqual({ axis: 'x', width: 2 });
    expect(roadAt(5, 10)).toEqual({ axis: 'x', width: 2 });
    expect(roadAt(9, 5)).toEqual({ axis: 'y', width: 1 });
    expect(roadAt(9, 10)).toEqual({ axis: 'junction', width: 2 });
    expect(roadAt(5, 5)).toBeUndefined();
    expect(roadAt(20, 0)).toBeUndefined();
  });

  it('lists the crossings row by row (two tiles where an avenue crosses)', () => {
    const c = crossings(streets);
    expect(c).toHaveLength(12);
    expect(c.slice(0, 3)).toEqual([{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 19, y: 0 }]);
    expect(c.filter((t) => t.x === 9).map((t) => t.y)).toEqual([0, 9, 10, 19]);
  });

  it('puts zebras either side of each junction', () => {
    const small = { ...plan, roadAt } as CityPlan;
    expect(isZebra(9, 8, small)).toBe(true);
    expect(isZebra(9, 11, small)).toBe(true);
    expect(isZebra(9, 5, small)).toBe(false);
    expect(isZebra(1, 9, small)).toBe(true);
    expect(isZebra(9, 9, small)).toBe(false);
  });
});

describe('terrain and roads round a bigger plan', () => {
  // The legacy landmarks on a 64×64 grid of streets every 13 tiles plus the edge: enough to check the ring, the
  // highway and the road graph follow plan.size, plan.gate and plan.edgeLines.
  const lines = [0, 13, 26, 39, 52, 63];
  const streets: Street[] = (['x', 'y'] as const).flatMap((axis) => lines.map((at) => ({ axis, at, from: 0, to: 63, width: 1 as const })));
  const roadAt = roadFromStreets(streets, 64);
  const big: CityPlan = {
    ...plan,
    id: 'big',
    size: 64,
    streets,
    roadAt,
    isRoad: (t) => !!roadAt(t.x, t.y),
    gate: { x: 63, y: 39 },
    edgeLines: { N: lines, W: lines, S: lines, E: lines },
  };
  const t = terrainFor('us-east-1', zonesFor('us-east-1'), [], big);

  it('rings the bigger core', () => {
    expect(t.kind(63, 20)).toBe('core');
    expect(t.kind(64, 20)).toBe('promenade');
    expect(t.highway.at(-1)).toEqual({ x: 63 + EXT, y: 39 });
    expect(t.gate).toEqual({ x: 63, y: 39 });
    for (const b of t.bridges) if (!b.highway) expect(lines).toContain(b.line);
  });

  it('builds one connected road graph from its streets', () => {
    const g = new RoadGraph(t, big);
    expect(g.connected()).toBe(true);
    expect(g.nodes.filter((n) => n.x >= 0 && n.y >= 0 && n.x < 64 && n.y < 64 && n.x % 13 !== 1 && lines.includes(n.x) && lines.includes(n.y))).toHaveLength(36);
    expect(g.nodes[g.gate]).toMatchObject({ x: 63, y: 39 });
  });
});

describe.each(samplePlans().map((s) => [s.name, s] as const))('the real street plan of %s', (_name, s) => {
  const p = s.plan;
  const water = (x: number, y: number) => !!p.isWater?.(x, y);

  it('is a 64×64 real map with its credit', () => {
    expect(p.kind).toBe('osm');
    expect(p.size).toBe(64);
    expect(p.attribution).toBe('© OpenStreetMap contributors');
  });

  it('gives every service a lot: a global one at the Global Gate, the rest in their own district', () => {
    for (const svc of SERVICES) {
      const l = p.landmarkLayout(svc.id);
      expect(l, svc.id).toBeDefined();
      if (l!.global) expect(overlap(l!.footprint, p.campus), svc.id).toBe(true);
      else expect(p.plotAt(l!.footprint), svc.id).toBe(svc.districtId);
    }
    for (const d of Object.keys(p.districts)) expect(p.landmarkLayout(`hq:${d}`), d).toBeDefined();
  });

  it('has no overlapping footprints, none on a road or water, all inside the core', () => {
    const seen = new Map<string, string>();
    for (const l of p.landmarks) {
      const f = l.footprint;
      for (let y = f.y; y < f.y + f.h; y++)
        for (let x = f.x; x < f.x + f.w; x++) {
          const k = `${x},${y}`;
          expect(seen.get(k), `${l.id} on ${seen.get(k)} at ${k}`).toBeUndefined();
          seen.set(k, l.id);
          expect(p.isRoad({ x, y }) || water(x, y), `${l.id} at ${k}`).toBe(false);
          expect(p.isFootprint(x, y)).toBe(true);
        }
    }
    const lots = Object.values(p.districts).flatMap((d) => d.lots);
    for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) expect(overlap(lots[i], lots[j])).toBe(false);
  });

  it('reaches every work spot on foot from the gate, and the gate is on the east edge road', () => {
    expect(p.gate.x).toBe(63);
    expect(p.isRoad(p.gate)).toBe(true);
    const walk = (x: number, y: number) => !p.isFootprint(x, y) && !water(x, y);
    for (const l of p.landmarks) {
      expect(walk(l.workSpot.x, l.workSpot.y), l.id).toBe(true);
      expect(findPath(p.gate, l.workSpot, p.size, p.size, walk).length, l.id).toBeGreaterThan(0);
    }
  });

  it('keeps the superblocks: the square, the Day 1 Quarter and the campus, with today’s insides', () => {
    for (const [id, r] of [['square', p.square], ['day1', p.day1], ['campus', p.campus]] as const) {
      for (const t of [{ x: r.x, y: r.y }, { x: r.x + 11, y: r.y + 11 }]) expect(p.plotAt(t)).toBe(id);
    }
    const plaza = p.landmarkLayout('plaza')!.footprint;
    expect([plaza.x - p.square.x, plaza.y - p.square.y]).toEqual([4, 2]);
    expect([p.fountain.x - p.square.x, p.fountain.y - p.square.y]).toEqual([8, 8]);
    for (const g of p.globalLandmarks) expect(overlap(g.footprint, p.campus)).toBe(true);
    expect(overlap(p.landmarkLayout('day1office')!.footprint, p.day1)).toBe(true);
  });

  it('has room to grow: lots for every service and 20 more, each district at least max(services + 2, 10)', () => {
    expect(p.capacity!).toBeGreaterThanOrEqual(SERVICES.length + 20);
    for (const [d, plot] of Object.entries(p.districts)) {
      const n = SERVICES.filter((x) => x.districtId === d).length;
      expect(plot.lots.length, d).toBeGreaterThanOrEqual(Math.max(n + 2, 10));
    }
  });

  it('is deterministic', () => {
    const again = zonePlan(decodeCityMap(s.raw), { id: p.id })!;
    expect(JSON.stringify(again.landmarks)).toBe(JSON.stringify(p.landmarks));
    expect(again.azSlots(6)).toEqual(p.azSlots(6));
  });

  it('places a new service, and moves nobody when the map zoned plainly and the district has room for it', () => {
    // A map that zoned plainly (no effort: src/world/zoning.ts) with the district's room to spare (DISTRICT_SPARE kept
    // after the new one) puts the new service on its next lot. A tight map re-zones to fit it, and may move buildings.
    const plain = !!p.zoning && !p.zoning.steal && !p.zoning.split && !p.zoning.alleys && !p.zoning.parks;
    for (const d of DISTRICTS) {
      const more = zonePlan(decodeCityMap(s.raw), { services: [...SERVICES, { id: `fake-${d.id}`, districtId: d.id }] })!;
      expect(more, d.id).toBeDefined();
      expect(more.landmarkLayout(`fake-${d.id}`), d.id).toBeDefined();
      const n = SERVICES.filter((x) => x.districtId === d.id).length;
      if (!plain || p.districts[d.id]!.lots.length < n + 3) continue;
      for (const l of p.landmarks) expect(more.landmarkLayout(l.id)?.footprint, `${l.id} after adding to ${d.id}`).toEqual(l.footprint);
    }
  });

  it('puts n AZ islands on north and west edge streets, apart from each other', () => {
    for (let n = 1; n <= 6; n++) {
      const slots = p.azSlots(n);
      expect(slots).toHaveLength(n);
      expect(new Set(slots).size).toBe(n);
      for (const sl of slots) expect(p.edgeLines[sl[0] as 'N' | 'W']).toContain(Number(sl.slice(1)));
      for (const a of slots) for (const b of slots) if (a !== b && a[0] === b[0]) expect(Math.abs(Number(a.slice(1)) - Number(b.slice(1)))).toBeGreaterThanOrEqual(9);
    }
  });

  it('builds a connected road graph with its landscape', () => {
    const t = terrainFor(s.region, zonesFor(s.region), [], p);
    const g = new RoadGraph(t, p);
    expect(g.connected()).toBe(true);
    expect(g.nodes[g.gate]).toMatchObject(p.gate);
    expect(t.islands).toHaveLength(Math.min(6, zonesFor(s.region).length));
    for (const b of t.bridges) if (!b.highway) expect(p.edgeLines[b.side]).toContain(b.line);
  });
});

describe('a baked map that isn’t right', () => {
  const [s] = samplePlans();
  const raw = s.raw as Record<string, unknown>;
  it('falls back to the legacy city', () => {
    expect(realPlan(undefined)).toBeUndefined();
    expect(realPlan({ ...raw, v: 2 })).toBeUndefined();
    expect(realPlan({ ...raw, water: 'zz' })).toBeUndefined();
    expect(realPlan({ ...raw, streets: (raw.streets as unknown[]).slice(4) })).toBeUndefined(); // no ring road
    expect(realPlan({ ...raw, square: [60, 60] })).toBeUndefined();
    expect(realPlan('nonsense')).toBeUndefined();
    expect(realPlan(raw)?.kind).toBe('osm');
  });

  it('`?map=legacy` keeps the legacy city', () => {
    expect(legacyForced('?map=legacy')).toBe(true);
    expect(legacyForced('?map=osm')).toBe(false);
    expect(legacyForced('')).toBe(false);
  });

  it('reads its masks back exactly', () => {
    const m = new Uint8Array(100 * 100).map((_, i) => ((i * 7) % 13 < 4 ? 1 : 0));
    expect(Array.from(decodeMask(encodeMask(m, 100), 100))).toEqual(Array.from(m));
  });
});
