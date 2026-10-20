// OpenStreetMap → a city plan on tiles (pure: no I/O, no randomness; the same input always gives the same plan).
//
// The map is a CORE×CORE downtown with a RING-tile landscape round it (N = CORE + 2·RING tiles a side). Streets are
// straight lines along the tile axes: the map is turned by the city's dominant street bearing so most real streets
// snap to an axis; oblique main roads become staircases; long avenues (primary/trunk, long secondary) are 2 tiles wide.
// Rules the plan always keeps (validate() checks them, tests/city-maps.test.ts too):
//  - the core edge is a ring road (width 1); every street lies inside the core and both its ends sit on a junction;
//  - all roads form one connected network;
//  - parallel streets that run side by side (spans sharing more than OVERLAP) leave blocks of at least MIN_BLOCK tiles;
//  - three 12×12 superblocks (Town Square, Day 1, campus), each ringed by streets and with no street inside;
//  - at least 3 lines reach the north and the west edges (AZ bridges) and one reaches the east edge in the campus's
//    rows (the Region gate).
//
// Coordinates: full-map tiles 0..N-1 (x east-ish, y south-ish); the core is C0..C1-1. encode.mjs makes them core-local.

export const CORE = 64;
/** Terrain ring width round the core: src/world/terrain.ts EXT (ringOf(64).size === CORE + 2 * RING). */
export const RING = 18;
export const N = CORE + 2 * RING;
export const C0 = RING;
export const C1 = RING + CORE; // exclusive
export const MIN_BLOCK = 6;
/**
 * Parallel streets count as side by side when their spans share more than an avenue's width (two streets that both
 * end on the same avenue share its two tiles: no block lies between them there).
 */
export const OVERLAP = 2;
export const SB = 12; // superblock side
const SYN_GAP = 16;
export const MPTS = [20, 25, 30, 35];
export const MIN_LOTS = 77;
const S22 = Math.sin((22.5 * Math.PI) / 180);

/** OSM highway class → plan class (6 motorway … 1 residential; 0 is synthetic). */
export const CLS = { motorway: 6, trunk: 5, primary: 4, secondary: 3, tertiary: 2, unclassified: 1, residential: 1, living_street: 1, pedestrian: 1 };
/** How much each class counts when ranking streets and measuring fidelity. */
const CLS_W = { motorway: 6, trunk: 5, primary: 4, secondary: 3, tertiary: 2, unclassified: 1, residential: 1, living_street: 0.6, pedestrian: 0.6 };
const PARK = (t) => /^(park|garden)$/.test(t.leisure || '') || /^(recreation_ground|cemetery|forest)$/.test(t.landuse || '') || t.natural === 'wood';
const WATER = (t) => t.natural === 'water' || t.waterway === 'riverbank';
const yes = (v) => !!v && v !== 'no';

// ------------------------------------------------------------------------------------------------ OSM → metres

/**
 * Parse Overpass JSON into metres east/north of the centre. Parks are parks, gardens, recreation grounds, cemeteries
 * and woods (grass verges and sports pitches are left out). Multipolygon rings are assembled; unclosed ones dropped.
 */
export function parseOsm(json, centre) {
  const kx = 111320 * Math.cos((centre.lat * Math.PI) / 180);
  const P = (g) => [(g.lon - centre.lon) * kx, (g.lat - centre.lat) * 111320];
  const geo = (arr) => (arr || []).filter((g) => g && g.lat != null).map(P);
  const d = { roads: [], coast: [], rivers: [], water: [], park: [], buildings: [] };
  for (const el of json.elements || []) {
    const t = el.tags || {};
    if (el.type === 'way' && el.center && !el.geometry) {
      d.buildings.push(P(el.center));
      continue;
    }
    if (el.type === 'way' && el.geometry) {
      const pts = geo(el.geometry);
      if (pts.length < 2) continue;
      if (t.highway) d.roads.push({ cls: t.highway, pts, tunnel: yes(t.tunnel) || t.covered === 'yes', bridge: yes(t.bridge) });
      else if (t.natural === 'coastline') d.coast.push(pts);
      else if (t.waterway === 'river' || t.waterway === 'canal') {
        if (!yes(t.tunnel)) d.rivers.push({ pts, widthM: parseFloat(t.width) || (t.waterway === 'river' ? 40 : 15) });
      } else if (WATER(t)) {
        if (closed(pts)) d.water.push([pts]);
      } else if (PARK(t) && closed(pts)) d.park.push([pts]);
    } else if (el.type === 'relation') {
      const lines = (el.members || []).filter((m) => m.type === 'way' && m.geometry).map((m) => geo(m.geometry)).filter((l) => l.length > 1);
      const rings = assemble(lines);
      if (!rings.length) continue;
      if (WATER(t)) d.water.push(rings);
      else if (PARK(t)) d.park.push(rings);
    }
  }
  return d;
}
const eq = (a, b) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
const closed = (p) => p.length > 3 && eq(p[0], p[p.length - 1]);
/** Join a multipolygon's member ways into closed rings (unclosed ones are rejected). */
export function assemble(lines) {
  const open = lines.map((l) => l.slice());
  const rings = [];
  while (open.length) {
    let cur = open.pop();
    let changed = true;
    while (!closed(cur) && changed) {
      changed = false;
      for (let i = 0; i < open.length; i++) {
        const l = open[i];
        const a = cur[0];
        const z = cur[cur.length - 1];
        if (eq(z, l[0])) cur = cur.concat(l.slice(1));
        else if (eq(z, l[l.length - 1])) cur = cur.concat(l.slice().reverse().slice(1));
        else if (eq(a, l[l.length - 1])) cur = l.concat(cur.slice(1));
        else if (eq(a, l[0])) cur = l.slice().reverse().concat(cur.slice(1));
        else continue;
        open.splice(i, 1);
        changed = true;
        break;
      }
    }
    if (closed(cur)) rings.push(cur);
  }
  return rings;
}

// ------------------------------------------------------------------------------------------------ geometry

/** The dominant street bearing within 1.5 km of the centre, as the turn (degrees, counter-clockwise) that aligns it. */
export function dominantBearing(roads) {
  const h = new Float64Array(90);
  for (const r of roads) {
    const w = CLS_W[r.cls] || 0;
    if (!w || r.tunnel) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [x1, y1] = r.pts[i];
      const [x2, y2] = r.pts[i + 1];
      if (Math.hypot(x1, y1) > 1500) continue;
      const L = Math.hypot(x2 - x1, y2 - y1);
      let a = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      a = ((a % 90) + 90) % 90;
      h[Math.floor(a) % 90] += L * w;
    }
  }
  let best = 0;
  let bi = 0;
  for (let i = 0; i < 90; i++) {
    let s = 0;
    for (let k = -4; k <= 4; k++) s += h[(i + k + 90) % 90] * (1 - Math.abs(k) / 5);
    if (s > best) {
      best = s;
      bi = i;
    }
  }
  const theta = bi + 0.5;
  return theta <= 45 ? -theta : 90 - theta;
}

/**
 * Metres (east, north of the centre) → map tiles: shift, turn by bearing + rot·90° counter-clockwise, scale. `scale`
 * draws previews at several pixels a tile. f.inv(u, v) goes back to metres.
 */
