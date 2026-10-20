// Proof that threading CityPlan through the code changed nothing (Phase 2: plumbing, no visible change). Each hash was
// computed on the tree before plan.ts existed and committed here as a literal: the terrain of five Regions (every tile's
// kind and ground sprite, every prop, road, bridge, island and site), their road graphs (nodes, edges, lanes), the core
// layout (roads, zebras, plots, landmarks, lots, AZ islands), the decor at every tier and the camera's framing.
import { describe, expect, it } from 'vitest';
import { CORE, frameTarget } from '@/game/camera';
import { decorPlan, type DecorWorld } from '@/game/decor';
import { isZebra, RoadGraph } from '@/game/RoadGraph';
import { riverLoop, seaLane } from '@/game/waterways';
import { azsFor, GATE, GRID, homeRectFor, isFootprint, isRoad, LANDMARKS, openLots, plotAt } from '@/world/layout';
import { zonesFor } from '@/world/regions';
import { DISTRICTS, SERVICES } from '@/world/taxonomy';
import { EXT, RING_MAX, RING_MIN, terrainFor } from '@/world/terrain';

/** FNV-1a over a JSON string, as 8 hex digits. */
const hash = (v: unknown) => {
  const s = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};

const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1', 'me-south-1'] as const;

const terrainHash = (code: string) => {
  // City Clients' lots (Phase D) are placed after everything else and only clear props under them: left out here, the
  // landscape hashes to exactly what it was.
  const t = terrainFor(code, zonesFor(code), [], undefined, { clientLots: false });
  const tiles: string[] = [];
  for (let y = RING_MIN - 2; y <= RING_MAX + 2; y++) for (let x = RING_MIN - 2; x <= RING_MAX + 2; x++) tiles.push(`${t.kind(x, y)}:${t.ground(x, y) ?? ''}`);
  const { kind: _k, ground: _g, clientLots: _c, ...rest } = t;
  return hash({ rest, tiles });
};

const graphHash = (code: string) => {
  const g = new RoadGraph(terrainFor(code, zonesFor(code)));
  return hash({ nodes: g.nodes, edges: g.edges, lanes: g.lanes, gate: g.gate, end: g.highwayEnd });
};

const coreHash = () => {
  const tiles: string[] = [];
  for (let y = -2; y < GRID + 2; y++)
    for (let x = -2; x < GRID + 2; x++) tiles.push(`${isRoad({ x, y }) ? 'r' : ''}${isZebra(x, y) ? 'z' : ''}${isFootprint(x, y) ? 'f' : ''}${plotAt({ x, y }) ?? ''}`);
  return hash({
    tiles,
    landmarks: LANDMARKS,
    lots: DISTRICTS.map((d) => openLots(d.id)),
    homes: SERVICES.map((s) => homeRectFor(s.id)),
    gate: GATE,
    islands: REGIONS.map((r) => azsFor(r)),
    sizes: [1, 2, 3, 4, 5, 6].map((n) => azsFor('us-east-1', Array.from({ length: n }, (_, i) => ({ name: `us-east-1${'abcdef'[i]}`, id: `use1-az${i + 1}` })))),
    ext: [EXT, RING_MIN, RING_MAX],
  });
};

const foot = new Set<number>();
for (const l of LANDMARKS) for (let y = l.footprint.y; y < l.footprint.y + l.footprint.h; y++) for (let x = l.footprint.x; x < l.footprint.x + l.footprint.w; x++) foot.add(y * GRID + x);
const sidewalk = (x: number, y: number) =>
  !isRoad({ x, y }) && !foot.has(y * GRID + x) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isRoad({ x: x + dx, y: y + dy }));
const decorHash = () =>
  hash(
    [-1, 0, 1, 2, 3, 4].flatMap((tier) =>
      [false, true].map((open) => decorPlan({ landmarks: LANDMARKS, isSidewalk: sidewalk, districtOpen: () => open, tierOf: () => tier } satisfies DecorWorld)),
    ),
  );

const cameraHash = () => hash({ CORE, frames: [[400, 700], [1280, 800], [1920, 1080], [3840, 2160]].map(([w, h]) => frameTarget(w, h)) });
const waterHash = () => hash({ loops: [2, 3, 4].map((lane) => riverLoop(lane)), sea: REGIONS.map((r) => seaLane(terrainFor(r, zonesFor(r)))) });

const EXPECTED = {
  terrain: { 'us-east-1': 'b35273f8', 'us-west-2': '2ae10fd0', 'eu-west-1': 'ac0503ac', 'ap-southeast-1': '1dfe73c2', 'me-south-1': 'e64673f8' },
  graph: { 'us-east-1': '8fa8c0a5', 'us-west-2': '60832fde', 'eu-west-1': 'f228ba99', 'ap-southeast-1': 'e019457e', 'me-south-1': '5fc4479f' },
  // Re-taken in Phase 6, the only legacy changes it forces: Transit Gateway takes the networking lot Route 53 left
  // open, Global Accelerator takes the Global Gate's fourth lot, the classic city leaves out the services it has no
  // lot for (layout.ts UNPLACED_SERVICES, the management district among them), and the hashed lists name the new
  // services. Terrain, road graphs, camera and waterways are untouched (their hashes are the originals).
  core: '46c7d874',
  decor: '5d34b73d',
  camera: 'c385e605',
  water: 'c7f81679',
};

describe('the legacy city is unchanged by CityPlan (snapshot taken before the refactor)', () => {
  it.each(REGIONS)('%s: terrain (every tile, prop, road, bridge, island and site)', (r) => expect(terrainHash(r)).toBe(EXPECTED.terrain[r]));
  it.each(REGIONS)('%s: road graph (nodes, edges, lanes)', (r) => expect(graphHash(r)).toBe(EXPECTED.graph[r]));
  it('core layout: roads, zebras, footprints, plots, landmarks, lots, AZ islands', () => expect(coreHash()).toBe(EXPECTED.core));
  it('decor at every tier, open and locked', () => expect(decorHash()).toBe(EXPECTED.decor));
  it('camera framing', () => expect(cameraHash()).toBe(EXPECTED.camera));
  it('waterways', () => expect(waterHash()).toBe(EXPECTED.water));
});
