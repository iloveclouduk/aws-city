// shared/city-maps/<region>.json: street plans baked from OpenStreetMap by `npm run city-maps` (never fetched at
// runtime). These checks re-derive every rule from the files themselves, independently of the generator.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import centres from '../shared/city-centres.json' with { type: 'json' };
import regions from '../shared/regions.json' with { type: 'json' };
import { ringOf } from '@/world/terrain';
import { encodeMap, unrle, rle, type CityMapFile, type Street } from '../scripts/citymap/encode.mjs';
import { parseOsm, rasterise, validate, MPTS } from '../scripts/citymap/rasterise.mjs';

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'shared', 'city-maps');
const CORE = 64;
const SB = 12;
const MIN_BLOCK = 6;

/** The Regions that have a real street map (a change here is a visible regression or addition). */
const MAPPED = [
  'af-south-1',
  'ap-east-1',
  'ap-east-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-south-1',
  'ap-south-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-southeast-4',
  'ap-southeast-5',
  'ap-southeast-6',
  'ap-southeast-7',
  'ca-central-1',
  'ca-west-1',
  'eu-central-1',
  'eu-central-2',
  'eu-north-1',
  'eu-south-1',
  'eu-south-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eusc-de-east-1',
  'il-central-1',
  'me-central-1',
  'me-south-1',
  'mx-central-1',
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-gov-east-1',
  'us-gov-west-1',
  'us-west-1',
  'us-west-2',
] as const;

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const maps: CityMapFile[] = files.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));

const roadGrid = (streets: Street[]) => {
  const g = new Uint8Array(CORE * CORE);
  for (const [axis, at, from, to, w] of streets)
    for (let a = from; a <= to; a++)
      for (let k = 0; k < w; k++) {
        const [x, y] = axis === 'x' ? [a, at + k] : [at + k, a];
        if (x >= 0 && y >= 0 && x < CORE && y < CORE) g[y * CORE + x] = 1;
      }
  return g;
};
const spans = (q: Street, s: Street) => q[2] <= s[1] && q[3] >= s[1] + s[4] - 1;
const onJunction = (s: Street, end: number, streets: Street[]) =>
  streets.some((q) => q !== s && q[0] !== s[0] && q[1] <= end && end <= q[1] + q[4] - 1 && spans(q, s));
const spaced = (ps: number[], gap = 9) => {
  const out: number[] = [];
  for (const p of [...ps].sort((a, b) => a - b)) if (!out.length || p - out[out.length - 1] >= gap) out.push(p);
  return out;
};

