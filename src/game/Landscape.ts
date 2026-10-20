// The landscape round the city (src/world/terrain.ts drawn): the sea as one TileSprite with a moving glint layer, the
// ring's static ground baked into two RenderTextures (src/game/GroundBake.ts: Phaser doesn't cull off-screen images,
// so 4,000 ground tiles as Images would cost every frame), and at most a few hundred depth-sorted prop Images, culled
// to the view (src/game/cull.ts). The AZ islands (terrain.ts) are part of it: their pads and fences are baked, their
// data halls and substations are props.
//
// A lost WebGL context loses the bake's contents, so it's redone on 'restorewebgl'.
import Phaser from 'phaser';
import { legacyPlan, type CityPlan } from '@/world/plan';
import { isWater, outsideOf, ringOf, terrainFor, type Terrain, type TerrainKind } from '@/world/terrain';
import type { Zone } from '@/world/regions';
import { addSprite, hasSprite, SEA_GLINT_TEXTURE, SEA_TEXTURE, spriteAnchor } from './assets';
import { spriteBox } from './chunks';
import { boxOfImage, type Culler } from './cull';
import { GroundBake, type Stamp } from './GroundBake';
import { CITY_ISO, cornerScreen, footprintDepth, toScreen } from './iso';
import { reducedMotion } from './motion';
import { keepTextInView } from './labels';
import { crisp, TEXT_FONT } from './SpeechBubble';
import { CSS, labelStyle } from './theme';

/** Below everything: the sea. The baked ground sits just under the core's own ground tiles (depth x + y ≥ 0). */
const SEA_DEPTH = -20_000;
const GROUND_DEPTH = -0.5;
/** How far the sea reaches past the map, so a view wider than the map still sees water (world px). */
const SEA_MARGIN = 1024;
const TURBINE_FRAME_MS = 140;

interface PropImage {
  img: Phaser.GameObjects.Image;
  lights?: Phaser.GameObjects.Image;
  role?: string;
  phase: number;
  /** For an AZ island's data hall, substation or tower: which island (zone order). */
  island?: number;
}
/** The data halls' LEDs step on the same beat as downtown's (CityMap's 450 ms tick). */
const HALL_FRAME_MS = 450;
/** A data hall with its lights out in a practice drill: dim, cool grey. */
const DARK_TINT = 0x4a4f5e;

