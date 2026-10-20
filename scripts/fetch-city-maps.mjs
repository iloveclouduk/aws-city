// Builds each Region's street plan from OpenStreetMap and writes shared/city-maps/<code>.json (one compact line each,
// ≤ 12 KB). The centres are curated in shared/city-centres.json (the Region's named city downtown, not a claim about
// where data centres are). Map data © OpenStreetMap contributors, ODbL 1.0 (shared/city-maps/LICENSE.md).
//
// Usage: npm run city-maps [-- flags]
//   --only a,b      just these Regions
//   --from-cache    no network: Regions without cached OSM data are skipped
//   --refresh       refetch even when .cache/osm/<code>.json exists
//   --preview       also write .cache/city-maps/<code>.png (the plan beside the raw OSM) and summary.json
//
// One Overpass request per Region, sequential, with a status check, back-off and a 10 s pause between Regions
// (scripts/citymap/overpass.mjs). Never run in CI: the extension and the tests only read the committed JSON.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { osmFor, PAUSE_MS } from './citymap/overpass.mjs';
import { parseOsm, rasterise } from './citymap/rasterise.mjs';
import { encodeMap } from './citymap/encode.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shared', 'city-maps');
const CACHE = path.join(ROOT, '.cache', 'osm');
const PREVIEW = path.join(ROOT, '.cache', 'city-maps');
const MAX_BYTES = 12 * 1024;

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const onlyArg = args.indexOf('--only');
const only = onlyArg >= 0 ? new Set((args[onlyArg + 1] || '').split(',').filter(Boolean)) : null;
const FROM_CACHE = flag('--from-cache');
const REFRESH = flag('--refresh');
const WANT_PREVIEW = flag('--preview');
if (FROM_CACHE && REFRESH) throw new Error('--from-cache and --refresh contradict each other');

// The S1 spike's raw files (same query) are reused when a centre is within 200 m of the spike's.
const seeds = [];
const spike = path.join(ROOT, '.cache', 'spike-osm', 'cities.mjs');
if (fs.existsSync(spike)) {
  const { CITIES, HALF_M } = await import(spike);
  for (const c of CITIES) seeds.push({ file: path.join(ROOT, '.cache', 'spike-osm', 'raw', `${c.id}.json`), centre: { lat: c.lat, lon: c.lon }, half: HALF_M });
}

const centres = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'city-centres.json'), 'utf8'));
const todo = centres.filter((c) => !only || only.has(c.code));
if (only) for (const code of only) if (!centres.some((c) => c.code === code)) throw new Error(`unknown Region ${code}`);
fs.mkdirSync(OUT, { recursive: true });
if (WANT_PREVIEW) fs.mkdirSync(PREVIEW, { recursive: true });

let requests = 0;
const failures = [];
const summary = [];
for (const c of todo) {
  console.log(`${c.code} (${c.city})`);
  let osm;
  try {
    osm = await osmFor(c, { cacheDir: CACHE, refresh: REFRESH, cacheOnly: FROM_CACHE, seeds });
  } catch (e) {
    requests += e.requests || 0;
    failures.push(`${c.code}: ${e.message}`);
    console.log(`  failed: ${e.message}`);
    continue;
  }
  if (!osm) {
    console.log('  no cached data; skipped');
    continue;
  }
  requests += osm.requests;
  const d = parseOsm(osm.json, c);
  const { pick, tries } = rasterise(d);
  const alts = tries.map((t) => `${t.mpt}m: fid ${t.metrics.fidelity} lots ${t.metrics.lots} water ${(t.metrics.water * 100).toFixed(0)}%${t.errors.length ? ` (${t.errors.length} errors: ${t.errors[0]})` : ''}`);
  if (!pick) {
    failures.push(`${c.code}: no scale meets the rules (${alts.join('; ')})`);
    console.log(`  no plan: ${alts.join('; ')}`);
  } else {
    const file = encodeMap(pick, { region: c.code, city: c.city, centre: [c.lat, c.lon], fetched: osm.meta.fetched, source: osm.meta.endpoint });
    const text = JSON.stringify(file);
    const bytes = Buffer.byteLength(text);
    if (bytes > MAX_BYTES) {
      failures.push(`${c.code}: ${bytes} bytes (over ${MAX_BYTES})`);
    } else fs.writeFileSync(path.join(OUT, `${c.code}.json`), text + '\n');
    const m = pick.metrics;
    console.log(`  ${pick.mpt} m/tile, bearing ${file.bearing}° rot ${file.rot}, shift ${file.shift}, fidelity ${m.fidelity}, lots ${m.lots}, water ${(m.water * 100).toFixed(1)}%, ${m.streets} streets (${m.avenues} avenues, ${m.synthetic} synthetic), dropped ${m.dropped}, ${bytes} B`);
    summary.push({ code: c.code, city: c.city, ...m, bearing: file.bearing, shift: file.shift, bytes, alternatives: alts });
    if (WANT_PREVIEW) {
      const { writePreview } = await import('./citymap/preview.mjs');
      writePreview(path.join(PREVIEW, `${c.code}.png`), d, pick);
    }
  }
  if (osm.requests && c !== todo[todo.length - 1]) await new Promise((r) => setTimeout(r, PAUSE_MS));
}
if (WANT_PREVIEW) fs.writeFileSync(path.join(PREVIEW, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(`\n${summary.length} plans written, ${requests} Overpass requests${failures.length ? `, ${failures.length} failed:\n  ${failures.join('\n  ')}` : ''}`);
if (failures.length) process.exitCode = 1;
