// A rasterised plan → shared/city-maps/<code>.json (pure). The format (v 1), all tiles core-local unless stated:
//   streets   [axis, at, from, to, width, cls, syn?]: axis "x" runs along x at y = at, "y" along y at x = at; width 1|2
//             (2 covers at and at + 1); cls 6 motorway … 1 residential, 0 synthetic; syn 1 when the street isn't in OSM.
//   square/day1/campus   top-left of each 12×12 superblock.
//   water/green          masks over the whole (core + 2·ring)² map, rows top → bottom joined by "."; each row is
//                        base-36 run lengths alternating 0,1 starting with 0, comma-separated. green = parks.
//   density              16×16 chars '0'..'3', one per 4×4 core cell (buildings per hectare).
//   bearing, rot         a point's east/north metres (after subtracting `shift`) are turned bearing° + rot·90°
//                        counter-clockwise, divided by mpt, and put at the map's centre (x east, y down).
import { C0, CORE, N, RING } from './rasterise.mjs';

export const ATTRIBUTION = '© OpenStreetMap contributors';
export const LICENCE = 'ODbL-1.0';

/** Run-length encode an n×n mask (see above). */
export function rle(mask, n = N) {
  const rows = [];
  for (let y = 0; y < n; y++) {
    const runs = [];
    let v = 0;
    let k = 0;
    for (let x = 0; x < n; x++) {
      const m = mask[y * n + x] ? 1 : 0;
      if (m === v) k++;
      else {
        runs.push(k);
        v ^= 1;
        k = 1;
      }
    }
    runs.push(k);
    rows.push(runs.map((r) => r.toString(36)).join(','));
  }
  return rows.join('.');
}

/** The mask back from rle() (Uint8Array n×n); throws on a malformed row. */
export function unrle(s, n = N) {
  const rows = s.split('.');
  if (rows.length !== n) throw new Error(`expected ${n} rows, got ${rows.length}`);
  const out = new Uint8Array(n * n);
  rows.forEach((row, y) => {
    let x = 0;
    let v = 0;
    for (const r of row.split(',')) {
      const k = parseInt(r, 36);
      if (!(k >= 0)) throw new Error(`bad run "${r}" in row ${y}`);
      for (let i = 0; i < k; i++) out[y * n + x + i] = v;
      x += k;
      v ^= 1;
    }
    if (x !== n) throw new Error(`row ${y} covers ${x} tiles, not ${n}`);
  });
  return out;
}

/** The file for one Region. `meta` = { region, city, centre: [lat, lon], fetched, source }. */
export function encodeMap(plan, meta) {
  const loc = (v) => v - C0;
  const streets = plan.lines
    .slice()
    .sort((a, b) => (a.axis < b.axis ? -1 : a.axis > b.axis ? 1 : a.pos - b.pos || a.from - b.from))
    .map((l) => {
      const s = [l.axis, loc(l.pos), loc(l.from), loc(l.to), l.w, l.syn ? 0 : l.cls];
      if (l.syn) s.push(1);
      return s;
    });
  const rect = (id) => {
    const r = plan.rects.find((q) => q.id === id);
    return [loc(r.x), loc(r.y)];
  };
  const m = plan.metrics;
  return {
    v: 1,
    region: meta.region,
    city: meta.city,
    centre: meta.centre,
    shift: plan.shift.map((v) => Math.round(v)),
    mpt: plan.mpt,
    bearing: +plan.bearing.toFixed(1),
    rot: plan.rot,
    core: CORE,
    ring: RING,
    streets,
    square: rect('square'),
    day1: rect('day1'),
    campus: rect('campus'),
    water: rle(plan.water),
    green: rle(plan.green),
    density: plan.density,
    quality: { fidelity: m.fidelity, dropped: m.dropped, synthetic: m.synthetic, lots: m.lots },
    attribution: ATTRIBUTION,
    licence: LICENCE,
    fetched: meta.fetched,
    source: meta.source,
  };
}
