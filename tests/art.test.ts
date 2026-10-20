import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import world from '../shared/world.json' with { type: 'json' };

const TILES = path.resolve(__dirname, '../art/tiles');
const SERVICES = path.join(TILES, 'services');
const DISTRICTS = world.districts.map((d) => d.id);
// Every service building lives in art/tiles/services/<district>.py: its front building lm_<id> and its tower tw_<id>.
const mod = (d: string) => fs.readFileSync(path.join(SERVICES, `${d}.py`), 'utf8');
const all = DISTRICTS.map(mod).join('\n');
// Every other art module (props, culture, HQs, kit): none of them may define a service building.
const others = [
  ...fs.readdirSync(TILES).filter((f) => f.endsWith('.py')).map((f) => path.join(TILES, f)),
  ...fs.readdirSync(SERVICES).filter((f) => f.endsWith('.py') && !DISTRICTS.includes(f.slice(0, -3))).map((f) => path.join(SERVICES, f)),
].map((f) => fs.readFileSync(f, 'utf8')).join('\n');

describe('service buildings (art/tiles/services/<district>.py)', () => {
  it('every district has its module', () => {
    for (const d of DISTRICTS) expect(fs.existsSync(path.join(SERVICES, `${d}.py`)), d).toBe(true);
  });

  it.each(world.services.map((s) => [s.id, s.districtId]))('%s has its front building lm_<id> and its tower tw_<id> in services/%s.py', (id, district) => {
    expect(mod(district)).toMatch(new RegExp(`^def lm_${id}\\(fw, fh, tier, col, key\\):`, 'm'));
    expect(mod(district)).toMatch(new RegExp(`^def tw_${id}\\(tier, k\\):`, 'm'));
    expect(all.match(new RegExp(`^def lm_${id}\\(`, 'gm'))?.length, id).toBe(1);
    expect(all.match(new RegExp(`^def tw_${id}\\(`, 'gm'))?.length, id).toBe(1);
  });

  it('every lm_ has its tw_ (and the reverse), only for its own district, and no other module draws a service', () => {
    const ids = new Set(world.services.map((s) => s.id));
    for (const d of DISTRICTS) {
      const names = [...mod(d).matchAll(/^def (lm|tw)_(\w+)\(/gm)].map((m) => [m[1], m[2]] as const);
      const own = new Set(world.services.filter((s) => s.districtId === d).map((s) => s.id));
      for (const [kind, id] of names) {
        expect(own.has(id), `services/${d}.py: ${kind}_${id}`).toBe(true);
        expect(names.some(([k, i]) => i === id && k !== kind), `services/${d}.py: ${kind}_${id} without its pair`).toBe(true);
      }
    }
    for (const m of others.matchAll(/^def (lm|tw)_(\w+)\(/gm)) expect(ids.has(m[2]!), `${m[1]}_${m[2]} outside services/<district>.py`).toBe(false);
  });

  it('service towers end on the lot centre line and their Master skylines differ (art/tiles/report.json)', () => {
    const report = JSON.parse(fs.readFileSync(path.join(TILES, 'report.json'), 'utf8')) as {
      tips: Record<string, number>;
      overlap: Record<string, { worst: number; pair: string }>;
    };
    for (const s of world.services) expect(report.tips[s.id], s.id).toBeGreaterThan(132);
    expect(Object.keys(report.overlap).sort()).toEqual([...DISTRICTS].sort());
    for (const [d, o] of Object.entries(report.overlap)) expect(o.worst, `${d}: ${o.pair}`).toBeLessThan(0.8);
  });

  it('districts use the official AWS Architecture Icon category colours', () => {
    const want = { compute: '#ED7100', storage: '#7AA116', database: '#C925D1', networking: '#8C4FFF', security: '#DD344C', aiml: '#01A88D', management: '#E7157B' };
    expect(Object.fromEntries(world.districts.map((d) => [d.id, d.color.toUpperCase()]))).toEqual(want);
  });
});

describe('generated atlas (npm run art)', () => {
  const atlas = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/sprites.json'), 'utf8')) as { sprites: Record<string, unknown> };
  const has = (n: string) => n in atlas.sprites;

  it('every culture / campus site has its sprite, so no plot is left blank', async () => {
    const { SITES } = await import('@/world/layout');
    for (const s of SITES) expect(has(s.site!.sprite), `${s.id} → ${s.site!.sprite}`).toBe(true);
  });

  it('has the delivery van in all four facings, the data-centre blink frames and the plot decor', () => {
    const want = [
      ...['SE', 'SW', 'NE', 'NW'].map((d) => `culture:van:${d}`),
      'culture:dc:0@lights',
      'culture:dc:blink0',
      'culture:dc:blink1',
      ...['paver', 'lotPad', 'hoardingX', 'hoardingY', 'billboard', 'cone', 'lotSign', 'construction2x2', 'grassDark'],
      ...[0, 1, 2, 3].map((i) => `pack:data_center:${i}`),
      'pack:lamp_post',
      'pack:bench_SE',
      'pack:bench_SW',
    ];
    for (const n of want) expect(has(n), n).toBe(true);
  });

  it('the four van frames share one canvas so Ops can swap them in place', () => {
    const vans = ['SE', 'SW', 'NE', 'NW'].map((d) => JSON.stringify(atlas.sprites[`culture:van:${d}`]));
    expect(new Set(vans).size).toBe(1);
  });

  it('has the landscape art (plan B2), and every sprite the terrain asks for', async () => {
    const biomes = ['temperate', 'boreal', 'arid', 'tropical'];
    const want = [
      ...['shore', 'cliff', 'quay'].flatMap((s) => [`${s}L`, `${s}R`]),
      'field0', 'field1', 'shingle', 'highwayX', 'highwayY',
      'bridgeX', 'bridgeY', 'bridgeHighway', 'gateArch', 'highwaySign', 'lighthouse', 'pierX', 'pierY', 'farmhouse',
      'windTurbine0', 'windTurbine1', 'windTurbine2', 'rock', 'palm', 'pineSnow', 'cactus',
      'azPad', 'substation2x2', 'coolingTower', 'fenceX', 'fenceY', 'azSign',
      ...biomes.flatMap((b) => [`meadow:${b}:0`, `meadow:${b}:1`, `forest2x2:${b}`, `forest3x3:${b}`, `hill3x3:${b}`]),
    ];
    for (const n of want) expect(has(n), n).toBe(true);
    const { terrainFor, RING_MIN, RING_MAX } = await import('@/world/terrain');
    for (const code of ['us-east-1', 'eu-north-1', 'me-central-1', 'ap-southeast-1']) {
      const t = terrainFor(code);
      for (const p of t.props) expect(has(p.sprite), `${code}: ${p.sprite}`).toBe(true);
      for (const f of t.islands.flatMap((i) => i.fences)) expect(has(f.sprite), `${code}: ${f.sprite}`).toBe(true);
      for (let y = RING_MIN; y <= RING_MAX; y++)
        for (let x = RING_MIN; x <= RING_MAX; x++) {
          const g = t.ground(x, y);
          if (g) expect(has(g), `${code}: ${g}`).toBe(true);
        }
    }
  });

  it('the turbine frames share one canvas, and the sea textures exist', () => {
    expect(new Set([0, 1, 2].map((f) => JSON.stringify(atlas.sprites[`windTurbine${f}`]))).size).toBe(1);
    for (const f of ['sea.png', 'seaGlint.png']) expect(fs.existsSync(path.resolve(__dirname, `../public/assets/city/${f}`)), f).toBe(true);
  });

  const DIRS = ['SE', 'SW', 'NE', 'NW'];
  const VEHICLES = [...['navy', 'orange', 'white', 'teal', 'server', 'packet', 'fibre', 'cloud'].map((c) => `veh:car:${c}`), 'veh:bus', 'veh:truck', 'veh:ferry', 'veh:sail', 'veh:barge'];

  it('has the city life art (plan B3): vehicles in four facings, boats, the sky, headlights and a bus stop', () => {
    const want = [
      ...VEHICLES.flatMap((v) => DIRS.map((d) => `${v}:${d}`)),
      'planeE', 'planeW', 'planeShadow', 'bird0', 'bird1', 'cloud0', 'cloud1', 'cloud2', 'cloudShadow', 'headlight', 'busStop',
    ];
    for (const n of want) expect(has(n), n).toBe(true);
  });

  it('each vehicle’s four facings share one canvas, so Traffic and Boats swap frames in place', () => {
    for (const v of VEHICLES) expect(new Set(DIRS.map((d) => JSON.stringify(atlas.sprites[`${v}:${d}`]))).size, v).toBe(1);
    expect(new Set([0, 1].map((f) => JSON.stringify(atlas.sprites[`bird${f}`]))).size).toBe(1);
    expect(new Set(['E', 'W'].map((d) => JSON.stringify(atlas.sprites[`plane${d}`]))).size).toBe(1);
  });

  it('road vehicles are drawn to the 32×16 tile: a one-tile footprint, anchored at its N corner', () => {
    for (const v of VEHICLES.filter((n) => !['veh:ferry', 'veh:barge'].includes(n))) {
      const a = atlas.sprites[`${v}:SE`] as { ax: number; ay: number; w: number; h: number };
      expect(a.w, v).toBe(36); // 32 px across one tile plus the canvas pad
      expect(a.ax, v).toBe(18);
    }
  });
});

describe('knowledge towers (art/tiles/growth_art.py)', () => {
  type Anchor = { ax: number; ay: number; w: number; h: number };
  const sprites = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/sprites.json'), 'utf8')) as { sprites: Record<string, Anchor> }).sprites;
  const pages = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/atlas.json'), 'utf8')) as { textures: { size: { w: number; h: number } }[] }).textures;

  it.each(world.services.map((s) => s.id))('%s rises with every level, Master far above its Novice building', (id) => {
    // ay = how far the drawing reaches above the lot's N corner (the empty sky is trimmed)
    const up = [1, 2, 3, 4].map((t) => sprites[`lm:${id}:${t}`]!.ay);
    for (let t = 1; t < 4; t++) expect(up[t], `lm:${id}:${t + 1}`).toBeGreaterThan(up[t - 1]!);
    expect(up[3]).toBeGreaterThanOrEqual(Math.max(2.5 * up[0]!, up[0]! + 100));
  });

  it('each night-lights layer sits on its building (same anchor at the lot corner; only a beacon\'s glow above the roof)', () => {
    for (const [name, a] of Object.entries(sprites)) {
      if (!name.startsWith('lm:') || !name.endsWith('@lights')) continue;
      const img = sprites[name.replace('@lights', '')]!;
      expect(a.ax, name).toBe(img.ax);
      expect(a.ay, name).toBeLessThanOrEqual(img.ay + 4);
    }
  });

  it('has the three legend crowns (art/tiles/legend_art.py), each with its night glow', () => {
    for (const n of [1, 2, 3]) {
      expect(sprites[`legend:${n}`], `legend:${n}`).toBeDefined();
      expect(sprites[`legend:${n}@lights`], `legend:${n}@lights`).toBeDefined();
    }
    // each crown holds the ones below it, so each is taller
    expect(sprites['legend:2']!.h).toBeGreaterThan(sprites['legend:1']!.h);
    expect(sprites['legend:3']!.h).toBeGreaterThan(sprites['legend:2']!.h);
  });

  it('the atlas stays within 3 pages of 2048 px (safe on every GPU, light in the side panel)', () => {
    expect(pages.length).toBeLessThanOrEqual(3);
    for (const p of pages) expect(Math.max(p.size.w, p.size.h)).toBeLessThanOrEqual(2048);
  });
});

describe('trimmed atlas frames (generate_tiles.py pack)', () => {
  type Anchor = { ax: number; ay: number; w: number; h: number };
  type Rect = { x: number; y: number; w: number; h: number };
  type Frame = { filename: string; frame: Rect; trimmed: boolean; spriteSourceSize: Rect; sourceSize: { w: number; h: number } };
  const sprites = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/sprites.json'), 'utf8')) as { sprites: Record<string, Anchor> }).sprites;
  const pages = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/atlas.json'), 'utf8')) as { textures: { size: { w: number; h: number }; frames: Frame[] }[] }).textures;
  const frames = Object.fromEntries(pages.flatMap((p) => p.frames).map((f) => [f.filename, f]));

  it('every frame keeps its full canvas (sourceSize = sprites.json w×h), so anchors, origins and in-place frame swaps stay exact', () => {
    expect(Object.keys(frames).sort()).toEqual(Object.keys(sprites).sort());
    for (const [name, a] of Object.entries(sprites)) {
      const f = frames[name]!;
      expect([f.sourceSize.w, f.sourceSize.h], name).toEqual([a.w, a.h]);
      const s = f.spriteSourceSize;
      expect([s.w, s.h], name).toEqual([f.frame.w, f.frame.h]);
      expect(s.x >= 0 && s.y >= 0 && s.x + s.w <= a.w && s.y + s.h <= a.h, name).toBe(true);
      expect(f.trimmed, name).toBe(s.w !== a.w || s.h !== a.h);
    }
  });

  it('frames never overlap on a page', () => {
    for (const p of pages) {
      const rs = p.frames.map((f) => f.frame).sort((a, b) => a.y - b.y || a.x - b.x);
      for (const r of rs) expect(r.x + r.w <= p.size.w && r.y + r.h <= p.size.h).toBe(true);
      for (let i = 0; i < rs.length; i++)
        for (let j = i + 1; j < rs.length && rs[j]!.y < rs[i]!.y + rs[i]!.h; j++) {
          const [a, b] = [rs[i]!, rs[j]!];
          expect(a.x + a.w <= b.x || b.x + b.w <= a.x, `${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(true);
        }
    }
  });

  it('each building\'s night lights land on the building: their lit pixels lie inside its canvas in world space (a beacon\'s glow may reach 4 px above)', () => {
    for (const [name, f] of Object.entries(frames)) {
      // the Legend crown's beam is night-lights only, drawn high above its crown (legend_art.py)
      if (!name.endsWith('@lights') || name === 'legend:3@lights') continue;
      const lit = sprites[name]!;
      const b = sprites[name.replace('@lights', '')]!;
      // world offsets from the shared lot corner
      const x0 = f.spriteSourceSize.x - lit.ax, y0 = f.spriteSourceSize.y - lit.ay;
      expect(x0 >= -b.ax && x0 + f.frame.w <= b.w - b.ax, name).toBe(true);
      expect(y0 >= -b.ay - 4 && y0 + f.frame.h <= b.h - b.ay, name).toBe(true);
    }
  });

  it('the packed sprite area stays within budget (≤ 10.5M px: room for the services and towers still to come)', () => {
    const area = Object.values(frames).reduce((s, f) => s + f.frame.w * f.frame.h, 0);
    expect(area).toBeLessThanOrEqual(10_500_000);
  });
});

describe('crowd-size characters (art/characters/crowd_small.py)', () => {
  const CHARS = path.resolve(__dirname, '../public/assets/characters');
  const index = JSON.parse(fs.readFileSync(path.join(CHARS, 'index.json'), 'utf8')) as Record<string, { role: string; anims: string[]; frame?: number[]; of?: string }>;
  // Width and height from a PNG's IHDR chunk.
  const pngSize = (file: string) => {
    const b = fs.readFileSync(file);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };

  it('every citizen has a 3/4-size crowd copy with the same animations, in whole 36×54 frames', () => {
    const citizens = Object.entries(index).filter(([, c]) => c.role === 'citizen' || c.role === 'agent');
    expect(citizens.length).toBeGreaterThan(0);
    for (const [id, c] of citizens) {
      const crowd = index[`${id}-crowd`];
      expect(crowd, id).toMatchObject({ role: 'crowd', of: id, frame: [36, 54], anims: c.anims });
      const [w, h] = pngSize(path.join(CHARS, `${id}-crowd`, 'sheet.png'));
      const [fw, fh] = pngSize(path.join(CHARS, id, 'sheet.png'));
      expect([w, h], id).toEqual([(fw / 48) * 36, (fh / 72) * 54]);
    }
  });

  it('crowd copies never outlive their citizen (Kai\'s gold jacket has one too, for visiting Mayors)', () => {
    for (const [id, c] of Object.entries(index)) if (c.role === 'crowd' && c.of !== 'player-gold') expect(['citizen', 'agent'], id).toContain(index[c.of ?? '']?.role);
    expect(index['player-gold-crowd']?.of).toBe('player-gold');
  });

  it('every service agent and special agent has its sheet (art/characters/aws_city.py), so none falls back to a citizen', () => {
    const ids = [...world.services.map((s) => s.id), ...Object.keys(world.special)];
    for (const id of ids) {
      expect(index[id]?.role, id).toBe('agent');
      expect(fs.existsSync(path.join(CHARS, id, 'sheet.png')), id).toBe(true);
    }
  });

  it('the fallback sheet for a missing texture exists (src/game/Agent.ts)', () => {
    expect(index['citizen0-crowd']?.of).toBe('citizen0');
  });
});

describe('dense streets (art/tiles/infill_art.py, art/tiles/streets_art.py)', () => {
  type Anchor = { ax: number; ay: number; w: number; h: number };
  type Frame = { filename: string; frame: { w: number; h: number }; spriteSourceSize: { x: number; y: number } };
  type Infill = { name: string; kind: string; cls: 'low' | 'mid' | 'high' | 'sky'; fw: number; fh: number; style: string; h: number };
  const sprites = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/sprites.json'), 'utf8')) as { sprites: Record<string, Anchor> }).sprites;
  const pages = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/atlas.json'), 'utf8')) as { textures: { frames: Frame[] }[] }).textures;
  const frames = Object.fromEntries(pages.flatMap((p) => p.frames).map((f) => [f.filename, f]));
  const infill = JSON.parse(fs.readFileSync(path.join(TILES, 'infill.json'), 'utf8')) as Infill[];
  const LIMIT = { low: 40, mid: 80, high: 130, sky: 180 };
  const CLASS: Record<string, Infill['cls']> = {
    brownstone: 'low', corner: 'low', rowhouse: 'low', walkup: 'mid', loft: 'mid', prewar: 'high', slab: 'high', setback: 'sky',
  };

  it('every infill.json entry has its sprite, named for its style, kind and footprint, with night lights', () => {
    expect(infill.length).toBeGreaterThan(0);
    for (const e of infill) {
      expect(e.name, e.name).toMatch(new RegExp(`^in:${e.style}:${e.kind}:${e.fw}x${e.fh}:\\d+$`));
      expect(['warm', 'cool']).toContain(e.style);
      expect(e.cls, e.name).toBe(CLASS[e.kind]);
      expect(sprites[e.name], e.name).toBeDefined();
      expect(sprites[`${e.name}@lights`], `${e.name}@lights`).toBeDefined();
    }
    for (const kind of Object.keys(CLASS)) for (const style of ['warm', 'cool'])
      expect(infill.some((e) => e.kind === kind && e.style === style), `${style} ${kind}`).toBe(true);
    expect(Object.keys(sprites).filter((n) => n.startsWith('in:') && !n.endsWith('@lights')).sort()).toEqual(infill.map((e) => e.name).sort());
  });

  it('each infill sprite is drawn on its footprint (canvas and anchor) and keeps to its height class', () => {
    for (const e of infill) {
      const a = sprites[e.name]!;
      expect(a.w, e.name).toBe(16 * (e.fw + e.fh) + 4);
      expect(a.ax, e.name).toBe(16 * e.fh + 2);
      // h = how far the drawing reaches above the footprint's N corner (the anchor), as the trimmed frame shows
      expect(e.h, e.name).toBe(a.ay - frames[e.name]!.spriteSourceSize.y);
      expect(e.h, e.name).toBeLessThanOrEqual(LIMIT[e.cls]);
    }
  });

  it('has the avenue ground, the wide zebras, the traffic lights in every state and the street trees', () => {
    for (const n of ['avenueX0', 'avenueX1', 'avenueY0', 'avenueY1', 'avenueJunction', 'zebra2X', 'zebra2Y', 'tree:street:0', 'tree:street:1'])
      expect(sprites[n], n).toBeDefined();
    for (const d of ['ns', 'ew']) for (const s of ['g', 'a', 'r']) {
      expect(sprites[`signal:${d}:${s}`], `signal:${d}:${s}`).toBeDefined();
      expect(sprites[`signal:${d}:${s}@lights`], `signal:${d}:${s}@lights`).toBeDefined();
    }
    // avenue tiles share the ground tiles' canvas, so they lay like road and sidewalk
    for (const n of ['avenueX0', 'avenueY1', 'avenueJunction', 'zebra2X']) expect(sprites[n], n).toEqual(sprites['roadX']);
  });
});

describe('City Clients and the airport (art/tiles/clients_art.py, art/tiles/airport_art.py)', () => {
  type Anchor = { ax: number; ay: number; w: number; h: number };
  const sprites = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/sprites.json'), 'utf8')) as { sprites: Record<string, Anchor> }).sprites;
  // Footprints the client sites are placed on (src/world/clients.ts): a canvas is 16 × (fw + fh) + 4 px wide.
  // Wave 2 (round 3) all fill the full 4×4 lot, so src/world/clients.ts CLIENT_FOOT needs no entry for them.
  const CLIENTS = {
    bank: 3, shop: 3, hospital: 4, school: 4, stadium: 4,
    studio: 4, games: 4, news: 4, port: 4, energy: 4, factory: 4, farm: 4, carmaker: 4, telecom: 4, council: 4, hotel: 4, charity: 4,
  };

  it.each(Object.entries(CLIENTS))('%s has levels 0-3 on its square plot (%i tiles a side), each with night lights, growing', (id, n) => {
    for (const level of [0, 1, 2, 3]) {
      const a = sprites[`client:${id}:${level}`];
      expect(a, `client:${id}:${level}`).toBeDefined();
      expect(a!.w, `client:${id}:${level}`).toBe(16 * 2 * n + 4);
      expect(sprites[`client:${id}:${level}@lights`], `client:${id}:${level}@lights`).toBeDefined();
    }
    // the drawing never shrinks from one level to the next, and level 3 stands well above level 0
    const up = [0, 1, 2, 3].map((l) => sprites[`client:${id}:${l}`]!.ay);
    for (let l = 1; l < 4; l++) expect(up[l], `client:${id}:${l}`).toBeGreaterThanOrEqual(up[l - 1]! - 2);
    expect(up[3]).toBeGreaterThan(up[0]! + 15);
  });

  it('client sites stay quieter than the AWS landmarks (lower than any Master tower)', () => {
    const master = Math.min(...world.services.map((s) => sprites[`lm:${s.id}:4`]!.ay));
    for (const id of Object.keys(CLIENTS)) expect(sprites[`client:${id}:3`]!.ay, id).toBeLessThan(master);
  });

  it('the airport has every piece of each level (src/world/airport.ts names them)', () => {
    const names = [
      'air:rwyEndW', 'air:rwy0', 'air:rwy1', 'air:rwyEndE', 'air:rwyEndW:3', 'air:rwyEndE:3', 'air:taxi', 'air:taxi:sign',
      'air:tower:0', 'air:tower', 'air:tower:3', 'air:terminal:locked', 'air:terminal', 'air:terminal:2', 'air:terminal:3',
      'air:stand', 'air:stand:1', 'air:stand:2', 'air:stand:3', 'air:sort', 'air:hangar:locked', 'air:hangar', 'air:hangar:3', 'air:crates',
    ];
    for (const n of names) expect(sprites[n], n).toBeDefined();
    // footprints: tower 1x2, terminal 4x2, stand 2x2, sort shed and hangars 3x2
    const w = (fw: number, fh: number) => 16 * (fw + fh) + 4;
    for (const n of ['air:tower:0', 'air:tower', 'air:tower:3']) expect(sprites[n]!.w, n).toBe(w(1, 2));
    for (const n of ['air:terminal', 'air:terminal:2', 'air:terminal:3', 'air:terminal:locked']) expect(sprites[n]!.w, n).toBe(w(4, 2));
    for (const n of ['air:sort', 'air:hangar', 'air:hangar:3', 'air:hangar:locked']) expect(sprites[n]!.w, n).toBe(w(3, 2));
    expect(sprites['air:tower:3']!.ay).toBeGreaterThan(sprites['air:tower']!.ay);
  });

  it('jets come in every facing, gear down and up, anchored at their centre, with their lights', () => {
    for (const kind of ['cargo', 'pax'])
      for (const d of ['SE', 'SW', 'NE', 'NW'])
        for (const s of ['', ':air']) {
          const n = `veh:plane:${kind}:${d}${s}`;
          const a = sprites[n];
          expect(a, n).toBeDefined();
          expect(sprites[`${n}@lights`], `${n}@lights`).toBeDefined();
          expect(Math.abs(a!.ax - a!.w / 2), n).toBeLessThanOrEqual(2);
        }
    expect(sprites['veh:plane:cargo:shadow']).toBeDefined();
  });

  it('the cargo livery follows shared/brand.json (the generator reads the same switch)', () => {
    const brand = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../shared/brand.json'), 'utf8')) as { amazon: boolean };
    expect(typeof brand.amazon).toBe('boolean');
    const src = fs.readFileSync(path.join(TILES, 'airport_art.py'), 'utf8');
    expect(src).toMatch(/shared", "brand\.json"/);
    expect(src).toContain('"PRIME AIR" if branded else "AIR CARGO"');
  });
});

describe('combos, seasons and the pocket parks (art/tiles/combos_art.py, seasons_art.py, park_art.py)', () => {
  type Anchor = { ax: number; ay: number; w: number; h: number };
  const sprites = (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/assets/city/sprites.json'), 'utf8')) as { sprites: Record<string, Anchor> }).sprites;
  const { combos } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../shared/combos.json'), 'utf8')) as {
    combos: { id: string; services: string[]; name: string; simple: string; source: string; sprite: string; size: [number, number]; radius: number }[];
  };
  const ids = new Set(world.services.map((s) => s.id));

  it('every combo joins real services, says one plain fact with its AWS source, and is unique', () => {
    expect(combos.length).toBeGreaterThanOrEqual(20);
    expect(new Set(combos.map((c) => c.id)).size).toBe(combos.length);
    expect(new Set(combos.map((c) => [...c.services].sort().join('+'))).size).toBe(combos.length);
    for (const c of combos) {
      expect(c.services.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.services.length, c.id).toBeLessThanOrEqual(3);
      for (const s of c.services) expect(ids.has(s), `${c.id}: ${s}`).toBe(true);
      expect(c.simple.length, c.id).toBeLessThanOrEqual(110);
      expect(c.source, c.id).toMatch(/^https:\/\/docs\.aws\.amazon\.com\//);
      expect(c.radius, c.id).toBeGreaterThan(0);
    }
  });

  it('every combo has its prop on its footprint, with a night glow', () => {
    for (const c of combos) {
      const a = sprites[c.sprite];
      expect(c.sprite, c.id).toBe(`combo:${c.id}`);
      expect(a, c.sprite).toBeDefined();
      expect(a!.w, c.sprite).toBe(16 * (c.size[0] + c.size[1]) + 4);
      expect(a!.ax, c.sprite).toBe(16 * c.size[1] + 2);
      expect(sprites[`${c.sprite}@lights`], `${c.sprite}@lights`).toBeDefined();
    }
  });

  it('each seasonal swap shares the canvas and anchor of the sprite it replaces, so the game only swaps a frame name', () => {
    const swaps = Object.keys(sprites).filter((n) => /^season:(winter|spring|summer|autumn):/.test(n) && !n.endsWith('@lights'));
    expect(swaps.length).toBeGreaterThan(30);
    for (const n of swaps) {
      const base = n.split(':').slice(2).join(':');
      if (!(base in sprites)) continue; // a new seasonal prop (snow drifts, umbrellas), not a swap
      expect(sprites[n], n).toEqual(sprites[base]);
    }
    for (const s of ['winter', 'autumn', 'spring']) for (const t of ['tree0', 'tree1', 'tree:street:0']) expect(sprites[`season:${s}:${t}`], `${s} ${t}`).toBeDefined();
    for (const n of ['season:winter:grass0', 'season:winter:pine', 'season:summer:tree1', 'season:winter:snowman', 'season:summer:umbrella0'])
      expect(sprites[n], n).toBeDefined();
  });

  it('pocket parks come in variants, and building sites show a crane and lights at night', () => {
    for (const n of ['park:gazebo', ...[0, 1, 2, 3].map((k) => `park:pocket:${k}`)]) expect(sprites[n], n).toBeDefined();
    for (const n of ['construction3x3', 'construction2x2']) {
      expect(sprites[`${n}@lights`], `${n}@lights`).toBeDefined();
      expect(sprites[n]!.ay, n).toBeGreaterThan(80); // the crane rises above the site
    }
  });
});
