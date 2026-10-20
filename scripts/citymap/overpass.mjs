// Overpass I/O for `npm run city-maps`: one query per Region, sequential and polite (a status check before each
// request, back-off on 429/502/503/504, a pause between Regions), cached in .cache/osm/<code>.json with a sidecar
// <code>.meta.json (centre, bbox half-size, endpoint, date). Never run in CI or tests: tests use the pure modules.
//
// The data is © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
import fs from 'node:fs';
import path from 'node:path';

export const ENDPOINTS = ['https://overpass-api.de/api', 'https://overpass.private.coffee/api'];
const UA = 'aws-city-city-maps/1 (npm run city-maps; one request per city, cached)';
/** Half-size of the fetched square, metres: a 100-tile map at 35 m/tile, turned up to ~40°, plus a little shift. */
export const HALF_M = 2800;
/** Pause between Regions that made a request. */
export const PAUSE_MS = 10_000;
const RETRY = new Set([429, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The bbox (south, west, north, east) of a square `half` metres each way round a centre. Pure. */
export function bboxOf({ lat, lon }, half = HALF_M) {
  const dLat = half / 111320;
  const dLon = half / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((v) => +v.toFixed(6));
}

/** The Overpass QL for one city. The bbox sits on each statement; relations come with their members' geometry. Pure. */
export function queryFor(centre, half = HALF_M) {
  const b = `(${bboxOf(centre, half).join(',')})`;
  return `[out:json][timeout:240][maxsize:536870912];
way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"][area!=yes]${b};
out tags geom qt;
(way[natural=coastline]${b};way[natural=water]${b};way[waterway=riverbank]${b};way[waterway~"^(river|canal)$"]${b};
 way[leisure~"^(park|garden|pitch)$"]${b};way[landuse~"^(grass|recreation_ground|cemetery|forest)$"]${b};way[natural=wood]${b};);
out tags geom qt;
(relation[natural=water]${b};relation[waterway=riverbank]${b};relation[leisure~"^(park|garden|pitch)$"]${b};
 relation[landuse~"^(grass|recreation_ground|cemetery|forest)$"]${b};relation[natural=wood]${b};);
out body geom qt;
way[building]${b};
out ids center qt;`;
}

/** Metres between two lat/lon points (equirectangular; fine at city scale). Pure. */
export function metresBetween(a, b) {
  const kx = 111320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 111320);
}

async function statusWait(api, log) {
  try {
    const res = await fetch(`${api}/status`, { headers: { 'User-Agent': UA } });
    const t = await res.text();
    if (!res.ok) return 30;
    const m = t.match(/(\d+) slots available now/);
    if (m && +m[1] > 0) return 0;
    const w = [...t.matchAll(/in (\d+) seconds/g)].map((x) => +x[1]);
    return w.length ? Math.min(...w) + 1 : 15;
  } catch (e) {
    log(`  status check failed (${e.message}); waiting 30 s`);
    return 30;
  }
}

/**
 * The raw Overpass JSON for a city, from the cache unless `refresh`. With `cacheOnly`, a missing cache is null (no
 * request). `seeds` are other cached files ({file, centre, half}) reused when their centre is within 200 m.
 * Returns { json, meta, requests } (requests = interpreter calls made).
 */
export async function osmFor(city, { cacheDir, refresh = false, cacheOnly = false, seeds = [], log = console.log } = {}) {
  const file = path.join(cacheDir, `${city.code}.json`);
  const metaFile = path.join(cacheDir, `${city.code}.meta.json`);
  const centre = { lat: city.lat, lon: city.lon };
  if (!refresh && fs.existsSync(file) && fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (metresBetween(meta.centre, centre) <= 200) return { json: JSON.parse(fs.readFileSync(file, 'utf8')), meta, requests: 0 };
    log(`  ${city.code}: cached centre moved ${Math.round(metresBetween(meta.centre, centre))} m; refetching`);
  }
  if (!refresh) {
    for (const s of seeds) {
      if (!fs.existsSync(s.file) || metresBetween(s.centre, centre) > 200) continue;
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.copyFileSync(s.file, file);
      const meta = { centre: s.centre, half: s.half, endpoint: `${ENDPOINTS[0]}/interpreter`, fetched: new Date(fs.statSync(s.file).mtimeMs).toISOString().slice(0, 10) };
      fs.writeFileSync(metaFile, JSON.stringify(meta));
      log(`  ${city.code}: reused ${path.basename(s.file)} (centre ${Math.round(metresBetween(s.centre, centre))} m away)`);
      return { json: JSON.parse(fs.readFileSync(file, 'utf8')), meta, requests: 0 };
    }
  }
  if (cacheOnly) return null;
  let requests = 0;
  const body = 'data=' + encodeURIComponent(queryFor(centre));
  for (let attempt = 0; attempt < 8; attempt++) {
    const api = ENDPOINTS[attempt % 4 === 3 ? 1 : 0]; // every fourth try goes to the mirror
    const wait = await statusWait(api, log);
    if (wait) {
      log(`  ${city.code}: ${api} busy, waiting ${wait} s`);
      await sleep(wait * 1000);
    }
    requests++;
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(`${api}/interpreter`, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(300_000),
      });
    } catch (e) {
      const b = Math.min(240, 30 * 2 ** attempt);
      log(`  ${city.code}: ${e.message}; backing off ${b} s`);
      await sleep(b * 1000);
      continue;
    }
    if (RETRY.has(res.status)) {
      await res.text();
      const b = Math.min(240, 30 * 2 ** attempt);
      log(`  ${city.code}: HTTP ${res.status}; backing off ${b} s`);
      await sleep(b * 1000);
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${city.code}: HTTP ${res.status} ${text.slice(0, 200)}`);
    const json = JSON.parse(text);
    if (json.remark) {
      // a runtime error (timeout, out of memory) comes back as a 200 with a remark and partial data: retry
      const b = Math.min(240, 30 * 2 ** attempt);
      log(`  ${city.code}: remark "${json.remark.slice(0, 120)}"; backing off ${b} s`);
      await sleep(b * 1000);
      continue;
    }
    const meta = { centre, half: HALF_M, endpoint: `${api}/interpreter`, fetched: new Date().toISOString().slice(0, 10) };
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, text);
    fs.writeFileSync(metaFile, JSON.stringify(meta));
    log(`  ${city.code}: ${(text.length / 1e6).toFixed(1)} MB, ${json.elements.length} elements, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    return { json, meta, requests };
  }
  throw Object.assign(new Error(`${city.code}: Overpass kept failing`), { requests });
}