export function makeXf(bearing, rot, shift, mpt, scale = 1) {
  const r = ((bearing + rot * 90) * Math.PI) / 180;
  const cs = Math.cos(r);
  const sn = Math.sin(r);
  const f = ([x, y]) => {
    const a = x - shift[0];
    const b = y - shift[1];
    const xr = a * cs - b * sn;
    const yr = a * sn + b * cs;
    return [(xr / mpt + N / 2) * scale, (-yr / mpt + N / 2) * scale];
  };
  f.inv = (u, v) => {
    const xr = (u - N / 2) * mpt;
    const yr = -(v - N / 2) * mpt;
    return [xr * cs + yr * sn + shift[0], -xr * sn + yr * cs + shift[1]];
  };
  return f;
}

/** Fill each polygon (a list of rings, even-odd) on its own, so overlapping polygons never cancel each other out. */
export function fillPolys(polys, n, set) {
  for (const rings of polys) fillPoly(rings, n, set);
}
function fillPoly(rings, n, set) {
  const segs = [];
  let ymin = Infinity;
  let ymax = -Infinity;
  let xmin = Infinity;
  let xmax = -Infinity;
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      ymin = Math.min(ymin, a[1]);
      ymax = Math.max(ymax, a[1]);
      xmin = Math.min(xmin, a[0]);
      xmax = Math.max(xmax, a[0]);
      if (a[1] !== b[1]) segs.push(a[1] < b[1] ? [a, b] : [b, a]);
    }
  if (ymax < 0 || xmax < 0 || ymin > n || xmin > n) return;
  const Y0 = Math.max(0, Math.floor(ymin));
  const Y1 = Math.min(n - 1, Math.ceil(ymax));
  const rows = Array.from({ length: Y1 - Y0 + 1 }, () => []);
  for (const s of segs) {
    const y0 = Math.max(Y0, Math.ceil(s[0][1] - 0.5));
    const y1 = Math.min(Y1, Math.ceil(s[1][1] - 0.5) - 1);
    for (let y = y0; y <= y1; y++) rows[y - Y0].push(s);
  }
  for (let y = Y0; y <= Y1; y++) {
    const yc = y + 0.5;
    const xs = [];
    for (const [a, b] of rows[y - Y0]) if (yc >= a[1] && yc < b[1]) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(xs[i] - 0.5));
      const x1 = Math.min(n - 1, Math.ceil(xs[i + 1] - 0.5) - 1);
      for (let x = x0; x <= x1; x++) set(x, y);
    }
  }
}

export function stampLine(a, b, radius, n, set, step = 0.1) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k = Math.max(1, Math.ceil(L / step));
  const r = Math.max(0, radius);
  const ri = Math.ceil(r);
  for (let i = 0; i <= k; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / k;
    const y = a[1] + ((b[1] - a[1]) * i) / k;
    if (x < -ri - 1 || y < -ri - 1 || x > n + ri || y > n + ri) continue;
    if (r < 0.5) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      if (xi >= 0 && yi >= 0 && xi < n && yi < n) set(xi, yi);
      continue;
    }
    for (let dy = -ri; dy <= ri; dy++)
      for (let dx = -ri; dx <= ri; dx++) {
        const xi = Math.floor(x) + dx;
        const yi = Math.floor(y) + dy;
        if (xi < 0 || yi < 0 || xi >= n || yi >= n) continue;
        if (Math.hypot(xi + 0.5 - x, yi + 0.5 - y) <= r) set(xi, yi);
      }
  }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Water on an n×n grid: lakes and riverbanks filled, rivers stamped at their width, and the sea found from the
 * coastline (OSM draws land on the left): the barrier splits the grid into parts, and each part is sea when more
 * right-hand than left-hand samples fall in it.
 */
export function waterMask(d, xf, n, mpt, scale = 1) {
  const m = new Uint8Array(n * n);
  fillPolys(d.water.map((rs) => rs.map((r) => r.map(xf))), n, (x, y) => (m[y * n + x] = 1));
  for (const r of d.rivers) {
    const rad = Math.max(0.5 * scale, (r.widthM / mpt / 2) * scale);
    for (let i = 0; i + 1 < r.pts.length; i++) stampLine(xf(r.pts[i]), xf(r.pts[i + 1]), rad, n, (x, y) => (m[y * n + x] = 1), 0.3);
  }
  if (d.coast.length) {
    const bar = new Uint8Array(n * n);
    const wv = [];
    const lv = [];
    const off = (0.9 * mpt) / scale;
    for (const line of d.coast)
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i];
        const b = line[i + 1];
        stampLine(xf(a), xf(b), 0, n, (x, y) => (bar[y * n + x] = 1), 0.1);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1e-6) continue;
        const nx = (b[1] - a[1]) / L;
        const ny = -(b[0] - a[0]) / L;
        const k = Math.max(1, Math.ceil(L / (mpt / scale)));
        for (let s = 0; s < k; s++) {
          const t = (s + 0.5) / k;
          const px = a[0] + (b[0] - a[0]) * t;
          const py = a[1] + (b[1] - a[1]) * t;
          wv.push(xf([px + nx * off, py + ny * off]));
          lv.push(xf([px - nx * off, py - ny * off]));
        }
      }
    const comp = new Int32Array(n * n).fill(-1);
    let nc = 0;
    const q = new Int32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      if (bar[i] || comp[i] >= 0) continue;
      let h = 0;
      let t = 0;
      q[t++] = i;
      comp[i] = nc;
      while (h < t) {
        const c = q[h++];
        const x = c % n;
        const y = (c / n) | 0;
        for (const [dx, dy] of DIRS) {
          const X = x + dx;
          const Y = y + dy;
          if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
          const j = Y * n + X;
          if (!bar[j] && comp[j] < 0) {
            comp[j] = nc;
            q[t++] = j;
          }
        }
      }
      nc++;
    }
    const votes = new Float64Array(nc * 2);
    const vote = (p, k) => {
      const x = Math.floor(p[0]);
      const y = Math.floor(p[1]);
      if (x < 0 || y < 0 || x >= n || y >= n) return;
      const c = comp[y * n + x];
      if (c >= 0) votes[c * 2 + k]++;
    };
    wv.forEach((p) => vote(p, 0));
    lv.forEach((p) => vote(p, 1));
    const sea = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) if (comp[i] >= 0 && votes[comp[i] * 2] > votes[comp[i] * 2 + 1]) sea[i] = 1;
    for (let i = 0; i < n * n; i++)
      if (bar[i]) {
        const x = i % n;
        const y = (i / n) | 0;
        let s = 0;
        let k = 0;
        for (const [dx, dy] of DIRS) {
          const X = x + dx;
          const Y = y + dy;
          if (X < 0 || Y < 0 || X >= n || Y >= n || bar[Y * n + X]) continue;
          k++;
          s += sea[Y * n + X];
        }
        if (k && s * 2 >= k) sea[i] = 1;
      }
    for (let i = 0; i < n * n; i++) if (sea[i]) m[i] = 1;
  }
  return m;
}
const coreFrac = (mask) => {
  let s = 0;
  for (let y = C0; y < C1; y++) for (let x = C0; x < C1; x++) s += mask[y * N + x] ? 1 : 0;
  return s / (CORE * CORE);
};

// ------------------------------------------------------------------------------------------------ candidates

const RANK = { motorway: 6, trunk: 5, primary: 4, secondary: 3, tertiary: 2, unclassified: 1, residential: 1, living_street: 1, pedestrian: 1 };

/**
 * Real streets as axis-aligned candidate lines: runs of near-axis segments (within 22.5°) become lines; oblique runs of
 * main roads (secondary and up, or bridges) become staircases of steps at least 7 tiles long. Collinear pieces merge,
 * so a long avenue outranks a short side street. Bridges count double (a river city is its bridges).
 */
