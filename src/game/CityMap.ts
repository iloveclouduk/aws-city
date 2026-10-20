import Phaser from 'phaser';
import type { Progress } from '@/backend/contract';
import { isDiscovered, tierOf } from '@/state/store';
import type { LandmarkLayout, Tile } from '@/world/layout';
import { legacyPlan, type CityPlan } from '@/world/plan';
import { placeFor } from '@/world/places';
import { DISTRICTS, servicesIn, serviceById, type DistrictId } from '@/world/taxonomy';
import { addSprite, CITY_ATLAS, hasSprite, isPlaced, spriteAnchor } from './assets';
import { chunkRects, dirtyChunks, spriteBox, type Anchor, type Box } from './chunks';
import { boxOfImage, type Culler } from './cull';
import { decorKey, decorPlan, seasonDecal, siteGround, tileHash as hash, tilesOf, type DecorItem } from './decor';
import { cornerScreen, entityDepth, footprintDepth, toScreen, CITY_ISO } from './iso';
import { reducedMotion } from './motion';
import { isZebra } from './RoadGraph';
import { frontRowTiles, TIER_PLAZA } from './TierProps';
import { GroundBake, type Stamp } from './GroundBake';
import { hoodLots } from '@/world/clients';
import { buildingTiles, infillPlan, MAX_PARKED, type InfillResult } from './infill';
import { INFILL_CATALOGUE } from './infillCatalogue';
import { InfillLayer } from './InfillLayer';
import { infillStyleFor } from '@/world/regions';
import { surfaceFor } from '@/world/traffic';
import { comboBySprite, combosFound, type Combo } from '@/world/combos';
import { SEASON_TINT, type Season } from '@/world/seasons';

/**
 * Core ground chunks are chunk×chunk tiles: 10 on the legacy 40×40 core (16 chunks), 16 on a real map's 64×64 core (16
 * chunks again, each about 530×280 px): a district opening re-bakes the few it touches.
 */
export const chunkFor = (size: number) => (size > 40 ? 16 : 10);
/**
 * The baked core ground: over the ring's baked ground (Landscape, −0.5) and the fibre line beside the highway
 * (RegionOverlay, 1), as the per-tile Images were (depth x + y). The edge slabs stay under the ring's ground, as before.
 */
const CORE_DEPTH = 1.5;
const EDGE_DEPTH = -1;
/** Every ground frame is a flat 32×16 diamond anchored on its N corner (sprites.json); the edge slabs hang 26 px. */
const FLAT: Anchor = { ax: 16, ay: 0, w: 32, h: 16 };
/** Ground key for real water in the core: nothing is stamped, so the sea (Landscape) shows through. */
const SEA_KEY = 'sea';
/** Grid versions are unique across CityMaps, so a new scene's map never matches routes cached for an old one. */
let nextVersion = 1;

export interface LampRef {
  glow: Phaser.GameObjects.Image;
}

/**
 * Ground tiles, roads, sidewalks and street furniture. The ground is baked into chunked RenderTextures and only the
 * chunks a progress change touches are baked again; the furniture and decor are culled to the view (src/game/cull.ts).
 */
export class CityMap {
  /** The ground key of every core tile as last baked (row-major), so a sync re-bakes only the chunks that changed. */
  private keys?: string[];
  private ground!: GroundBake;
  private edges?: GroundBake;
  /** Water tiles animate (four frames on the 450 ms tick), so they stay Images over the baked ground, by tile. */
  private water = new Map<number, Phaser.GameObjects.Image>();
  private props = new Map<number, Phaser.GameObjects.Image>();
  /** Progress-driven decor (parks, hoardings, lot signs, Day 1 / campus furniture), keyed by decorKey. */
  private decor = new Map<string, { item: DecorItem; img: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image; lit?: Phaser.GameObjects.Image }>();
  /** Lit windows of decor (homes), over the night overlay like the landmarks'. */
  private windows = new Set<Phaser.GameObjects.Image>();
  /** Data-centre LED overlays (culture:dc:blink0/1) and the pack data hall's frames, stepped on the 450 ms tick. */
  private blinkers: Phaser.GameObjects.Image[] = [];
  private blinkFrame = 0;
  readonly blocked = new Set<number>();
  /** Bumped whenever decor blocks or frees tiles, so cached walking routes (RouteCache) are dropped. */
  blockedVersion = nextVersion++;
  readonly lamps: LampRef[] = [];
  private fountain?: Phaser.GameObjects.Image;
  private sidewalk = new Set<number>();
  /** Tiles City Clients' businesses stand on inside the core. */
  private clientTiles = new Set<number>();
  private footprintOf = new Map<number, string>();
  /** The infill (src/game/infill.ts): composed blocks of ordinary buildings, street trees, signals and parked cars. */
  readonly infill: InfillLayer;
  private surface: 'tab' | 'panel';
  /** Tiles infill buildings stand on (blocked for walkers), and the last plan (for tests in the dev console). */
  private infillBlocked = new Set<number>();
  lastInfill?: InfillResult;
  /** Tiles the player's own decorations stand on (build mode, src/game/BuildLayer.ts): blocked, and decor and infill leave them. */
  private built = new Set<number>();
  private builtKey = '';
  private lastProgress?: Progress;