export class Landscape {
  private sea?: Phaser.GameObjects.TileSprite;
  private glint?: Phaser.GameObjects.TileSprite;
  private ground?: GroundBake;
  private props: PropImage[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  /** The highway's destination signs ("Ireland → eu-west-1 · 7,321 km"): map details, off by default. */
  private labels: Phaser.GameObjects.Text[] = [];
  private anchors: { x: number; y: number }[] = [];
  private details = false;
  private key = '';
  private ui = 1;
  private night = 0;
  private turbineAt = 0;
  private turbineFrame = 0;
  private hallAt = 0;
  private hallFrame = 0;
  /** Islands whose lights are out in a practice drill (the "Lights out" drill, never AWS status). */
  private dark = new Set<number>();
  terrain?: Terrain;

  constructor(
    private scene: Phaser.Scene,
    private culler?: Culler,
    private plan: CityPlan = legacyPlan(),
  ) {
    scene.game.renderer.on('restorewebgl', this.rebake);
  }

  /** The season's ground tint (src/world/seasons.ts SEASON_TINT), kept for a rebuild. */
  private tint?: number;
  setTint(color: number) {
    this.tint = color;
    this.ground?.setTint(color);
  }

  /** Build (or rebuild, on a Region change) the landscape. Same Region and zones: nothing to do. */
  build(region: string, zones: Zone[] = [], linked: string[] = []) {
    const key = JSON.stringify([region, zones.map((z) => z.id), linked]);
    if (key === this.key && this.terrain) return this.terrain;
    this.clear();
    this.key = key;
    const t = (this.terrain = terrainFor(region, zones, linked, this.plan));
    const b = t.bounds;
    if (this.scene.textures.exists(SEA_TEXTURE)) {
      this.sea = this.scene.add.tileSprite(b.x - SEA_MARGIN, b.y - SEA_MARGIN, b.w + 2 * SEA_MARGIN, b.h + 2 * SEA_MARGIN, SEA_TEXTURE).setOrigin(0).setDepth(SEA_DEPTH);
    }
    if (this.scene.textures.exists(SEA_GLINT_TEXTURE)) {
      this.glint = this.scene.add
        .tileSprite(b.x - SEA_MARGIN, b.y - SEA_MARGIN, b.w + 2 * SEA_MARGIN, b.h + 2 * SEA_MARGIN, SEA_GLINT_TEXTURE)
        .setOrigin(0)
        .setDepth(SEA_DEPTH + 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.25);
    }
    // Two halves (top and bottom of the map): each well under the 4096 px texture limit.
    const half = Math.ceil(b.h / 2 / 2) * 2;
    this.ground = new GroundBake(
      this.scene,
      [
        { x: b.x, y: b.y, w: b.w, h: half },
        { x: b.x, y: b.y + half, w: b.w, h: b.h - half },
      ],
      GROUND_DEPTH,
    );
    this.bake();
    if (this.tint !== undefined) this.ground.setTint(this.tint);
    this.placeProps(t);
    this.setNight(this.night);
    this.setUiScale(this.ui);
    return t;
  }

  /** For the smoke caps and the perf notes. */
  stats() {
    return {
      props: this.props.length + this.props.filter((p) => p.lights).length + this.glows.length,
      renderTextures: this.ground?.sizes() ?? [],
      bakeMs: this.ground?.lastMs ?? 0,
      bakeTotalMs: this.ground?.totalMs ?? 0,
    };
  }

  setNight(n: number) {
    this.night = n;
    for (const p of this.props) p.lights?.setAlpha(p.island !== undefined && this.dark.has(p.island) ? 0 : n);
    for (const g of this.glows) g.setAlpha(n * 0.9);
  }

  setUiScale(ui: number) {
    this.ui = ui;
    for (const l of this.labels) l.setScale(ui);
  }

  /** The "Show the map details" setting: the distance signs' labels show only with it on. */
  setDetails(on: boolean) {
    this.details = on;
    for (const l of this.labels) l.setVisible(on);
  }

  /** Per frame: a shown sign label near the view's edge slides in to stay whole. */
  keepInView(view: Phaser.Geom.Rectangle, topInset = 0) {
    if (!this.details) return;
    this.labels.forEach((l, i) => this.anchors[i] && keepTextInView(l, this.anchors[i], view, this.ui, topInset));
  }

  /** Per frame from the scene's update: the glint drifts and the turbines turn (both still under reduced motion). */
  animate(time: number) {
    if (reducedMotion()) return;
    if (time - this.hallAt >= HALL_FRAME_MS) {
      this.hallAt = time;
      this.hallFrame = (this.hallFrame + 1) % 4;
      for (const p of this.props) if (p.role === 'hall' && !this.dark.has(p.island!)) p.img.setFrame(`pack:data_center:${(this.hallFrame + p.phase) % 4}`);
    }
    if (this.glint) {
      // Whole texels, so the pixel art stays crisp.
      this.glint.tilePositionX = Math.floor(time * 0.006) % 192;
      this.glint.tilePositionY = Math.floor(time * 0.003) % 96;
    }
    if (time - this.turbineAt < TURBINE_FRAME_MS) return;
    this.turbineAt = time;
    this.turbineFrame = (this.turbineFrame + 1) % 3;
    for (const p of this.props) if (p.role === 'turbine') p.img.setFrame(`windTurbine${(this.turbineFrame + p.phase) % 3}`);
  }

  /**
   * The "Lights out" practice drill: island `i`'s data halls go dark (frame held, dimmed, night lights off) or come
   * back. A drill is the player's own practice, so it never touches the storms or fences that mean real AWS status.
   */
  setIslandDark(i: number, dark: boolean) {
    if (dark === this.dark.has(i)) return;
    if (dark) this.dark.add(i);
    else this.dark.delete(i);
    for (const p of this.props) {
      if (p.island !== i) continue;
      if (dark) p.img.setTint(DARK_TINT);
      else p.img.clearTint();
      if (p.role === 'hall') p.img.setFrame('pack:data_center:0');
    }
    this.setNight(this.night);
  }

  destroy() {
    this.clear();
    this.scene.game.renderer?.off('restorewebgl', this.rebake);
  }

  private clear() {
    this.sea?.destroy();
    this.glint?.destroy();
    this.sea = this.glint = undefined;
    this.ground?.destroy();
    this.ground = undefined;
    for (const p of this.props) for (const o of [p.img, p.lights]) if (o) (this.culler?.remove(o), o.destroy());
    this.props = [];
    for (const g of this.glows) (this.culler?.remove(g), g.destroy());
    this.glows = [];
    this.dark.clear();
    for (const l of this.labels) l.destroy();
    this.labels = [];
    this.anchors = [];
    this.terrain = undefined;
    this.key = '';
  }

  private rebake = () => {
    if (this.ground) this.bake();
  };

  /** Ground and edge slabs, painter's order (back rows first), into whichever half each stamp touches. */
  private bake() {
    const t = this.terrain;
    if (!t || !this.ground) return;
    const stamps: Stamp[] = [];
    const stamp = (name: string, x: number, y: number) => {
      const a = spriteAnchor(name);
      if (a) stamps.push({ name, box: spriteBox(CITY_ISO, a, x, y) });
    };
    const slab = (k: TerrainKind) => (k === 'promenade' || k === 'highway' || k === 'island' ? 'quay' : k === 'beach' ? 'shore' : 'cliff');
    const { min: RING_MIN, max: RING_MAX } = ringOf(this.plan.size);
    const outside = outsideOf(this.plan.size);
    for (let s = 2 * RING_MIN; s <= 2 * RING_MAX; s++)
      for (let x = Math.max(RING_MIN, s - RING_MAX); x <= Math.min(RING_MAX, s - RING_MIN); x++) {
        const y = s - x;
        if (outside(x, y) === 0) continue;
        const g = t.ground(x, y);
        if (!g) continue;
        stamp(g, x, y);
        const k = t.kind(x, y);
        // The visible faces of a tile are its SE (+x, "R") and SW (+y, "L") edges: a drop where water lies beyond.
        if (isWater(t.kind(x + 1, y))) stamp(`${slab(k)}R`, x, y);
        if (isWater(t.kind(x, y + 1))) stamp(`${slab(k)}L`, x, y);
      }
    // The AZ islands' fences: static and knee-high, so they're baked too (back to front), not 28 Images an island.
    const fences = t.islands.flatMap((i) => i.fences).sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const f of fences) stamp(f.sprite, f.x, f.y);
    this.ground.bake(stamps);
  }