describe('shared/city-centres.json', () => {
  it('names a downtown for every Region, each on an OpenStreetMap feature', () => {
    expect(centres.map((c) => c.code).sort()).toEqual(regions.regions.map((r) => r.code).sort());
    for (const c of centres) {
      expect(c.city.length, c.code).toBeGreaterThan(2);
      expect(c.why.length, c.code).toBeGreaterThan(20);
      expect(c.source, c.code).toMatch(/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
      // near the Region's own map point (us-west-2's is Boardman, OR; Portland is ~235 km away)
      const r = regions.regions.find((q) => q.code === c.code)!;
      const km = Math.hypot((c.lat - r.lat) * 111.32, (c.lon - r.lon) * 111.32 * Math.cos((c.lat * Math.PI) / 180));
      expect(km, c.code).toBeLessThan(300);
    }
    expect(new Set(centres.map((c) => `${c.lat},${c.lon}`)).size).toBe(centres.length);
  });
});

describe('shared/city-maps (npm run city-maps)', () => {
  it('maps exactly these Regions', () => {
    expect(files.map((f) => f.replace(/\.json$/, ''))).toEqual([...MAPPED]);
  });

  it('is ODbL data from OpenStreetMap, credited, with its licence beside it', () => {
    const licence = fs.readFileSync(path.join(DIR, 'LICENSE.md'), 'utf8');
    expect(licence).toContain('© OpenStreetMap contributors');
    expect(licence).toContain('https://www.openstreetmap.org/copyright');
    expect(licence).toContain('ODbL');
    for (const m of maps) {
      expect(m.attribution, m.region).toBe('© OpenStreetMap contributors');
      expect(m.licence, m.region).toBe('ODbL-1.0');
      expect(m.fetched, m.region).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.source, m.region).toMatch(/^https:\/\/[a-z.-]+\/api\/interpreter$/);
    }
  });

  it('stays small: ≤ 12 KB each, ≤ 400 KB in all, one compact line', () => {
    let total = 0;
    for (const f of files) {
      const text = fs.readFileSync(path.join(DIR, f), 'utf8');
      expect(Buffer.byteLength(text), f).toBeLessThanOrEqual(12 * 1024);
      expect(text.trimEnd().includes('\n'), f).toBe(false);
      total += Buffer.byteLength(text);
    }
    expect(total).toBeLessThanOrEqual(400 * 1024);
  });

  it('follows the schema', () => {
    const ring = (ringOf(CORE).size - CORE) / 2;
    for (const [i, m] of maps.entries()) {
      const c = centres.find((q) => q.code === m.region)!;
      expect(files[i]).toBe(`${m.region}.json`);
      expect(m.v).toBe(1);
      expect(m.city).toBe(c.city);
      expect(m.centre).toEqual([c.lat, c.lon]);
      expect(MPTS).toContain(m.mpt);
      expect([0, 1, 2, 3]).toContain(m.rot);
      expect(Math.abs(m.bearing)).toBeLessThanOrEqual(45);
      expect(Math.hypot(...m.shift), m.region).toBeLessThanOrEqual(401);
      expect(m.core).toBe(CORE);
      expect(m.ring).toBe(ring);
      const n = CORE + 2 * m.ring;
      for (const mask of [m.water, m.green]) expect(unrle(mask, n).length).toBe(n * n);
      expect(m.density).toMatch(/^[0-3]{256}$/);
      for (const k of ['fidelity', 'dropped', 'synthetic', 'lots'] as const) expect(typeof m.quality[k]).toBe('number');
      expect(m.quality.fidelity).toBeGreaterThan(0.3);
      expect(m.quality.fidelity).toBeLessThanOrEqual(1);
      expect(m.quality.lots, m.region).toBeGreaterThanOrEqual(77);
      for (const s of m.streets) {
        expect(s.length === 6 || (s.length === 7 && s[6] === 1), `${m.region} ${s}`).toBe(true);
        const [axis, at, from, to, w, cls] = s;
        expect(['x', 'y']).toContain(axis);
        expect([1, 2]).toContain(w);
        expect(Number.isInteger(at) && Number.isInteger(from) && Number.isInteger(to)).toBe(true);
        expect(cls >= 0 && cls <= 6 && Number.isInteger(cls)).toBe(true);
        if (s[6] === 1) expect(cls).toBe(0);
      }
    }
  });

  it('every street lies in the core, ends on a junction, and the core edge is a ring road', () => {
    for (const m of maps) {
      for (const s of m.streets) {
        const [, at, from, to, w] = s;
        expect(at >= 0 && at + w - 1 < CORE && from >= 0 && to < CORE && from < to, `${m.region} ${s}`).toBe(true);
        for (const end of [from, to]) expect(onJunction(s, end, m.streets), `${m.region} ${s} at ${end}`).toBe(true);
      }
      for (const [axis, at] of [['x', 0], ['x', CORE - 1], ['y', 0], ['y', CORE - 1]] as const)
        expect(m.streets.some((s) => s[0] === axis && s[1] === at && s[2] === 0 && s[3] === CORE - 1 && s[4] === 1), `${m.region} ring ${axis}${at}`).toBe(true);
    }
  });

  it('is one connected network', () => {
    for (const m of maps) {
      const g = roadGrid(m.streets);
      const seen = new Uint8Array(CORE * CORE);
      const q = [0];
      seen[0] = 1;
      while (q.length) {
        const i = q.pop()!;
        const x = i % CORE;
        const y = (i / CORE) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx;
          const Y = y + dy;
          const j = Y * CORE + X;
          if (X >= 0 && Y >= 0 && X < CORE && Y < CORE && g[j] && !seen[j]) {
            seen[j] = 1;
            q.push(j);
          }
        }
      }
      for (let i = 0; i < g.length; i++) if (g[i]) expect(seen[i], `${m.region} tile ${i % CORE},${(i / CORE) | 0}`).toBe(1);
    }
  });

  it(`leaves blocks of at least ${MIN_BLOCK} tiles between parallel streets`, () => {
    for (const m of maps)
      for (const a of m.streets)
        for (const b of m.streets) {
          if (a === b || a[0] !== b[0] || b[1] < a[1]) continue;
          if (Math.min(a[3], b[3]) - Math.max(a[2], b[2]) < 2) continue; // only meeting on an avenue's width
          expect(b[1] - (a[1] + a[4]), `${m.region} ${a} / ${b}`).toBeGreaterThanOrEqual(MIN_BLOCK);
        }
  });

  it('has three street-free superblocks, each ringed by streets', () => {
    for (const m of maps) {
      const g = roadGrid(m.streets);
      const rects = [m.square, m.day1, m.campus];
      for (const [x0, y0] of rects) {
        expect(x0 >= 1 && y0 >= 1 && x0 + SB <= CORE - 1 && y0 + SB <= CORE - 1, `${m.region} ${x0},${y0}`).toBe(true);
        for (let y = y0; y < y0 + SB; y++) for (let x = x0; x < x0 + SB; x++) expect(g[y * CORE + x], `${m.region} street in superblock at ${x},${y}`).toBe(0);
        for (let k = -1; k <= SB; k++)
          for (const [x, y] of [[x0 + k, y0 - 1], [x0 + k, y0 + SB], [x0 - 1, y0 + k], [x0 + SB, y0 + k]])
            expect(g[y * CORE + x], `${m.region} superblock ${x0},${y0} edge ${x},${y}`).toBe(1);
      }
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++) expect(Math.abs(rects[i][0] - rects[j][0]) >= SB || Math.abs(rects[i][1] - rects[j][1]) >= SB, m.region).toBe(true);
    }
  });

  it('has room for AZ bridges (3+ well-spaced lines to the N and W edges) and the gate (E, in the campus rows)', () => {
    for (const m of maps) {
      const inner = (s: Street) => s[1] > 0 && s[1] + s[4] - 1 < CORE - 1;
      const north = m.streets.filter((s) => s[0] === 'y' && s[2] === 0 && inner(s)).map((s) => s[1]);
      const west = m.streets.filter((s) => s[0] === 'x' && s[2] === 0 && inner(s)).map((s) => s[1]);
      expect(spaced(north).length, `${m.region} N ${north}`).toBeGreaterThanOrEqual(3);
      expect(spaced(west).length, `${m.region} W ${west}`).toBeGreaterThanOrEqual(3);
      const [, cy] = m.campus;
      expect(m.streets.some((s) => s[0] === 'x' && s[3] === CORE - 1 && s[1] >= cy && s[1] < cy + SB && inner(s)), m.region).toBe(true);
    }
  });
});