export function candidates(d, xf) {
  const out = [];
  for (const r of d.roads) {
    const w = CLS_W[r.cls];
    if (!w || r.tunnel) continue;
    const rank = RANK[r.cls];
    const bw = r.bridge ? 2 : 1;
    const pts = r.pts.map(xf);
    let run = null;
    const flush = () => {
      if (!run) return;
      if (run.ax === 'D') {
        if (run.len >= 10 && (rank >= 3 || (r.bridge && rank >= 2))) out.push(...staircase(run.start, run.end, run.len * w * bw, rank));
      } else out.push({ axis: run.ax, at: run.perp / run.len, from: run.min, to: run.max, weight: run.len * w * bw, rank, src: 'osm' });
      run = null;
    };
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const du = b[0] - a[0];
      const dv = b[1] - a[1];
      const L = Math.hypot(du, dv);
      if (L < 1e-6) continue;
      const ax = Math.abs(dv) <= L * S22 ? 'x' : Math.abs(du) <= L * S22 ? 'y' : 'D';
      const perp = ax === 'x' ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2;
      const al = ax === 'x' ? [a[0], b[0]] : [a[1], b[1]];
      if (run && run.ax === ax && (ax === 'D' || Math.abs(perp - run.perp / run.len) <= 2)) {
        run.len += L;
        run.perp += perp * L;
        run.min = Math.min(run.min, ...al);
        run.max = Math.max(run.max, ...al);
        run.end = b;
      } else {
        flush();
        run = { ax, len: L, perp: perp * L, min: Math.min(...al), max: Math.max(...al), start: a, end: b };
      }
    }
    flush();
  }
  const clipped = [];
  for (const c of out) {
    if (c.at < C0 + 1 || c.at > C1 - 2) continue;
    c.from = Math.max(c.from, C0);
    c.to = Math.min(c.to, C1 - 1);
    if (c.to - c.from >= 1) clipped.push(c);
  }
  const order = (a, b) => (a.axis < b.axis ? -1 : a.axis > b.axis ? 1 : a.at - b.at || a.from - b.from);
  let list = clipped.sort(order);
  let merged = true;
  while (merged) {
    merged = false;
    const res = [];
    for (const c of list) {
      let m = null;
      for (let k = res.length - 1; k >= 0 && k >= res.length - 40; k--) {
        const r = res[k];
        if (r.axis !== c.axis || Math.abs(r.at - c.at) > 1.5) continue;
        if (Math.max(r.from, c.from) - Math.min(r.to, c.to) > 4) continue;
        m = r;
        break;
      }
      if (m) {
        const tw = m.weight + c.weight;
        m.at = (m.at * m.weight + c.at * c.weight) / tw;
        m.weight = tw;
        m.from = Math.min(m.from, c.from);
        m.to = Math.max(m.to, c.to);
        m.rank = Math.max(m.rank, c.rank);
        if (c.src === 'osm') m.src = 'osm';
        merged = true;
      } else res.push({ ...c });
    }
    list = res.sort(order);
  }
  return list.filter((c) => c.to - c.from >= 4);
}