  /** A static Image the culler shows only near the view. */
  private cull(img: Phaser.GameObjects.Image) {
    this.culler?.add(img, boxOfImage(img));
    return img;
  }

  private placeProps(t: Terrain) {
    const dests = new Map(t.destinations.map((d) => [d.code, d]));
    let phase = 0;
    for (const p of t.props) {
      if (!hasSprite(p.sprite)) continue;
      const n = cornerScreen(CITY_ISO, p.x, p.y);
      const depth = footprintDepth(CITY_ISO, p);
      const img = this.cull(addSprite(this.scene, p.sprite, n.x, n.y).setDepth(depth));
      let lights: Phaser.GameObjects.Image | undefined;
      if (hasSprite(`${p.sprite}@lights`)) lights = this.cull(addSprite(this.scene, `${p.sprite}@lights`, n.x, n.y).setDepth(70_001).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));
      const island = p.role === 'island' ? t.islands.findIndex((i) => p.x >= i.rect.x && p.y >= i.rect.y && p.x < i.rect.x + i.rect.w && p.y < i.rect.y + i.rect.h) : -1;
      const hall = island >= 0 && p.sprite.startsWith('pack:data_center') && hasSprite('pack:data_center:3');
      this.props.push({ img, lights, role: hall ? 'hall' : p.role, phase: hall ? island % 4 : phase++ % 3, ...(island >= 0 ? { island } : {}) });
      if (p.role === 'lighthouse' && hasSprite('glow')) {
        const c = toScreen(CITY_ISO, p.x, p.y);
        this.glows.push(this.cull(addSprite(this.scene, 'glow', c.x, c.y - 52).setDepth(70_002).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0)));
      }
      const d = p.role === 'sign' && p.to ? dests.get(p.to) : undefined;
      if (d) {
        const top = img.getTopCenter().y ?? n.y;
        const label = crisp(
          this.scene.add
            .text(Math.round(n.x), Math.round(top - 2), `${d.city} → ${d.code}\n${d.km.toLocaleString('en')} km`, labelStyle(TEXT_FONT, CSS.inkHi))
            .setOrigin(0.5, 1)
            .setDepth(40_000)
            .setScale(this.ui)
            .setVisible(this.details),
        );
        this.labels.push(label);
        this.anchors.push({ x: label.x, y: label.y });
      }
    }
  }
}