  /** Core tiles are keyed row-major on the plan's size: `blocked` uses the same keys (CityScene's walkable). */
  readonly key = (x: number, y: number) => y * this.plan.size + x;
  private readonly size: number;
  private footprintIds: string[];
  private districts = DISTRICTS.map((d) => d.id);
  private globalIds: Set<string>;
  /** The row in front of each service landmark's lot, by tile: paved as a plaza from Expert (TierProps). */
  private frontRow: Map<number, string>;

  constructor(
    private scene: Phaser.Scene,
    private culler?: Culler,
    readonly plan: CityPlan = legacyPlan(),
    /** The city's season (src/world/seasons.ts): fixed for the scene's life (another season restarts the scene). */
    readonly season?: Season,
  ) {
    this.size = plan.size;
    this.footprintIds = [...new Set(plan.landmarks.filter(isPlaced).map((l) => l.id))].filter((id) => serviceById(id));
    this.globalIds = new Set(plan.landmarks.filter((l) => l.global).map((l) => l.id));
    this.frontRow = new Map(plan.landmarks.filter((l) => serviceById(l.id)).flatMap((l) => frontRowTiles(l).map((t) => [this.key(t.x, t.y), l.id] as const)));
    for (const l of plan.landmarks.filter(isPlaced))
      for (let y = l.footprint.y; y < l.footprint.y + l.footprint.h; y++)
        for (let x = l.footprint.x; x < l.footprint.x + l.footprint.w; x++) {
          this.blocked.add(this.key(x, y));
          this.footprintOf.set(this.key(x, y), l.id);
        }
    // City Clients' lots on a real map's neighbourhoods (src/world/clients.ts): a business stands there, so walkers go
    // round it and infill leaves it.
    for (const r of hoodLots(plan))
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          this.blocked.add(this.key(x, y));
          this.clientTiles.add(this.key(x, y));
        }
    // Real water inside the core (a river, a harbour) is never walked on: the sea under the city shows through it.
    if (plan.isWater)
      for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) if (plan.isWater(x, y)) this.blocked.add(this.key(x, y));
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        if (plan.isRoad({ x, y }) || this.footprintOf.has(this.key(x, y)) || plan.isWater?.(x, y)) continue;
        const nearRoad = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => plan.isRoad({ x: x + dx, y: y + dy }));
        if (nearRoad) this.sidewalk.add(this.key(x, y));
      }
    this.surface = surfaceFor(scene.scale.width);
    this.infill = new InfillLayer(scene, culler, this.surface);
    this.buildTiles();
    this.buildStreetFurniture();
    this.buildBlinkers();
    scene.time.addEvent({ delay: 450, loop: true, callback: () => this.animate() });
    scene.game.renderer.on('restorewebgl', this.rebake);
  }

  /** A static Image the culler shows only near the view (src/game/cull.ts). */
  private cull<T extends Phaser.GameObjects.Image>(img: T): T {
    this.culler?.add(img, boxOfImage(img));
    return img;
  }

  /** For the smoke's stats: ground Images left (animated water only), the ground textures and the last bake. */
  stats() {
    return {
      ...this.infill.stats(),
      groundImages: this.water.size,
      groundTextures: this.ground.count + (this.edges?.count ?? 0),
      bakeMs: Math.round(this.ground.lastMs * 10) / 10,
      bakeTotalMs: Math.round((this.ground.totalMs + (this.edges?.totalMs ?? 0)) * 10) / 10,
    };
  }

  destroy() {
    this.scene.game.renderer?.off('restorewebgl', this.rebake);
    this.infill.destroy();
  }

  isSidewalk = (x: number, y: number) => this.sidewalk.has(this.key(x, y)) || this.plan.plotAt({ x, y }) === 'square';
  /** Walkable sidewalk tiles (the ring round each plot, plus the square), for citizens picking where to stroll. */
  sidewalkTiles(): Tile[] {
    const out: Tile[] = [];
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) if (this.isSidewalk(x, y) && !this.blocked.has(this.key(x, y))) out.push({ x, y });
    return out;
  }
  isRoadTile = (x: number, y: number) => x >= 0 && y >= 0 && x < this.size && y < this.size && this.plan.isRoad({ x, y });

  /** Per-district open state for the progress being synced (cleared each sync), so 1,600 tiles ask once per district. */
  private openCache = new Map<DistrictId, boolean>();
  private openFor?: Progress;
  private openRegion?: string;
  /** What the ground last drew from: every district's open state and every landmark's tier (see groundSignature). */
  private groundSig?: string;

  /** The Region whose city this is (each Region builds its own: src/state/cities.ts). */
  private region = '';

  private districtOpen(p: Progress, d: DistrictId) {
    if (this.openFor !== p || this.openRegion !== this.region) {
      this.openFor = p;
      this.openRegion = this.region;
      this.openCache.clear();
    }
    let open = this.openCache.get(d);
    if (open === undefined) this.openCache.set(d, (open = servicesIn(d).some((s) => isDiscovered(p, s.id, this.region))));
    return open;
  }

  /**
   * Everything progress can change on the ground and in the decor: which districts are open and each landmark's tier.
   * XP that doesn't cross a tier, flashcards, quests and the rest leave it the same, so sync skips the tile pass.
   */
  private groundSignature(p: Progress) {
    let sig = `${this.builtKey}|`;
    for (const id of this.footprintIds) sig += `${tierOf(p, id, this.region)},`;
    for (const d of this.districts) sig += this.districtOpen(p, d) ? '1' : '0';
    return sig;
  }

  groundKey(t: Tile, p: Progress): string {
    const { x, y } = t;
    const road = this.plan.roadAt(x, y);
    if (road) {
      // Zebra crossings on the road tile either side of each junction (RoadGraph.isZebra).
      // Avenues (2-wide streets) have their own ground when it's drawn: two lanes with a double centre line between
      // them (lane 0 on the smaller x or y), a wide junction and a wide zebra on both lanes.
      if (road.width === 2) {
        const k = this.avenueKey(x, y, road.axis);
        if (k) return k;
      }
      if (road.axis === 'junction') return 'road';
      const zebra = isZebra(x, y, this.plan);
      if (road.axis === 'y') return zebra ? 'zebraX' : 'roadY';
      return zebra ? 'zebraY' : 'roadX';
    }
    // Real water inside the core (a real map's river or harbour): the sea shows through (not stamped, no Image).
    if (this.plan.isWater?.(x, y)) return SEA_KEY;
    const plot = this.plan.plotAt(t);
    if (plot === 'square') {
      // a green ring around the square, stone paths inside
      const r = this.plan.square;
      const edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
      return edge ? `grass${Math.floor(hash(x, y) * 3)}` : 'plazaStone';
    }
    if (this.sidewalk.has(this.key(x, y))) return 'sidewalk';
    // A real map's ground outside the districts: parks and neighbourhoods are grass (decor puts trees and homes on them).
    const g = plot === undefined ? this.plan.groundAt?.(x, y) : undefined;
    if (g === 'park') return hash(x, y) < 0.3 ? 'grassDark' : `grass${Math.floor(hash(x, y) * 3)}`;
    if (g === 'hood') return `grass${Math.floor(hash(x, y) * 3)}`;
    const lmId = this.footprintOf.get(this.key(x, y));
    // A global service's lot (the Global Gate, on the campus) follows its tier whether or not its district is open.
    const global = plot === 'campus' && !!lmId && this.globalIds.has(lmId);
    if ((plot === 'day1' || plot === 'campus') && !global) return siteGround(plot, t, this.plan);
    if (plot?.startsWith('future')) return 'sand';
    const d = plot as DistrictId;
    if (!global && !this.districtOpen(p, d)) return 'grassDark'; // a park behind hoardings until the district opens
    if (lmId && serviceById(lmId)) {
      const tier = tierOf(p, lmId, this.region);
      if (tier === 0) return 'dirt'; // construction site
      if (tier < 0) return 'lotPad'; // empty lot, not discovered yet
      const kind = placeFor(lmId)?.kind;
      const f = this.plan.landmarkLayout(lmId)!.footprint;
      if (kind === 'lake') return y === f.y + f.h - 1 ? 'sand' : 'water0';
      if (kind === 'dock' && y === f.y + f.h - 1) return 'water0';
      if (kind === 'garden') return 'grassDark';
    }
    const front = this.frontRow.get(this.key(x, y));
    if (front && plot !== 'campus' && tierOf(p, front, this.region) >= TIER_PLAZA) return 'plazaStone';
    return `grass${Math.floor(hash(x, y) * 3)}`;
  }

  /** An avenue tile's ground sprite (art/tiles: avenueX0/1, avenueY0/1, avenueJunction, zebra2X/Y), or undefined when undrawn. */
  private avenueKey(x: number, y: number, axis: 'x' | 'y' | 'junction'): string | undefined {
    let k: string;
    if (axis === 'junction') k = 'avenueJunction';
    else if (isZebra(x, y, this.plan)) k = axis === 'y' ? 'zebra2X' : 'zebra2Y';
    else {
      // Lane 0 is the one whose neighbour on the smaller side isn't part of the same avenue.
      const r = axis === 'x' ? this.plan.roadAt(x, y - 1) : this.plan.roadAt(x - 1, y);
      const lane = r && r.axis === axis && r.width === 2 ? 1 : 0;
      k = `avenue${axis.toUpperCase()}${lane}`;
    }
    return hasSprite(k) ? k : undefined;
  }

  private tileBox = (x: number, y: number): Box => spriteBox(CITY_ISO, spriteAnchor('grass0') ?? FLAT, x, y);

  /**
   * The core's ground is baked into chunked RenderTextures (src/game/GroundBake.ts) at the first sync; the edge slabs
   * along the two front sides never change, so they're baked once here.
   */
  private buildTiles() {
    this.ground = new GroundBake(this.scene, chunkRects(this.size, chunkFor(this.size), this.tileBox), CORE_DEPTH);
    if (this.season) this.ground.setTint(SEASON_TINT[this.season]);
    const edge = (x: number, y: number): Stamp[] =>
      (['edgeR', 'edgeL'] as const)
        .filter((name) => (name === 'edgeR' ? x === this.size - 1 : y === this.size - 1) && hasSprite(name))
        .map((name) => ({ name, box: spriteBox(CITY_ISO, spriteAnchor(name)!, x, y) }));
    const edgeStamps: Stamp[] = [];
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) edgeStamps.push(...edge(x, y));
    if (!edgeStamps.length) return;
    this.edges = new GroundBake(this.scene, chunkRects(this.size, chunkFor(this.size), (x, y) => edge(x, y)[0]?.box), EDGE_DEPTH);
    this.edgeStamps = edgeStamps;
    this.edges.bake(edgeStamps);
  }
  private edgeStamps: Stamp[] = [];

  /** Every core tile but water, back rows first (painter's order), for the chunks being baked. */
  private *groundStamps(keys: readonly string[]): Iterable<Stamp> {
    const n = this.size;
    for (let s = 0; s <= 2 * (n - 1); s++)
      for (let x = Math.max(0, s - n + 1); x <= Math.min(n - 1, s); x++) {
        const y = s - x;
        const k = keys[this.key(x, y)];
        if (k.startsWith('water') || k === SEA_KEY) continue;
        const box = this.tileBox(x, y);
        yield { name: k, box };
        // The season's ground decals (snow, leaves, petals) on some grass: stamped into the same chunk, no extra draw.
        const decal = k.startsWith('grass') ? seasonDecal(this.season, x, y) : undefined;
        if (decal && hasSprite(decal)) yield { name: decal, box };
      }
  }

  /** A lost WebGL context loses the textures' contents: bake everything again. */
  private rebake = () => {
    this.edges?.bake(this.edgeStamps);
    if (this.keys) this.ground.bake(this.groundStamps(this.keys));
  };

  /** Update ground to match progress (districts unlocking, lakes filling as S3 grows…). */
  sync(p: Progress, region: string) {
    this.region = region;
    this.lastProgress = p;
    const sig = this.groundSignature(p);
    if (sig === this.groundSig) return;
    this.groundSig = sig;
    const next: string[] = [];
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) next.push(this.groundKey({ x, y }, p));
    const dirty = dirtyChunks(this.keys, next, this.size, this.ground.rects, this.tileBox);
    // Water stays an Image (it animates); everything else is stamped into the chunks it touches.
    next.forEach((k, i) => {
      const img = this.water.get(i);
      if (k.startsWith('water') === !!img) return;
      if (img) {
        this.culler?.remove(img);
        img.destroy();
        this.water.delete(i);
        return;
      }
      const x = i % this.size;
      const y = Math.floor(i / this.size);
      const n = cornerScreen(CITY_ISO, x, y);
      this.water.set(i, this.cull(this.scene.add.image(n.x, n.y, CITY_ATLAS, `water${this.waterFrame}`).setOrigin(0.5, 0).setDepth(x + y)));
    });
    this.keys = next;
    if (dirty.size) this.ground.bake(this.groundStamps(next), dirty);
    this.syncDecor(p);
  }

  private waterFrame = 0;
  private animate() {
    this.waterFrame = (this.waterFrame + 1) % 4;
    for (const w of this.water.values()) w.setFrame(`water${this.waterFrame}`);
    this.fountain?.setFrame(`fountain${this.waterFrame % 3}`);
    this.infill.update(this.scene.time.now);
    if (reducedMotion()) return; // LEDs hold still; water already moves slowly
    this.blinkFrame = (this.blinkFrame + 1) % 4;
    for (const b of this.blinkers)
      b.setFrame(b.frame.name.startsWith('pack:data_center') ? `pack:data_center:${this.blinkFrame}` : `culture:dc:blink${this.blinkFrame % 2}`);
  }

  /** LED overlays on each data centre (same anchor and footprint as its Landmark, drawn just above it). */
  private buildBlinkers() {
    if (!hasSprite('culture:dc:blink0')) return;
    for (const s of this.plan.landmarks.filter((l: LandmarkLayout) => l.site?.sprite === 'culture:dc:0' && isPlaced(l))) {
      const f = s.footprint;
      const n = cornerScreen(CITY_ISO, f.x, f.y);
      this.blinkers.push(this.cull(addSprite(this.scene, 'culture:dc:blink0', n.x, n.y).setDepth(footprintDepth(CITY_ISO, f) + 0.5)));
    }
  }

  private placeProp(name: string, t: Tile, block = true) {
    const n = cornerScreen(CITY_ISO, t.x, t.y);
    const img = this.cull(addSprite(this.scene, name, n.x, n.y).setDepth(entityDepth(toScreen(CITY_ISO, t.x, t.y).y)));
    if (block) this.blocked.add(this.key(t.x, t.y));
    this.props.set(this.key(t.x, t.y), img);
    return img;
  }

  private buildStreetFurniture() {
    // Street lamps every few sidewalk tiles.
    for (const k of this.sidewalk) {
      const x = k % this.size;
      const y = Math.floor(k / this.size);
      if ((x + 2 * y) % 17 !== 0 || this.plan.plotAt({ x, y }) === 'square') continue;
      this.placeProp('lamp', { x, y });
      const c = toScreen(CITY_ISO, x, y);
      const glow = this.cull(addSprite(this.scene, 'glow', c.x, c.y - 50).setDepth(70_002).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));
      this.lamps.push({ glow });
    }
    // Town square: fountain, benches, flowers, trees, bins.
    this.fountain = this.placeProp('fountain0', this.plan.fountain);
    for (const b of this.plan.benches) this.placeProp('benchX', b, false); // citizens sit on them
    const r = this.plan.square;
    for (const [dx, dy, name] of [[0, 0, 'tree0'], [r.w - 1, 0, 'tree1'], [0, r.h - 1, 'tree1'], [r.w - 1, r.h - 1, 'tree0'], [3, 1, 'flowers'], [8, 1, 'flowers'], [4, 7, 'flowers'], [9, 5, 'tree1'], [10, 8, 'bin'], [5, 10, 'plant'], [7, 10, 'plant'], [0, 5, 'tree0'], [11, 5, 'pine'], [5, 0, 'awsSign']] as const)
      this.placeProp(name, { x: r.x + dx, y: r.y + dy });
  }

  /**
   * Decor follows progress (src/game/decor.ts): trees in open districts, a hoarded park in locked ones (removed on
   * unlock), a sign on each undiscovered lot, and the Day 1 Quarter / campus furniture. Diffed, so a sync is cheap.
   */
  private syncDecor(p: Progress) {
    const placed = this.plan.landmarks.filter(isPlaced);
    this.found = combosFound((id) => tierOf(p, id, this.region), (id) => placed.some((l) => l.id === id));
    const plan = decorPlan({
      plan: this.plan,
      landmarks: placed,
      isSidewalk: (x, y) => this.sidewalk.has(this.key(x, y)),
      districtOpen: (d) => this.districtOpen(p, d),
      tierOf: (id) => tierOf(p, id, this.region),
      // The player's decorations and City Clients' lots: decor (combos too) never stands on them.
      built: (x, y) => this.built.has(this.key(x, y)) || this.clientTiles.has(this.key(x, y)),
      combos: this.found.filter((c) => hasSprite(c.sprite)),
      season: this.season,
    }).filter((d) => hasSprite(d.sprite));
    const want = new Map(plan.map((d) => [decorKey(d), d]));
    for (const [k, d] of this.decor) {
      if (want.has(k)) continue;
      for (const o of [d.img, d.glow, d.lit]) if (o) this.culler?.remove(o);
      d.img.destroy();
      d.glow?.destroy();
      if (d.lit) (this.windows.delete(d.lit), d.lit.destroy());
      if (d.glow) this.lamps.splice(this.lamps.findIndex((l) => l.glow === d.glow), 1);
      if (d.item.block) {
        for (const t of tilesOf(d.item)) if (!this.footprintOf.has(this.key(t.x, t.y)) && !this.built.has(this.key(t.x, t.y))) this.blocked.delete(this.key(t.x, t.y));
        this.blockedVersion = nextVersion++;
      }
      this.blinkers = this.blinkers.filter((b) => b !== d.img);
      const gone = comboBySprite(d.item.sprite);
      if (gone) this.combos.delete(gone.id);
      this.decor.delete(k);
    }
    for (const [k, item] of want) {
      if (this.decor.has(k)) continue;
      const n = cornerScreen(CITY_ISO, item.x, item.y);
      const img = this.cull(addSprite(this.scene, item.sprite, n.x, n.y).setDepth(footprintDepth(CITY_ISO, item)));
      if (item.block) {
        for (const t of tilesOf(item)) this.blocked.add(this.key(t.x, t.y));
        this.blockedVersion = nextVersion++;
      }
      let glow: Phaser.GameObjects.Image | undefined;
      if (item.glow) {
        const c = toScreen(CITY_ISO, item.x, item.y);
        glow = this.cull(addSprite(this.scene, 'glow', c.x, c.y - 50).setDepth(70_002).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.night * 0.9));
        this.lamps.push({ glow });
      }
      let lit: Phaser.GameObjects.Image | undefined;
      if (hasSprite(`${item.sprite}@lights`)) {
        lit = this.cull(addSprite(this.scene, `${item.sprite}@lights`, n.x, n.y).setDepth(70_001).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.night));
        this.windows.add(lit);
      }
      if (item.sprite.startsWith('pack:data_center')) this.blinkers.push(img);
      this.decor.set(k, { item, img, glow, lit });
      const combo = comboBySprite(item.sprite);
      if (combo) {
        this.combos.set(combo.id, { combo, item, img });
        this.onCombo?.(combo, img, item);
      }
    }
    this.syncInfill(p, plan);
  }

  /** Infill on the ground decor left free (src/game/infill.ts); its buildings block walkers like any building. */
  private syncInfill(p: Progress, decor: DecorItem[]) {
    const decorTiles = new Set(decor.filter((d) => d.block).flatMap(tilesOf).map((t) => this.key(t.x, t.y)));
    const catalogue = INFILL_CATALOGUE.filter((s) => hasSprite(s.name));
    const r = infillPlan({
      plan: this.plan,
      region: this.region,
      // City Clients' lots count as landmarks here: infill in front of a business stays low enough not to hide it.
      landmarks: [...this.plan.landmarks.filter(isPlaced), ...hoodLots(this.plan).map((f, i) => ({ id: `client-lot-${i}`, footprint: f, workSpot: { x: f.x + 1, y: f.y + f.h } }))],
      isSidewalk: (x, y) => this.sidewalk.has(this.key(x, y)),
      districtOpen: (d) => this.districtOpen(p, d),
      tierOf: (id) => tierOf(p, id, this.region),
      catalogue,
      style: infillStyleFor(this.region),
      taken: (x, y) => decorTiles.has(this.key(x, y)) || this.clientTiles.has(this.key(x, y)) || this.built.has(this.key(x, y)),
      maxCars: this.surface === 'panel' ? MAX_PARKED / 2 : MAX_PARKED,
    });
    this.lastInfill = r;
    this.decorVersion++;
    const next = new Set(r.segments.flatMap(buildingTiles).map((t) => this.key(t.x, t.y)));
    let moved = false;
    for (const k of this.infillBlocked)
      if (!next.has(k)) {
        if (!this.footprintOf.has(k) && !decorTiles.has(k) && !this.clientTiles.has(k) && !this.built.has(k)) this.blocked.delete(k);
        moved = true;
      }
    for (const k of next)
      if (!this.infillBlocked.has(k)) {
        this.blocked.add(k);
        moved = true;
      }
    this.infillBlocked = next;
    if (moved) this.blockedVersion = nextVersion++;
    this.infill.sync(r);
  }

  /**
   * The player's decorations stand on these tiles (build mode): walkers and cars go round them (a new grid version drops
   * cached routes), and decor and infill leave them, so the ground's next pass re-plans round them.
   */
  setBuilt(tiles: Tile[]) {
    const next = new Set(tiles.filter((t) => t.x >= 0 && t.y >= 0 && t.x < this.size && t.y < this.size).map((t) => this.key(t.x, t.y)));
    const key = [...next].sort((a, b) => a - b).join(',');
    if (key === this.builtKey) return;
    const taken = new Set([...this.decor.values()].filter((d) => d.item.block).flatMap((d) => tilesOf(d.item)).map((t) => this.key(t.x, t.y)));
    for (const k of this.built)
      if (!next.has(k) && !this.footprintOf.has(k) && !this.clientTiles.has(k) && !this.infillBlocked.has(k) && !taken.has(k) && !this.props.has(k)) this.blocked.delete(k);
    for (const k of next) this.blocked.add(k);
    this.built = next;
    this.builtKey = key;
    this.blockedVersion = nextVersion++;
    if (this.lastProgress) this.sync(this.lastProgress, this.region);
  }

  /**
   * What the city's own things stand on, for build mode's ground (src/state/buildmode.ts groundFor): decor (trees,
   * homes, pocket parks, benches), infill buildings and street things, street furniture and businesses. The player's
   * own decorations aren't counted here (build mode checks those itself).
   */
  cityTaken = (x: number, y: number) => {
    const k = this.key(x, y);
    if (this.props.has(k) || this.clientTiles.has(k) || this.infillBlocked.has(k)) return true;
    if (!this.takenCache || this.takenCache.version !== this.decorVersion) {
      const tiles = new Set<number>();
      for (const d of this.decor.values()) for (const t of tilesOf(d.item)) tiles.add(this.key(t.x, t.y));
      for (const it of this.lastInfill?.street ?? []) tiles.add(this.key(Math.floor(it.x), Math.floor(it.y)));
      this.takenCache = { version: this.decorVersion, tiles };
    }
    return this.takenCache.tiles.has(k);
  };
  private takenCache?: { version: number; tiles: Set<number> };
  private decorVersion = 0;

  /** The combos found in this city at the last sync (props or not: one with nowhere to stand is still found). */
  found: Combo[] = [];
  /** Combo props standing now, by combo id. */
  readonly combos = new Map<string, { combo: Combo; item: DecorItem; img: Phaser.GameObjects.Image }>();
  /** A combo prop was just put down (the scene makes it tappable and celebrates a new one). */
  onCombo?: (combo: Combo, img: Phaser.GameObjects.Image, item: DecorItem) => void;

  private night = 0;
  setNight(n: number) {
    this.night = n;
    for (const l of this.lamps) l.glow.setAlpha(n * 0.9);
    for (const w of this.windows) w.setAlpha(n);
    this.infill.setNight(n);
  }
}
