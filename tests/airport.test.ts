import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { AIRPORT_H, AIRPORT_W, airportLayout, airportLevel, flightPlan, practitioners, STAGES, stageHint, stageOpen } from '@/world/airport';
import { TIER_XP } from '@/world/places';
import { FACTS } from '@/world/regions';
import { terrainFor } from '@/world/terrain';
import { zonesFor } from '@/world/regions';
import { somePlans } from './support/plans';

// The airport: runway and tower everywhere, a terminal and a cargo hangar that open as buildings reach Practitioner.
const atlas = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/sprites.json'), 'utf8')) as { sprites: Record<string, unknown> };
const progress = (ids: string[], xp = TIER_XP[2], region = 'us-west-2'): Progress =>
  ({ landmarks: {}, cities: { [region]: { landmarks: Object.fromEntries(ids.map((id) => [id, { discovered: true, xp }])) } }, updatedAt: '' }) as unknown as Progress;
const site = { x: 45, y: 10, w: AIRPORT_W, h: AIRPORT_H };

describe('airport', () => {
  it('counts Practitioner buildings in this city only', () => {
    expect(practitioners(progress(['lambda', 's3', 'ec2']), 'us-west-2')).toBe(3);
    expect(practitioners(progress(['lambda', 's3', 'ec2'], TIER_XP[2] - 1), 'us-west-2')).toBe(0);
    expect(practitioners(progress(['lambda', 's3', 'ec2']), 'eu-west-1')).toBe(0);
  });

  it('opens the terminal at 3 and the hangar at 6, and says how far off they are', () => {
    const [terminal, hangar] = STAGES;
    const p = progress(['lambda', 's3', 'ec2']);
    expect(stageOpen(p, terminal, 'us-west-2')).toBe(true);
    expect(stageOpen(p, hangar, 'us-west-2')).toBe(false);
    expect(stageHint(p, hangar, 'us-west-2')).toBe("3 more buildings at Practitioner, or the hub's level 2 side jobs, to open the Cargo Hangar");
    // Level 1 (the floor of 3 Practitioner buildings): the terminal opens and a sorting shed stands in the hangar's slot.
    const pieces = airportLayout(site, p, 'us-west-2');
    expect(pieces.find((x) => x.stage?.id === 'terminal')?.sprite).toBe('air:terminal');
    expect(pieces.find((x) => x.stage?.id === 'hangar')?.sprite).toBe('air:sort');
    expect(airportLayout(site, progress([]), 'us-west-2').find((x) => x.stage?.id === 'hangar')?.sprite).toBe('air:hangar:locked');
  });

  it('grows with the Amazon Air hub\'s side jobs: level 3 only from them, every level\'s sprites in the atlas', () => {
    for (const level of [0, 1, 2, 3]) {
      const p = { ...progress([]), clients: { airport: { level, done: [] } } } as Progress;
      expect(airportLevel(p, 'us-west-2')).toBe(level);
      for (const piece of airportLayout(site, p, 'us-west-2')) expect(atlas.sprites[piece.sprite], `${level} ${piece.sprite}`).toBeTruthy();
    }
    const top = { ...progress([]), clients: { airport: { level: 3, done: [] } } } as Progress;
    expect(airportLayout(site, top, 'us-west-2').map((x) => x.sprite)).toEqual(expect.arrayContaining(['air:tower:3', 'air:terminal:3', 'air:stand:3', 'air:hangar:3', 'air:rwyEndW:3', 'air:taxi:sign']));
    // Lots of learning alone stops at level 2.
    expect(airportLevel(progress(['lambda', 's3', 'ec2', 'sqs', 'dynamodb', 'vpc', 'rds']), 'us-west-2')).toBe(2);
  });

  it('lays out inside its site with nothing overlapping, every sprite in the atlas', () => {
    for (const p of [progress([]), progress(['lambda', 's3', 'ec2', 'sqs', 'dynamodb', 'vpc'])]) {
      const used = new Set<string>();
      for (const piece of airportLayout(site, p, 'us-west-2')) {
        expect(atlas.sprites[piece.sprite], piece.sprite).toBeTruthy();
        for (let y = piece.y; y < piece.y + piece.h; y++)
          for (let x = piece.x; x < piece.x + piece.w; x++) {
            expect(x >= site.x && y >= site.y && x < site.x + site.w && y < site.y + site.h, piece.sprite).toBe(true);
            expect(used.has(`${x},${y}`), `${piece.sprite} overlaps`).toBe(false);
            used.add(`${x},${y}`);
          }
      }
    }
  });

  it('the jet lands, taxis to the stand, and leaves from the runway', () => {
    const plan = flightPlan(site);
    expect(plan.map((l) => l.phase)).toEqual(['approach', 'roll', 'taxi', 'unload', 'taxi', 'takeoff']);
    for (let i = 1; i < plan.length; i++) expect(plan[i].path[0]).toEqual(plan[i - 1].path.at(-1));
  });

  it('every Region with room has a site clear of props, roads, the park and the AZ islands, the same each time', () => {
    let sited = 0;
    // The same each time: checked on a few Regions (terrain.test.ts checks the whole terrain is deterministic).
    for (const code of ['us-east-1', 'eu-west-1', 'ap-southeast-2']) expect(terrainFor(code).airport, code).toEqual(terrainFor(code).airport);
    for (const code of Object.keys(FACTS.regions)) {
      const t = terrainFor(code);
      const a = t.airport;
      if (!a) continue;
      sited++;
      const inA = (x: number, y: number) => x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h;
      // Collected and checked once per Region (an expect per tile made this the suite's slowest test).
      const clash: string[] = [];
      for (const p of t.props) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (inA(x, y)) clash.push(p.sprite);
      for (const r of [...t.roads, ...t.highway]) if (inA(r.x, r.y)) clash.push('road');
      if (t.park) for (let y = t.park.y; y < t.park.y + t.park.h; y++) for (let x = t.park.x; x < t.park.x + t.park.w; x++) if (inA(x, y)) clash.push('park');
      for (const r of Object.values(t.reserved)) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (inA(x, y)) clash.push('island');
      expect(clash, code).toEqual([]);
    }
    expect(sited / Object.keys(FACTS.regions).length).toBeGreaterThan(0.9);
  }, 30_000);
});

describe.each(somePlans().map((s) => [s.name, s] as const))('the airport beside the real streets of %s', (_n, s) => {
  it('when there is room, its site is open land off the highway and away from the park', () => {
    const p = s.plan;
    const t = terrainFor(s.region, zonesFor(s.region), [], p);
    const a = t.airport;
    if (!a) return;
    for (let y = a.y; y < a.y + a.h; y++)
      for (let x = a.x; x < a.x + a.w; x++) {
        expect(['land', 'field', 'forest', 'beach'], `${x},${y}`).toContain(t.kind(x, y));
        expect(Math.abs(y - p.gate.y) > 1 || x < p.size).toBe(true);
        if (t.park) expect(x >= t.park.x && y >= t.park.y && x < t.park.x + t.park.w && y < t.park.y + t.park.h).toBe(false);
      }
  });
});