function staircase(a, b, weight, rank) {
  const du = b[0] - a[0];
  const dv = b[1] - a[1];
  const k = Math.max(1, Math.floor(Math.min(Math.abs(du), Math.abs(dv)) / 8));
  const tot = Math.abs(du) + Math.abs(dv);
  const out = [];
  for (let i = 0; i < k; i++) {
    const x0 = a[0] + (du * i) / k;
    const x1 = a[0] + (du * (i + 1)) / k;
    const y0 = a[1] + (dv * i) / k;
    const y1 = a[1] + (dv * (i + 1)) / k;
    out.push({ axis: 'x', at: y0, from: Math.min(x0, x1), to: Math.max(x0, x1), weight: (weight * Math.abs(du)) / tot / k, rank, src: 'dogleg' });
    out.push({ axis: 'y', at: x1, from: Math.min(y0, y1), to: Math.max(y0, y1), weight: (weight * Math.abs(dv)) / tot / k, rank, src: 'dogleg' });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ lines

/** Does perpendicular line p span the full width of line l? */
const spans = (p, l) => p.from <= l.pos && p.to >= l.pos + l.w - 1;
const tileOf = (l, a, k) => (l.axis === 'x' ? [a, l.pos + k] : [l.pos + k, a]);
const inCore = (x, y) => x >= C0 && y >= C0 && x < C1 && y < C1;

export function drawRoads(lines) {
  const g = new Uint8Array(N * N);
  for (const l of lines)
    for (let a = l.from; a <= l.to; a++)
      for (let k = 0; k < l.w; k++) {
        const [x, y] = tileOf(l, a, k);
        if (x >= 0 && y >= 0 && x < N && y < N) g[y * N + x] = Math.max(g[y * N + x], l.w);
      }
  return g;
}

/** A plan in progress: its lines, the superblocks' interiors and the water. */
class Layout {
  constructor(water) {
    this.water = water;
    this.lines = [];
    this.blocked = new Uint8Array(N * N); // superblock interiors
    this.rects = [];
  }
  add(l) {
    this.lines.push(l);
    return l;
  }
  /** Can a line go here: inside the core, off the superblocks, at most `maxWater` water tiles, MIN_BLOCK from parallels. */
  fits(axis, pos, w, from, to, skip = null, maxWater = Infinity) {
    if (to - from < 1) return false;
    let wet = 0;
    for (let a = from; a <= to; a++)
      for (let k = 0; k < w; k++) {
        const [x, y] = axis === 'x' ? [a, pos + k] : [pos + k, a];
        if (!inCore(x, y) || this.blocked[y * N + x]) return false;
        wet += this.water[y * N + x];
      }
    if (wet > maxWater) return false;
    for (const l of this.lines) {
      if (l === skip || l.axis !== axis) continue;
      if (Math.min(l.to, to) - Math.max(l.from, from) < OVERLAP) continue;
      if (pos >= l.pos) {
        if (pos - (l.pos + l.w) < MIN_BLOCK) return false;
      } else if (l.pos - (pos + w) < MIN_BLOCK) return false;
    }
    return true;
  }
  /** Is the end of l at `along` on a junction (a perpendicular line spanning l there)? */
  joined(l, along) {
    return this.lines.some((p) => p !== l && p.axis !== l.axis && p.pos <= along && along <= p.pos + p.w - 1 && spans(p, l));
  }
  /** Merge collinear lines of the same position and width whose ranges touch. */
  normalise() {
    const keep = [];
    const sorted = this.lines.slice().sort((a, b) => (a.axis < b.axis ? -1 : a.axis > b.axis ? 1 : a.pos - b.pos || a.w - b.w || a.from - b.from));
    for (const l of sorted) {
      const prev = keep[keep.length - 1];
      if (prev && prev.axis === l.axis && prev.pos === l.pos && prev.w === l.w && !prev.reserved === !l.reserved && l.from <= prev.to) {
        prev.to = Math.max(prev.to, l.to);
        prev.cls = Math.max(prev.cls, l.cls);
        prev.syn = prev.syn && l.syn;
        prev.ring = prev.ring || l.ring;
        prev.weight += l.weight;
      } else keep.push(l);
    }
    this.lines = keep;
  }
}

const line = (axis, pos, w, from, to, cls, src, extra = {}) => ({ axis, pos, w, from, to, cls, syn: cls === 0, src, weight: 0, ...extra });

// ------------------------------------------------------------------------------------------------ superblocks

const okBorder = (lo, hi) => (lo === C0 || lo >= C0 + 1 + MIN_BLOCK) && (hi === C1 - 1 || hi <= C1 - 2 - MIN_BLOCK);
const OFFS = [[SB + 1, 0], [-(SB + 1), 0], [0, SB + 1], [0, -(SB + 1)]];

/**
 * Where the Town Square, the Day 1 Quarter and the campus go: side by side (sharing a street), the square near the
 * centre and on a park if there is one, all three off the water and off as few real streets as possible, with their
 * edges on real streets where they can be. The campus leaves room east of it for the gate street.
 */
function chooseSuperblocks(cands, water, park) {
  const cw = new Float64Array(N * N);
  const cwa = { x: new Float64Array(N * N), y: new Float64Array(N * N) };
  for (const c of cands) {
    const per = c.weight / Math.max(1, c.to - c.from);
    const pos = Math.round(c.at);
    for (let a = Math.round(c.from); a <= Math.round(c.to); a++) {
      const [x, y] = c.axis === 'x' ? [a, pos] : [pos, a];
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      cw[y * N + x] = Math.max(cw[y * N + x], per * per); // losing a main road costs far more than a lane
      cwa[c.axis][y * N + x] += per;
    }
  }
  const pre = (m) => {
    const p = new Float64Array((N + 1) * (N + 1));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) p[(y + 1) * (N + 1) + x + 1] = m[y * N + x] + p[y * (N + 1) + x + 1] + p[(y + 1) * (N + 1) + x] - p[y * (N + 1) + x];
    return (x0, y0, w, h) => p[(y0 + h) * (N + 1) + x0 + w] - p[y0 * (N + 1) + x0 + w] - p[(y0 + h) * (N + 1) + x0] + p[y0 * (N + 1) + x0];
  };
  const sCw = pre(cw);
  const sW = pre(water);
  const sP = pre(park);
  const sX = pre(cwa.x);
  const sY = pre(cwa.y);
  const valid = (x0, y0) => okBorder(x0 - 1, x0 + SB) && okBorder(y0 - 1, y0 + SB);
  const borderBonus = (x0, y0) => {
    let b = 0;
    for (const yy of [y0 - 1, y0 + SB]) {
      let best = 0;
      for (const o of [-1, 0, 1]) if (yy + o >= 0 && yy + o < N) best = Math.max(best, sX(x0 - 1, yy + o, SB + 2, 1));
      b += best;
    }
    for (const xx of [x0 - 1, x0 + SB]) {
      let best = 0;
      for (const o of [-1, 0, 1]) if (xx + o >= 0 && xx + o < N) best = Math.max(best, sY(xx + o, y0 - 1, 1, SB + 2));
      b += best;
    }
    return b;
  };
  const cost = (x0, y0, kind) => {
    let c = sCw(x0, y0, SB, SB) + 40 * sW(x0, y0, SB, SB) - 0.4 * borderBonus(x0, y0);
    if (kind === 'square') c -= 0.5 * sP(x0, y0, SB, SB);
    return c;
  };
  const mid = C0 + CORE / 2;
  let best = null;
  for (let y0 = C0 + 1; y0 + SB <= C1 - 1; y0++)
    for (let x0 = C0 + 1; x0 + SB <= C1 - 1; x0++) {
      if (!valid(x0, y0)) continue;
      const dist = Math.hypot(x0 + SB / 2 - mid, y0 + SB / 2 - mid);
      if (dist > 16) continue;
      const cs = cost(x0, y0, 'square') + 2 * dist;
      if (best && cs - 60 > best.c) continue; // can't win even with free neighbours
      for (const [dx, dy] of OFFS) {
        const d1 = [x0 + dx, y0 + dy];
        if (!valid(...d1)) continue;
        const c1 = cost(...d1, 'day1');
        for (const base of [[x0, y0], d1])
          for (const [ex, ey] of OFFS) {
            const cp = [base[0] + ex, base[1] + ey];
            if ((cp[0] === x0 && cp[1] === y0) || (cp[0] === d1[0] && cp[1] === d1[1])) continue;
            if (!valid(...cp) || cp[0] + SB > C1 - 2 - MIN_BLOCK) continue;
            // nothing east of the campus in its rows (the gate street runs there)
            if ([[x0, y0], d1].some(([rx, ry]) => ry === cp[1] && rx > cp[0])) continue;
            const c = cs + c1 + cost(...cp, 'campus');
            if (!best || c < best.c) best = { c, square: [x0, y0], day1: d1, campus: cp };
          }
      }
    }
  return best;
}

// ------------------------------------------------------------------------------------------------ the plan


/** Build the plan for one scale. Returns null when the rules can't all be met. */
export function buildPlan(d, { mpt, bearing, rot = 0, shift = [0, 0] }) {
  const xf = makeXf(bearing, rot, shift, mpt);
  const water = waterMask(d, xf, N, mpt, 1);
  const park = new Uint8Array(N * N);
  fillPolys(d.park.map((rs) => rs.map((r) => r.map(xf))), N, (x, y) => (park[y * N + x] = 1));
  for (let i = 0; i < N * N; i++) if (water[i]) park[i] = 0;
  const cands = candidates(d, xf);
  const sbs = chooseSuperblocks(cands, water, park);
  if (!sbs) return null;
  const L = new Layout(water);
  // the ring road
  L.add(line('x', C0, 1, C0, C1 - 1, 0, 'ring', { ring: true, reserved: true }));
  L.add(line('x', C1 - 1, 1, C0, C1 - 1, 0, 'ring', { ring: true, reserved: true }));
  L.add(line('y', C0, 1, C0, C1 - 1, 0, 'ring', { ring: true, reserved: true }));
  L.add(line('y', C1 - 1, 1, C0, C1 - 1, 0, 'ring', { ring: true, reserved: true }));
  // superblocks, ringed by streets
  for (const id of ['square', 'day1', 'campus']) {
    const [x0, y0] = sbs[id];
    L.rects.push({ id, x: x0, y: y0 });
    for (let y = y0; y < y0 + SB; y++) for (let x = x0; x < x0 + SB; x++) L.blocked[y * N + x] = 1;
    L.add(line('x', y0 - 1, 1, x0 - 1, x0 + SB, 0, 'border', { reserved: true }));
    L.add(line('x', y0 + SB, 1, x0 - 1, x0 + SB, 0, 'border', { reserved: true }));
    L.add(line('y', x0 - 1, 1, y0 - 1, y0 + SB, 0, 'border', { reserved: true }));
    L.add(line('y', x0 + SB, 1, y0 - 1, y0 + SB, 0, 'border', { reserved: true }));
  }
  L.normalise();
  // the gate street: from the campus's east side to the east edge, in the campus's rows
  {
    const [cx, cy] = sbs.campus;
    let bestG = null;
    for (let g = 0; g < SB; g++) {
      const y = cy + g;
      if (!L.fits('x', y, 1, cx + SB, C1 - 1)) continue;
      let wet = 0;
      let real = 0;
      for (let x = cx + SB; x < C1; x++) wet += water[y * N + x];
      for (const c of cands) if (c.axis === 'x' && Math.abs(c.at - y) <= 1 && c.to > cx + SB) real += c.weight;
      const sc = wet * 10 - Math.min(real, 200) * 0.05 + Math.abs(g - 5.5);
      if (!bestG || sc < bestG.sc) bestG = { sc, y };
    }
    if (!bestG) return null;
    L.add(line('x', bestG.y, 1, sbs.campus[0] + SB, C1 - 1, 0, 'gate', { reserved: true, gate: true }));
  }
  // real streets, heaviest first
  let kept = 0;
  let dropped = 0;
  for (const c of cands.slice().sort((a, b) => b.weight - a.weight || a.at - b.at)) {
    const len = c.to - c.from;
    const w = c.rank >= 4 || (c.rank === 3 && len >= 30) ? 2 : 1;
    const from = Math.round(c.from);
    const to = Math.round(c.to);
    const same = L.lines.find((l) => l.axis === c.axis && !l.ring && Math.abs(l.pos + (l.w - 1) / 2 - c.at) <= 1.2 && Math.min(l.to, to) - Math.max(l.from, from) > -4);
    if (same) {
      same.weight += c.weight;
      if (same.syn || c.rank > same.cls) {
        same.cls = Math.max(same.syn ? 0 : same.cls, c.rank);
        same.syn = false;
      }
      const nf = Math.min(same.from, from);
      const nt = Math.max(same.to, to);
      if (same.reserved && !same.ring && same.w === 1 && w === 2) widen(L, same);
      if (!same.reserved && L.fits(same.axis, same.pos, same.w, nf, nt, same, overWater(same, nf, nt))) {
        same.from = nf;
        same.to = nt;
      } else {
        // a reserved street keeps its span: the rest of the real street continues it on either side
        for (const [f, t] of [[nf, same.from], [same.to, nt]])
          if (t - f >= 4) for (const p of pieces(L, c.axis, same.pos, same.w, f, t)) if (L.fits(c.axis, same.pos, same.w, p[0], p[1], same)) L.add(line(c.axis, same.pos, same.w, p[0], p[1], c.rank, c.src, { weight: c.weight }));
      }
      kept++;
      continue;
    }
    let placed = false;
    for (const ww of w === 2 ? [2, 1] : [1]) {
      const base = Math.round(c.at - (ww - 1) / 2);
      for (const dp of [0, 1, -1]) {
        const pos = base + dp;
        if (Math.abs(pos + (ww - 1) / 2 - c.at) > 1.5) continue;
        const ps = pieces(L, c.axis, pos, ww, from, to).filter((p) => p[1] - p[0] >= 4 && L.fits(c.axis, pos, ww, p[0], p[1]));
        if (!ps.length) continue;
        for (const p of ps) L.add(line(c.axis, pos, ww, p[0], p[1], c.rank, c.src, { weight: c.weight }));
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (placed) kept++;
    else dropped++;
  }
  L.normalise();
  snap(L);
  settle(L);
  const synthetic = fill(L, park);
  settle(L);
  const edge = edges(L);
  settle(L);
  if (!connectReserved(L)) return null;
  settle(L);
  L.normalise();
  const road = drawRoads(L.lines);
  const errors = validate(L.lines, L.rects, water);
  const fid = fidelity(d, xf, road);
  const parksBig = bigParks(park, road, water);
  const lotList = lots(road, water, L.blocked, parksBig);
  let wcore = 0;
  for (let y = C0; y < C1; y++) for (let x = C0; x < C1; x++) wcore += water[y * N + x];
  return {
    mpt,
    bearing,
    rot,
    shift,
    xf,
    water,
    green: park,
    road,
    lines: L.lines,
    rects: L.rects,
    lots: lotList,
    density: density(d, xf, mpt),
    errors,
    metrics: {
      mpt,
      fidelity: +fid.toFixed(3),
      water: +(wcore / (CORE * CORE)).toFixed(3),
      candidates: cands.length,
      kept,
      dropped,
      synthetic: L.lines.filter((l) => l.syn && !l.ring).length,
      added: synthetic + edge,
      streets: L.lines.length,
      avenues: L.lines.filter((l) => l.w === 2).length,
      lots: lotList.length,
      edgeWater: +(edgeWet(water) / (4 * CORE - 4)).toFixed(3),
      ringWater: +((water.reduce((a, b) => a + b, 0) - wcore) / (N * N - CORE * CORE)).toFixed(3),
    },
  };
  function overWater(l) {
    // a real street may cross water (a bridge) where it already does
    return l.src === 'osm' || l.src === 'dogleg' ? Infinity : 1;
  }
}

function edgeWet(water) {
  let s = 0;
  for (let t = C0; t < C1; t++) s += water[C0 * N + t] + water[(C1 - 1) * N + t] + (t > C0 && t < C1 - 1 ? water[t * N + C0] + water[t * N + C1 - 1] : 0);
  return s;
}

/** A superblock's edge street that carries a main road becomes an avenue, widened away from the superblock. */
function widen(L, l) {
  let inside = 0;
  for (let a = l.from; a <= l.to; a++) {
    const [x1, y1] = l.axis === 'x' ? [a, l.pos + 1] : [l.pos + 1, a];
    const [x0, y0] = l.axis === 'x' ? [a, l.pos - 1] : [l.pos - 1, a];
    if (L.blocked[y1 * N + x1]) inside |= 2;
    if (L.blocked[y0 * N + x0]) inside |= 1;
  }
  if (inside === 3) return;
  const pos = inside === 2 ? l.pos - 1 : l.pos;
  if (L.fits(l.axis, pos, 2, l.from, l.to, l, wetOf(L, l) + l.to - l.from + 1)) {
    l.pos = pos;
    l.w = 2;
    // streets that end on it now end across both its lanes
    for (const p of L.lines) {
      if (p.axis === l.axis || p.pos < l.from || p.pos + p.w - 1 > l.to) continue;
      if (p.from >= pos && p.from <= pos + 1) p.from = pos;
      if (p.to >= pos && p.to <= pos + 1) p.to = pos + 1;
    }
  }
}

/** The parts of a line left after cutting out the superblocks it would cross (ending on their edge streets). */
function pieces(L, axis, pos, w, from, to) {
  let out = [[from, to]];
  for (const r of L.rects) {
    const [a0, c0] = axis === 'x' ? [r.x, r.y] : [r.y, r.x];
    if (pos + w - 1 < c0 || pos > c0 + SB - 1) continue;
    const next = [];
    for (const [f, t] of out) {
      if (t < a0 || f > a0 + SB - 1) {
        next.push([f, t]);
        continue;
      }
      if (f <= a0 - 1) next.push([f, a0 - 1]);
      if (t >= a0 + SB) next.push([a0 + SB, t]);
    }
    out = next;
  }
  return out.filter(([f, t]) => t - f >= 1);
}

/** Pull each street's ends onto the nearest crossing street (a few tiles either way). */
function snap(L) {
  for (let pass = 0; pass < 3; pass++)
    for (const l of L.lines) {
      if (l.reserved) continue;
      const perp = L.lines.filter((p) => p.axis !== l.axis && spans(p, l));
      let best = null;
      for (const p of perp) if (p.pos >= l.to - 3 && p.pos <= l.to + 6 && (!best || Math.abs(p.pos - l.to) < Math.abs(best.pos - l.to))) best = p;
      if (best) {
        const nt = best.pos + best.w - 1;
        if (nt <= l.to || L.fits(l.axis, l.pos, l.w, l.from, nt, l, wetOf(L, l) + 1)) l.to = nt;
      }
      best = null;
      for (const p of perp) if (p.pos + p.w - 1 <= l.from + 3 && p.pos + p.w - 1 >= l.from - 6 && (!best || Math.abs(p.pos - l.from) < Math.abs(best.pos - l.from))) best = p;
      if (best) {
        const nf = best.pos;
        if (nf >= l.from || L.fits(l.axis, l.pos, l.w, nf, l.to, l, wetOf(L, l) + 1)) l.from = nf;
      }
    }
}
function wetOf(L, l) {
  let s = 0;
  for (let a = l.from; a <= l.to; a++) for (let k = 0; k < l.w; k++) {
    const [x, y] = tileOf(l, a, k);
    s += L.water[y * N + x];
  }
  return s;
}

/**
 * Make every end sit on a junction (extend to the next crossing within 8 tiles, else trim back to the last one, else
 * drop the street) and drop whatever can't reach the ring road; repeat until nothing changes.
 */
function settle(L) {
  for (let guard = 0; guard < 50; guard++) {
    let changed = false;
    L.normalise();
    for (const l of L.lines.slice()) {
      if (l.reserved || !L.lines.includes(l)) continue;
      for (const end of ['to', 'from']) {
        if (!L.lines.includes(l)) break;
        const at = l[end];
        if (L.joined(l, at)) continue;
        changed = true;
        const perp = L.lines.filter((p) => p !== l && p.axis !== l.axis && spans(p, l));
        // extend
        let ext = null;
        for (const p of perp) {
          if (end === 'to' ? p.pos > at && p.pos - at <= 8 : p.pos + p.w - 1 < at && at - (p.pos + p.w - 1) <= 8) {
            if (!ext || Math.abs(p.pos - at) < Math.abs(ext.pos - at)) ext = p;
          }
        }
        if (ext) {
          const nf = end === 'from' ? ext.pos : l.from;
          const nt = end === 'to' ? ext.pos + ext.w - 1 : l.to;
          if (L.fits(l.axis, l.pos, l.w, nf, nt, l, wetOf(L, l) + 1)) {
            l.from = nf;
            l.to = nt;
            continue;
          }
        }
        // trim back to the last crossing
        const inside = perp.filter((p) => p.pos + p.w - 1 >= l.from && p.pos <= l.to);
        if (end === 'to') {
          const c = inside.filter((p) => p.pos + p.w - 1 <= l.to).map((p) => p.pos + p.w - 1);
          const nt = c.length ? Math.max(...c) : -1;
          if (nt > l.from) l.to = nt;
          else L.lines.splice(L.lines.indexOf(l), 1);
        } else {
          const c = inside.filter((p) => p.pos >= l.from).map((p) => p.pos);
          const nf = c.length ? Math.min(...c) : Infinity;
          if (nf < l.to) l.from = nf;
          else L.lines.splice(L.lines.indexOf(l), 1);
        }
      }
    }
    // a street that only touches its crossings at one tile is no street
    for (const l of L.lines.slice()) if (!l.reserved && l.to - l.from < 1) {
      L.lines.splice(L.lines.indexOf(l), 1);
      changed = true;
    }
    const seen = reach(L.lines);
    for (const l of L.lines.slice()) {
      if (l.reserved) continue;
      const [x, y] = tileOf(l, l.from, 0);
      if (!seen[y * N + x]) {
        L.lines.splice(L.lines.indexOf(l), 1);
        changed = true;
      }
    }
    if (!changed) return;
  }
}

/** Road tiles reachable from the ring road. */
function reach(lines) {
  const g = drawRoads(lines);
  const seen = new Uint8Array(N * N);
  const q = [];
  for (let i = 0; i < N * N; i++) {
    const x = i % N;
    const y = (i / N) | 0;
    if (g[i] && (x === C0 || y === C0)) {
      seen[i] = 1;
      q.push(i);
    }
  }
  while (q.length) {
    const c = q.pop();
    const x = c % N;
    const y = (c / N) | 0;
    for (const [dx, dy] of DIRS) {
      const X = x + dx;
      const Y = y + dy;
      if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
      const j = Y * N + X;
      if (g[j] && !seen[j]) {
        seen[j] = 1;
        q.push(j);
      }
    }
  }
  return seen;
}

/** Link the superblocks' streets to the network if no real street reaches them: the shortest straight connector. */
function connectReserved(L) {
  for (let guard = 0; guard < 12; guard++) {
    const seen = reach(L.lines);
    const lost = L.lines.filter((l) => {
      const [x, y] = tileOf(l, l.from, 0);
      return l.reserved && !seen[y * N + x];
    });
    if (!lost.length) return true;
    let best = null;
    for (const l of lost)
      for (let a = l.from; a <= l.to; a++) {
        // a perpendicular street leaving l outward, either way, until it meets a reached street that spans it
        for (const dir of [-1, 1]) {
          const pos = a;
          const start = dir < 0 ? l.pos : l.pos + l.w - 1;
          for (let s = start + dir, n = 1; s >= C0 && s < C1 && n <= 30; s += dir, n++) {
            const [x, y] = l.axis === 'x' ? [pos, s] : [s, pos];
            if (!seen[y * N + x]) continue;
            const axis = l.axis === 'x' ? 'y' : 'x';
            const target = L.lines.find((p) => p.axis === l.axis && s >= p.pos && s <= p.pos + p.w - 1 && p.from <= pos && p.to >= pos);
            if (!target) break;
            const from = Math.min(start, dir < 0 ? target.pos : target.pos + target.w - 1);
            const to = Math.max(start, dir < 0 ? target.pos : target.pos + target.w - 1);
            const f2 = dir < 0 ? target.pos : l.pos;
            const t2 = dir < 0 ? l.pos + l.w - 1 : target.pos + target.w - 1;
            if (L.fits(axis, pos, 1, f2, t2, null, 1) && (!best || t2 - f2 < best.t - best.f)) best = { axis, pos, f: f2, t: t2 };
            void from;
            void to;
            break;
          }
        }
      }
    if (!best) return false;
    L.add(line(best.axis, best.pos, 1, best.f, best.t, 0, 'synthetic', { reserved: true }));
  }
  return false;
}

/** Split big blocks (more than SYN_GAP tiles both ways, mostly not park) with synthetic streets. */
function fill(L, park) {
  let added = 0;
  const tried = new Set();
  for (let iter = 0; iter < 300; iter++) {
    const road = drawRoads(L.lines);
    const blocks = labelBlocks(road, L.water, L.blocked);
    let did = false;
    for (const b of blocks) {
      const bw = b.x1 - b.x0 + 1;
      const bh = b.y1 - b.y0 + 1;
      if ((bw <= SYN_GAP && bh <= SYN_GAP) || b.tiles.length < 6 * 17) continue;
      let g = 0;
      for (const i of b.tiles) g += park[i];
      if (g / b.tiles.length > 0.5) continue;
      const key = `${b.x0},${b.y0},${b.x1},${b.y1}`;
      if (tried.has(key)) continue;
      tried.add(key);
      const vertical = bw >= bh;
      const mid = vertical ? b.x0 + Math.floor(bw / 2) : b.y0 + Math.floor(bh / 2);
      const inBlock = new Set(b.tiles);
      for (const dp of [0, 1, -1, 2, -2, 3, -3]) {
        const pos = mid + dp;
        let best = null;
        let s = null;
        const lo = (vertical ? b.y0 : b.x0) - 1;
        const hi = (vertical ? b.y1 : b.x1) + 1;
        for (let t = lo; t <= hi + 1; t++) {
          const i = vertical ? t * N + pos : pos * N + t;
          const ok = t <= hi && (inBlock.has(i) || road[i] > 0);
          if (ok && s === null) s = t;
          if (!ok && s !== null) {
            if (!best || t - 1 - s > best[1] - best[0]) best = [s, t - 1];
            s = null;
          }
        }
        if (!best || best[1] - best[0] < 6) continue;
        const ax = vertical ? 'y' : 'x';
        if (!L.fits(ax, pos, 1, best[0], best[1], null, 0)) continue;
        L.add(line(ax, pos, 1, best[0], best[1], 0, 'synthetic'));
        added++;
        did = true;
        break;
      }
      if (did) break;
    }
    if (!did) break;
  }
  return added;
}

function labelBlocks(road, water, blocked) {
  const lab = new Int32Array(N * N).fill(-1);
  const blocks = [];
  for (let y = C0 + 1; y < C1 - 1; y++)
    for (let x = C0 + 1; x < C1 - 1; x++) {
      const i = y * N + x;
      if (road[i] || water[i] || blocked[i] || lab[i] >= 0) continue;
      const b = { tiles: [], x0: x, x1: x, y0: y, y1: y };
      const q = [i];
      lab[i] = blocks.length;
      while (q.length) {
        const c = q.pop();
        const cx = c % N;
        const cy = (c / N) | 0;
        b.tiles.push(c);
        b.x0 = Math.min(b.x0, cx);
        b.x1 = Math.max(b.x1, cx);
        b.y0 = Math.min(b.y0, cy);
        b.y1 = Math.max(b.y1, cy);
        for (const [dx, dy] of DIRS) {
          const X = cx + dx;
          const Y = cy + dy;
          const j = Y * N + X;
          if (X <= C0 || Y <= C0 || X >= C1 - 1 || Y >= C1 - 1 || road[j] || water[j] || blocked[j] || lab[j] >= 0) continue;
          lab[j] = blocks.length;
          q.push(j);
        }
      }
      blocks.push(b);
    }
  return blocks;
}

/** Interior lines that reach an edge: N = y-streets from the top ring, W = x-streets from the left ring. */
export function edgeLines(lines) {
  const inner = (l) => l.pos > C0 && l.pos + l.w - 1 < C1 - 1;
  return {
    N: lines.filter((l) => l.axis === 'y' && l.from === C0 && inner(l)).map((l) => l.pos),
    W: lines.filter((l) => l.axis === 'x' && l.from === C0 && inner(l)).map((l) => l.pos),
  };
}
/** The most lines from `ps` at least `gap` apart (greedy, sorted). */
export function spaced(ps, gap = 9) {
  const out = [];
  for (const p of [...ps].sort((a, b) => a - b)) if (!out.length || p - out[out.length - 1] >= gap) out.push(p);
  return out;
}

/** At least 3 well-spaced lines reach the N and W edges: extend real streets straight out, else add short ones. */
function edges(L) {
  let added = 0;
  for (const side of ['N', 'W']) {
    const axis = side === 'N' ? 'y' : 'x';
    for (let guard = 0; guard < 6 && spaced(edgeLines(L.lines)[side]).length < 3; guard++) {
      const have = spaced(edgeLines(L.lines)[side]);
      const far = (p) => have.every((h) => Math.abs(h - p) >= 9);
      // extend the heaviest street that would add a well-spaced line
      const ext = L.lines
        .filter((l) => l.axis === axis && !l.ring && l.from > C0 && far(l.pos))
        .sort((a, b) => b.weight - a.weight || a.pos - b.pos)
        .find((l) => L.fits(axis, l.pos, l.w, C0, l.to, l, wetOf(L, l) + 2));
      if (ext) {
        ext.from = C0;
        continue;
      }
      // else a new street from the edge to the first street it meets
      let best = null;
      for (let pos = C0 + 1 + MIN_BLOCK; pos <= C1 - 2 - MIN_BLOCK; pos++) {
        if (!far(pos)) continue;
        const hit = L.lines
          .filter((p) => p.axis !== axis && !(p.pos === C0) && p.from <= pos && p.to >= pos && p.pos > C0 + MIN_BLOCK)
          .sort((a, b) => a.pos - b.pos)[0];
        if (!hit) continue;
        const to = hit.pos + hit.w - 1;
        // over water only when it must (a waterfront edge: the street is a pier out to the ring road)
        if (!L.fits(axis, pos, 1, C0, to)) continue;
        let wet = 0;
        for (let a = C0; a <= to; a++) wet += L.water[axis === 'y' ? a * N + pos : pos * N + a];
        const score = to - C0 + 4 * wet + Math.min(...have.map((h) => -Math.abs(h - pos) / 4), 0);
        if (!best || score < best.score) best = { pos, to, score };
      }
      if (!best) break;
      L.add(line(axis, best.pos, 1, C0, best.to, 0, 'edge'));
      added++;
    }
  }
  return added;
}

// ------------------------------------------------------------------------------------------------ checks + metrics

/** Every rule the data promises; [] when the plan keeps them all. */
export function validate(lines, rects, water) {
  const errors = [];
  const road = drawRoads(lines);
  for (const l of lines) {
    for (let a = l.from; a <= l.to; a++) for (let k = 0; k < l.w; k++) {
      const [x, y] = tileOf(l, a, k);
      if (!inCore(x, y)) errors.push(`street ${l.axis}${l.pos} leaves the core`);
    }
    for (const end of [l.from, l.to])
      if (!lines.some((p) => p !== l && p.axis !== l.axis && p.pos <= end && end <= p.pos + p.w - 1 && spans(p, l))) errors.push(`street ${l.axis}${l.pos} [${l.from}..${l.to}] ends off a junction at ${end}`);
    for (const p of lines) {
      if (p === l || p.axis !== l.axis || p.pos < l.pos) continue;
      if (Math.min(l.to, p.to) - Math.max(l.from, p.from) < OVERLAP) continue;
      if (p.pos - (l.pos + l.w) < MIN_BLOCK) errors.push(`streets ${l.axis}${l.pos} and ${p.axis}${p.pos} are closer than ${MIN_BLOCK}`);
    }
  }
  for (const r of rects) for (let y = r.y; y < r.y + SB; y++) for (let x = r.x; x < r.x + SB; x++) if (road[y * N + x]) errors.push(`street inside ${r.id}`);
  const seen = reach(lines);
  for (let i = 0; i < N * N; i++) if (road[i] && !seen[i]) {
    errors.push('roads not connected');
    break;
  }
  for (const [x, y] of [[C0, C0], [C1 - 1, C0], [C0, C1 - 1], [C1 - 1, C1 - 1]]) if (!road[y * N + x]) errors.push('ring road broken');
  for (let t = C0; t < C1; t++) if (!road[C0 * N + t] || !road[(C1 - 1) * N + t] || !road[t * N + C0] || !road[t * N + C1 - 1]) {
    errors.push('ring road broken');
    break;
  }
  const e = edgeLines(lines);
  if (spaced(e.N).length < 3) errors.push(`only ${spaced(e.N).length} spaced lines reach the north edge`);
  if (spaced(e.W).length < 3) errors.push(`only ${spaced(e.W).length} spaced lines reach the west edge`);
  const campus = rects.find((r) => r.id === 'campus');
  if (campus && !lines.some((l) => l.axis === 'x' && l.to === C1 - 1 && l.pos >= campus.y && l.pos < campus.y + SB && !l.ring)) errors.push('no street reaches the east edge in the campus rows');
  void water;
  return [...new Set(errors)];
}

/** Share of real road length (by class) in the core that lies within a tile of a plan road. */
export function fidelity(d, xf, road) {
  let tot = 0;
  let kept = 0;
  for (const r of d.roads) {
    const w = CLS_W[r.cls];
    if (!w || r.tunnel) continue;
    const pts = r.pts.map(xf);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.ceil(L / 0.5);
      for (let k = 0; k < n; k++) {
        const x = a[0] + ((b[0] - a[0]) * (k + 0.5)) / n;
        const y = a[1] + ((b[1] - a[1]) * (k + 0.5)) / n;
        if (x < C0 + 1 || y < C0 + 1 || x >= C1 - 1 || y >= C1 - 1) continue;
        const wt = (w * L) / n;
        tot += wt;
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        let hit = false;
        for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) if (road[(yi + dy) * N + xi + dx]) {
          hit = true;
          break;
        }
        if (hit) kept += wt;
      }
    }
  }
  return tot ? kept / tot : 0;
}

/** Park pieces of at least 36 tiles off the roads: they hold no lots. */
function bigParks(park, road, water) {
  const out = new Uint8Array(N * N);
  const seen = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    if (!park[i] || seen[i] || road[i] || water[i]) continue;
    const comp = [];
    const q = [i];
    seen[i] = 1;
    while (q.length) {
      const c = q.pop();
      comp.push(c);
      const x = c % N;
      const y = (c / N) | 0;
      for (const [dx, dy] of DIRS) {
        const X = x + dx;
        const Y = y + dy;
        const j = Y * N + X;
        if (X < 0 || Y < 0 || X >= N || Y >= N || seen[j] || !park[j] || road[j] || water[j]) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    if (comp.length >= 36) for (const c of comp) out[c] = 1;
  }
  return out;
}

/** An estimate of how many 3×3 building lots with a street front fit (a tile apart), best of four sweep orders. */
export function lots(road, water, blocked, parks) {
  let best = [];
  for (const order of [0, 1, 2, 3]) {
    const r = lotsOrder(road, water, blocked, parks, order);
    if (r.length > best.length) best = r;
  }
  return best;
}
function lotsOrder(road, water, blocked, parks, order) {
  const free = (x, y) => x > C0 && y > C0 && x < C1 - 1 && y < C1 - 1 && !road[y * N + x] && !water[y * N + x] && !blocked[y * N + x] && !parks[y * N + x];
  const taken = new Uint8Array(N * N);
  const out = [];
  const isRoad = (x, y) => road[y * N + x] > 0;
  const span = [];
  for (let k = C0 + 1; k + 3 <= C1 - 1; k++) span.push(k);
  const A = order & 1 ? span.slice().reverse() : span;
  const B = order & 2 ? span.slice().reverse() : span;
  for (const a of A)
    for (const b of B) {
      const x = order < 2 ? b : a;
      const y = order < 2 ? a : b;
      let ok = true;
      for (let dy = 0; dy < 3 && ok; dy++) for (let dx = 0; dx < 3; dx++) if (!free(x + dx, y + dy)) {
        ok = false;
        break;
      }
      if (!ok) continue;
      for (let dy = -1; dy < 4 && ok; dy++) for (let dx = -1; dx < 4; dx++) if (taken[(y + dy) * N + x + dx]) {
        ok = false;
        break;
      }
      if (!ok) continue;
      const side = (pts) => pts.every(([p, q]) => isRoad(p, q));
      const front =
        side([[x, y - 1], [x + 1, y - 1], [x + 2, y - 1]]) ||
        side([[x, y + 3], [x + 1, y + 3], [x + 2, y + 3]]) ||
        side([[x - 1, y], [x - 1, y + 1], [x - 1, y + 2]]) ||
        side([[x + 3, y], [x + 3, y + 1], [x + 3, y + 2]]);
      if (!front) continue;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) taken[(y + dy) * N + x + dx] = 1;
      out.push([x, y]);
    }
  return out;
}

/** Building density per 4×4 core cell: buildings per hectare → '0' (<1) '1' (<6) '2' (<15) '3'. */
export function density(d, xf, mpt) {
  const cnt = new Float64Array(16 * 16);
  for (const b of d.buildings) {
    const [u, v] = xf(b);
    const cx = Math.floor((u - C0) / 4);
    const cy = Math.floor((v - C0) / 4);
    if (cx < 0 || cy < 0 || cx >= 16 || cy >= 16) continue;
    cnt[cy * 16 + cx]++;
  }
  const ha = (16 * mpt * mpt) / 10000;
  let s = '';
  for (const c of cnt) {
    const p = c / ha;
    s += p < 1 ? '0' : p < 6 ? '1' : p < 15 ? '2' : '3';
  }
  return s;
}

// ------------------------------------------------------------------------------------------------ choosing a scale

/**
 * The plan for a city: tries each metres-per-tile in MPTS (and, when more than 15 % of the core is water, the centre
 * moved up to 400 m towards the land as well), keeps the ones that meet every rule with at least MIN_LOTS lots and at
 * most 25 % water (35 % for coast-heavy cities), and picks the most faithful, counting visible water as character.
 * North stays up (rot 0) unless no plan works that way, then the first quarter turn that does.
 * Returns { pick, tries } (pick null when nothing works).
 */
export function rasterise(d, { bearing = dominantBearing(d.roads), rots = [0, 1, 2, 3], mpts = MPTS } = {}) {
  const all = [];
  for (const rot of rots) {
    const tries = mpts.flatMap((mpt) => buildAt(d, mpt, bearing, rot));
    all.push(...tries);
    const pick = choose(tries);
    // north stays up (rot 0) unless no scale works that way: then the first quarter turn that does
    if (pick) return { pick, tries: all };
  }
  return { pick: null, tries: all };
}

/**
 * Recognisable first: fidelity, plus the city's water (up to 15 % of the core, 25 % of the ring) as character, less a
 * little for a ring road that runs over water.
 */
const score = (t) =>
  t.metrics.fidelity + 0.008 * Math.min(t.metrics.water * 100, 15) + 0.002 * Math.min(t.metrics.ringWater * 100, 25) - 0.3 * t.metrics.edgeWater;
function choose(tries) {
  const ok = tries.filter((t) => !t.errors.length && t.metrics.lots >= MIN_LOTS);
  const pickFrom = (cap) => ok.filter((t) => t.metrics.water <= cap).sort((a, b) => score(b) - score(a) || a.mpt - b.mpt)[0];
  return pickFrom(0.25) ?? pickFrom(0.35) ?? null;
}

function buildAt(d, mpt, bearing, rot) {
  let shift = [0, 0];
  let xf = makeXf(bearing, rot, shift, mpt);
  let water = waterMask(d, xf, N, mpt, 1);
  let wf = coreFrac(water);
  const plans = [buildPlan(d, { mpt, bearing, rot, shift })];
  for (let it = 0; it < 4 && wf > 0.15; it++) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = C0; y < C1; y++)
      for (let x = C0; x < C1; x++)
        if (!water[y * N + x]) {
          sx += x + 0.5;
          sy += y + 0.5;
          n++;
        }
    if (!n) break;
    const [lx, ly] = xf.inv(sx / n, sy / n);
    const vx = lx - shift[0];
    const vy = ly - shift[1];
    const len = Math.hypot(vx, vy);
    if (len < 1) break;
    let nsx = shift[0] + (vx / len) * Math.min(len, 150);
    let nsy = shift[1] + (vy / len) * Math.min(len, 150);
    const tot = Math.hypot(nsx, nsy);
    if (tot > 400) {
      nsx *= 400 / tot;
      nsy *= 400 / tot;
    }
    if (Math.hypot(nsx - shift[0], nsy - shift[1]) < 1) break;
    shift = [Math.round(nsx), Math.round(nsy)];
    xf = makeXf(bearing, rot, shift, mpt);
    water = waterMask(d, xf, N, mpt, 1);
    wf = coreFrac(water);
  }
  // a watery core also tries its centre moved (up to 400 m) towards the land
  if (shift[0] || shift[1]) plans.push(buildPlan(d, { mpt, bearing, rot, shift }));
  return plans.filter(Boolean);
}