describe('the generator (scripts/citymap, on a hand-made fixture)', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'osm-mini.json'), 'utf8'));
  const centre = { lat: 50, lon: 10 };
  const run = () => {
    const { pick } = rasterise(parseOsm(fixture, centre));
    expect(pick).not.toBeNull();
    return { pick: pick!, file: encodeMap(pick!, { region: 'test-1', city: 'Testville', centre: [50, 10], fetched: '2026-01-01', source: 'https://example.test/api/interpreter' }) };
  };

  it('parses OSM: multipolygon rings assembled, pitches kept out of the parks', () => {
    const d = parseOsm(fixture, centre);
    expect(d.water).toHaveLength(1); // the lake: a relation of two open ways
    expect(d.water[0]).toHaveLength(1);
    expect(d.park).toHaveLength(1); // the park, not the pitch
    expect(d.rivers).toHaveLength(1);
    expect(d.coast).toHaveLength(1);
    expect(d.roads.some((r) => r.bridge)).toBe(true);
    expect(d.buildings).toHaveLength(60);
  });

  it('keeps every rule and is deterministic', () => {
    const a = run();
    const b = run();
    expect(JSON.stringify(a.file)).toBe(JSON.stringify(b.file));
    expect(validate(a.pick.lines, a.pick.rects)).toEqual([]);
    expect(a.file.quality.lots).toBeGreaterThanOrEqual(77);
    expect(unrle(a.file.water).some((v) => v === 1)).toBe(true); // the river, the lake, the sea
    expect(rle(unrle(a.file.green))).toBe(a.file.green);
    const digest = createHash('sha256').update(JSON.stringify(a.file)).digest('hex').slice(0, 16);
    expect({ mpt: a.file.mpt, bearing: a.file.bearing, rot: a.file.rot, square: a.file.square, streets: a.file.streets.length, digest }).toMatchInlineSnapshot(`
      {
        "bearing": -10.5,
        "digest": "21d77c23bb179aa5",
        "mpt": 20,
        "rot": 0,
        "square": [
          30,
          20,
        ],
        "streets": 28,
      }
    `);
  });
});
