// Draws the infill (src/game/infill.ts): each segment's buildings are composed back to front into one frame on a
// canvas page, so a block of a dozen buildings is one Image (and one night-lights Image) instead of a dozen. The pages
// are CanvasTextures: a lost WebGL context re-uploads them from their canvases (Phaser 4.2.1 WebGLTextureWrapper
// createResource → texImage2D(canvas), on `restorewebgl`), so nothing needs re-composing after a context loss.
// Only segments whose picture changed are composed again (infillPack frees and reuses their room); a segment that
// finds no room falls back to one atlas Image per building. Segments register with the culler and fade in front of
// Kai like landmarks (occlusion.ts), tested against a coarse alpha mask taken when the frame is composed.
import Phaser from 'phaser';
import { signalPhase } from '@/world/traffic';
import { addSprite, CITY_ATLAS, hasSprite, seasonal, spriteAnchor } from './assets';
import type { Box } from './chunks';
import { boxOfImage, type Culler } from './cull';
import { segmentKey, type InfillResult, type InfillSegment, type StreetItem } from './infill';
import { ShelfPacker, type Slot } from './infillPack';
import { CITY_ISO, cornerScreen, entityDepth, footprintDepth, toScreen } from './iso';
import { FADED, type Occluder } from './occlusion';

/** Canvas pages are PAGE×PAGE px; the tab may open two, the panel (low detail) one. */
export const PAGE = 2048;
export const MAX_PAGES = { tab: 2, panel: 1 } as const;
/** The alpha mask's cell, px: a focus point inside an opaque cell counts as covered. */
const MASK_CELL = 2;
/**
 * Night lights draw above the night overlay (DayNight's multiply at 70,000), like every @lights layer, so windows really
 * glow. Being on top, they're composed occluded: each segment's lights are cut wherever something nearer stands (a
 * later building in the segment, a nearer segment's buildings, a landmark, a street tree or signal), and composed again
 * when any of those changes.
 */
const LIGHTS_DEPTH = 70_001;

/** A landmark standing (its current sprite): segments behind it cut their windows where it stands. */
export interface FrontSprite {
  id: string;
  sprite: string;
  footprint: { x: number; y: number; w: number; h: number };
}
let uid = 0;

interface Picture {
  slot?: Slot;
  frame?: string;
  img?: Phaser.GameObjects.Image;
  /** No room on the pages: one Image per building instead. */
  parts?: Phaser.GameObjects.Image[];
}

interface Drawn {
  seg: InfillSegment;
  key: string;
  base: Picture;
  /** World box of the base picture (for culling, occlusion and finding what's in front). */
  box: Box;
  mask?: { w: number; h: number; bits: Uint8Array };
  lights?: Picture;
  lightsDirty: boolean;
  faded: boolean;
}

/** Where a sprite's anchor sits relative to a segment's N corner, and the box its opaque pixels cover there. */
interface Placed {
  name: string;
  ox: number;
  oy: number;
}

export class InfillLayer {
  private pages: Phaser.Textures.CanvasTexture[] = [];
  private packer: ShelfPacker;
  private drawn = new Map<string, Drawn>();
  private street: { item: StreetItem; img: Phaser.GameObjects.Image; lit?: Phaser.GameObjects.Image }[] = [];
  private streetKey = '';
  private night = 0;
  private readonly id = ++uid;
  private frameNo = 0;
  /** A scratch canvas for night lights (composed off-page, then copied in). */
  private scratch?: HTMLCanvasElement;
  private signalAt = 0;
  private fronts: FrontSprite[] = [];
  private frontKey = '';
  composeMs = 0;
  composed = 0;

  constructor(
    private scene: Phaser.Scene,
    private culler: Culler | undefined,
    surface: 'tab' | 'panel',
  ) {
    this.packer = new ShelfPacker(PAGE, MAX_PAGES[surface]);
  }

  /** Display objects and pages, for the smoke's stats. */
  stats() {
    let images = 0;
    let fallback = 0;
    for (const d of this.drawn.values())
      for (const p of [d.base, d.lights]) {
        if (!p) continue;
        if (p.img) images++;
        if (p.parts) (fallback += p.parts.length), (images += p.parts.length);
      }
    return { segments: this.drawn.size, infillImages: images, infillFallback: fallback, streetImages: this.street.length + this.street.filter((s) => s.lit).length, pages: this.pages.length, packedPx: this.packer.used(), composeMs: Math.round(this.composeMs * 10) / 10 };
  }

  /** Bring the drawing in line with a new plan: only segments whose picture changed are composed again. */
  sync(r: InfillResult) {
    const t0 = performance.now();
    const want = new Map(r.segments.map((s) => [s.id, s]));
    let touched = false;
    const changed: { box: Box; depth: number }[] = [];
    for (const [id, d] of this.drawn) {
      const s = want.get(id);
      if (s && segmentKey(s) === d.key) continue;
      changed.push({ box: d.box, depth: d.seg.depth });
      this.drop(d);
      this.drawn.delete(id);
      touched = true;
    }
    for (const s of r.segments) {
      if (this.drawn.has(s.id)) continue;
      const d = this.compose(s);
      if (!d) continue;
      this.drawn.set(s.id, d);
      changed.push({ box: d.box, depth: s.depth });
      touched = true;
    }
    if (touched) for (const p of this.pages) p.refresh();
    changed.push(...this.syncStreet(r.street));
    this.dirtyBehind(changed);
    if (this.night > 0) this.composeLights();
    this.composeMs += performance.now() - t0;
  }

  /** Windows behind anything that changed may now be covered or uncovered: their lights are composed again. */
  private dirtyBehind(changed: { box: Box; depth: number }[]) {
    if (!changed.length) return;
    for (const d of this.drawn.values()) if (changed.some((c) => c.depth > d.seg.depth && overlap(c.box, d.box))) d.lightsDirty = true;
  }

  /** The landmarks standing, by their current sprites: segments behind one cut their windows where it stands. */
  setFronts(fronts: FrontSprite[]) {
    const key = fronts.map((f) => `${f.id}:${f.sprite}`).join('|');
    if (key === this.frontKey) return;
    const was = new Map(this.fronts.map((f) => [f.id, f]));
    const now = new Map(fronts.map((f) => [f.id, f]));
    const changed: { box: Box; depth: number }[] = [];
    for (const f of [...fronts, ...this.fronts]) {
      if (was.get(f.id)?.sprite === now.get(f.id)?.sprite) continue;
      const b = this.spriteBox(f.sprite, f.footprint);
      if (b) changed.push({ box: b, depth: footprintDepth(CITY_ISO, f.footprint) });
    }
    this.fronts = fronts;
    this.frontKey = key;
    this.dirtyBehind(changed);
    if (this.night > 0) this.composeLights();
  }

  /** The world box a landmark's sprite covers. */
  private spriteBox(sprite: string, f: FrontSprite['footprint']): Box | undefined {
    const n = cornerScreen(CITY_ISO, f.x, f.y);
    return this.trimBox(sprite, n.x, n.y);
  }

  setNight(n: number) {
    this.night = n;
    if (n > 0) this.composeLights();
    for (const d of this.drawn.values()) {
      const p = d.lights;
      if (!p) continue;
      const a = n * (d.faded ? FADED : 1);
      p.img?.setAlpha(a);
      for (const q of p.parts ?? []) q.setAlpha(a);
    }
    for (const s of this.street) s.lit?.setAlpha(n);
  }

  /** Traffic lights change on their own clock (signalPhase): checked a few times a second. */
  update(time: number) {
    if (time - this.signalAt < 250) return;
    this.signalAt = time;
    for (const s of this.street) {
      if (s.item.kind !== 'signal' || !s.item.axis) continue;
      const c = signalPhase(s.item.node ?? 0, time)[s.item.axis];
      const frame = `${s.item.sprite}:${c}`;
      if (s.img.frame.name === frame || !hasSprite(frame)) continue;
      s.img.setFrame(frame);
      if (s.lit && hasSprite(`${frame}@lights`)) s.lit.setFrame(`${frame}@lights`);
    }
  }

  /** Each segment as an occluder (occlusion.fadeFor), keyed `infill:<id>`. */
  occluders(): Occluder[] {
    const out: Occluder[] = [];
    for (const d of this.drawn.values()) out.push({ id: `infill:${d.seg.id}`, depth: d.seg.depth, ...d.box });
    return out;
  }

  /** Is there a pixel of the segment's buildings at world (x, y)? */
  solidAt(id: string, x: number, y: number) {
    const d = this.drawn.get(id.replace(/^infill:/, ''));
    if (!d) return false;
    if (!d.mask) return true; // drawn building by building: the box will do
    const cx = Math.floor((x - d.box.x) / MASK_CELL);
    const cy = Math.floor((y - d.box.y) / MASK_CELL);
    if (cx < 0 || cy < 0 || cx >= d.mask.w || cy >= d.mask.h) return false;
    return d.mask.bits[cy * d.mask.w + cx] === 1;
  }

  /** Fade the segments in `ids` (occluder ids), show the rest at full strength. */
  setFaded(ids: ReadonlySet<string>) {
    for (const d of this.drawn.values()) {
      const on = ids.has(`infill:${d.seg.id}`);
      if (on === d.faded) continue;
      d.faded = on;
      const a = on ? FADED : 1;
      d.base.img?.setAlpha(a);
      for (const q of d.base.parts ?? []) q.setAlpha(a);
      d.lights?.img?.setAlpha(this.night * a);
      for (const q of d.lights?.parts ?? []) q.setAlpha(this.night * a);
    }
  }

  destroy() {
    for (const d of this.drawn.values()) this.drop(d);
    this.drawn.clear();
    for (const s of this.street) this.dropImg(s.img), s.lit && this.dropImg(s.lit);
    this.street = [];
    for (const p of this.pages) p.destroy();
    this.pages = [];
  }

  // ── composing ───────────────────────────────────────────────────────────

  private atlasFrame(name: string) {
    return this.scene.textures.getFrame(CITY_ATLAS, seasonal(this.scene, name)) as Phaser.Textures.Frame | undefined;
  }

  /** A sprite's opaque box with its anchor at (ox, oy), from the atlas frame's trim. */
  private trimBox(name: string, ox: number, oy: number): Box | undefined {
    const a = spriteAnchor(name);
    const f = this.atlasFrame(name);
    if (!a || !f) return undefined;
    return { x: ox - a.ax + f.x, y: oy - a.ay + f.y, w: f.cutWidth, h: f.cutHeight };
  }

  private draw(ctx: CanvasRenderingContext2D, name: string, ox: number, oy: number) {
    const a = spriteAnchor(name);
    const f = this.atlasFrame(name);
    if (!a || !f) return;
    const src = f.source.image as CanvasImageSource;
    ctx.drawImage(src, f.cutX, f.cutY, f.cutWidth, f.cutHeight, ox - a.ax + f.x, oy - a.ay + f.y, f.cutWidth, f.cutHeight);
  }

  private page(n: number) {
    while (this.pages.length <= n) {
      const t = this.scene.textures.createCanvas(`infill:${this.id}:${this.pages.length}`, PAGE, PAGE);
      if (!t) throw new Error('infill: no canvas texture');
      this.pages.push(t);
    }
    return this.pages[n];
  }

  /** The sprites of a segment, anchored relative to its N corner. */
  private placed(s: InfillSegment, suffix = ''): Placed[] {
    const o = cornerScreen(CITY_ISO, s.x, s.y);
    return s.buildings
      .map((b) => {
        const n = cornerScreen(CITY_ISO, b.x, b.y);
        return { name: b.sprite + suffix, ox: n.x - o.x, oy: n.y - o.y };
      })
      .filter((p) => hasSprite(p.name));
  }

  private union(parts: Placed[]): Box | undefined {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of parts) {
      const b = this.trimBox(p.name, p.ox, p.oy);
      if (!b) continue;
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    if (x0 === Infinity) return undefined;
    return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1) - Math.floor(x0), h: Math.ceil(y1) - Math.floor(y0) };
  }

  private compose(s: InfillSegment): Drawn | undefined {
    const parts = this.placed(s);
    const bb = this.union(parts);
    if (!bb) return undefined;
    const o = cornerScreen(CITY_ISO, s.x, s.y);
    const box = { x: o.x + bb.x, y: o.y + bb.y, w: bb.w, h: bb.h };
    const d: Drawn = { seg: s, key: segmentKey(s), base: {}, box, lightsDirty: true, faded: false };
    const slot = this.packer.alloc(bb.w, bb.h);
    if (!slot) {
      // No room left on the pages: the buildings stand as atlas Images, in order, at the segment's depth.
      d.base.parts = parts.map((p, i) => this.cull(addSprite(this.scene, p.name, o.x + p.ox, o.y + p.oy).setDepth(s.depth + i * 1e-4)));
      return d;
    }
    const page = this.page(slot.page);
    const ctx = page.getContext();
    ctx.clearRect(slot.x, slot.y, slot.w, slot.h);
    for (const p of parts) this.draw(ctx, p.name, slot.x - bb.x + p.ox, slot.y - bb.y + p.oy);
    d.mask = maskOf(ctx.getImageData(slot.x, slot.y, slot.w, slot.h));
    const frame = `f${++this.frameNo}`;
    page.add(frame, 0, slot.x, slot.y, slot.w, slot.h);
    const img = this.scene.add.image(o.x, o.y, page.key, frame).setOrigin(-bb.x / bb.w, -bb.y / bb.h).setDepth(s.depth);
    d.base = { slot, frame, img: this.cull(img) };
    this.composed++;
    return d;
  }

  /** Night lights for every segment marked dirty, cut wherever something nearer stands. */
  private composeLights() {
    let touched = false;
    for (const d of this.drawn.values()) {
      if (!d.lightsDirty) continue;
      d.lightsDirty = false;
      this.dropPicture(d.lights);
      d.lights = undefined;
      const s = d.seg;
      const lit = this.placed(s, '@lights');
      if (!lit.length) continue;
      const o = cornerScreen(CITY_ISO, s.x, s.y);
      const lb = this.union(lit);
      if (!lb) continue;
      const slot = this.packer.alloc(lb.w, lb.h);
      if (!slot) {
        d.lights = { parts: lit.map((p) => this.cull(addSprite(this.scene, p.name, o.x + p.ox, o.y + p.oy).setDepth(LIGHTS_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.night))) };
        continue;
      }
      const c = (this.scratch ??= document.createElement('canvas'));
      if (c.width < lb.w || c.height < lb.h) (c.width = Math.max(c.width, lb.w)), (c.height = Math.max(c.height, lb.h));
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, lb.w, lb.h);
      // Back to front: each building first hides the windows behind it, then lights its own.
      for (const b of s.buildings) {
        const n = cornerScreen(CITY_ISO, b.x, b.y);
        const ox = n.x - o.x - lb.x;
        const oy = n.y - o.y - lb.y;
        ctx.globalCompositeOperation = 'destination-out';
        this.draw(ctx, b.sprite, ox, oy);
        ctx.globalCompositeOperation = 'source-over';
        if (hasSprite(`${b.sprite}@lights`)) this.draw(ctx, `${b.sprite}@lights`, ox, oy);
      }
      // Then whatever stands nearer: other segments' buildings, the landmarks, street trees and signals.
      ctx.globalCompositeOperation = 'destination-out';
      const lbox = { x: o.x + lb.x, y: o.y + lb.y, w: lb.w, h: lb.h };
      for (const e of this.drawn.values()) {
        if (e === d || e.seg.depth <= s.depth || !overlap(e.box, lbox)) continue;
        for (const b of e.seg.buildings) {
          const n = cornerScreen(CITY_ISO, b.x, b.y);
          this.draw(ctx, b.sprite, n.x - lbox.x, n.y - lbox.y);
        }
      }
      for (const f of this.fronts) {
        if (footprintDepth(CITY_ISO, f.footprint) <= s.depth) continue;
        const fb = this.spriteBox(f.sprite, f.footprint);
        if (!fb || !overlap(fb, lbox)) continue;
        const n = cornerScreen(CITY_ISO, f.footprint.x, f.footprint.y);
        this.draw(ctx, f.sprite, n.x - lbox.x, n.y - lbox.y);
      }
      for (const st of this.street) {
        if (st.img.depth <= s.depth) continue;
        const b = boxOfImage(st.img);
        if (!overlap(b, lbox)) continue;
        this.draw(ctx, st.img.frame.name, st.img.x - lbox.x, st.img.y - lbox.y);
      }
      ctx.globalCompositeOperation = 'source-over';
      const page = this.page(slot.page);
      const pctx = page.getContext();
      pctx.clearRect(slot.x, slot.y, slot.w, slot.h);
      pctx.drawImage(c, 0, 0, lb.w, lb.h, slot.x, slot.y, lb.w, lb.h);
      const frame = `f${++this.frameNo}`;
      page.add(frame, 0, slot.x, slot.y, slot.w, slot.h);
      const img = this.scene.add
        .image(o.x, o.y, page.key, frame)
        .setOrigin(-lb.x / lb.w, -lb.y / lb.h)
        .setDepth(LIGHTS_DEPTH)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(this.night * (d.faded ? FADED : 1));
      d.lights = { slot, frame, img: this.cull(img) };
      touched = true;
    }
    if (touched) for (const p of this.pages) p.refresh();
  }

  // ── street furniture ────────────────────────────────────────────────────

  /** Street furniture to match the plan; returns what changed (windows behind it are composed again). */
  private syncStreet(items: StreetItem[]): { box: Box; depth: number }[] {
    const shown = items.filter((i) => hasSprite(i.kind === 'signal' ? `${i.sprite}:g` : i.sprite));
    const key = shown.map((i) => `${i.sprite}@${i.x},${i.y}`).join('|');
    if (key === this.streetKey) return [];
    this.streetKey = key;
    const changed = this.street.map((s) => ({ box: boxOfImage(s.img), depth: s.img.depth }));
    for (const s of this.street) this.dropImg(s.img), s.lit && this.dropImg(s.lit);
    this.street = [];
    for (const item of shown) {
      const frame = item.kind === 'signal' && item.axis ? `${item.sprite}:${signalPhase(item.node ?? 0, this.scene.time.now)[item.axis]}` : item.sprite;
      const n = cornerScreen(CITY_ISO, item.x, item.y);
      const c = toScreen(CITY_ISO, item.x, item.y);
      const img = this.cull(addSprite(this.scene, frame, Math.round(n.x), Math.round(n.y)).setDepth(entityDepth(c.y) + (item.kind === 'car' ? 0.4 : 0.2)));
      let lit: Phaser.GameObjects.Image | undefined;
      if (hasSprite(`${frame}@lights`))
        lit = this.cull(addSprite(this.scene, `${frame}@lights`, Math.round(n.x), Math.round(n.y)).setDepth(LIGHTS_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.night));
      this.street.push({ item, img, lit });
      changed.push({ box: boxOfImage(img), depth: img.depth });
    }
    return changed;
  }

  // ── bookkeeping ─────────────────────────────────────────────────────────

  private cull<T extends Phaser.GameObjects.Image>(img: T): T {
    this.culler?.add(img, boxOfImage(img));
    return img;
  }

  private dropImg(img: Phaser.GameObjects.Image) {
    this.culler?.remove(img);
    img.destroy();
  }

  private dropPicture(p: Picture | undefined) {
    if (!p) return;
    if (p.img) this.dropImg(p.img);
    for (const q of p.parts ?? []) this.dropImg(q);
    if (p.slot) {
      this.packer.free(p.slot);
      if (p.frame) this.pages[p.slot.page]?.remove(p.frame);
    }
  }

  private drop(d: Drawn) {
    this.dropPicture(d.base);
    this.dropPicture(d.lights);
  }
}

/** A coarse alpha mask (MASK_CELL px cells, 1 where any pixel is opaque). */
function maskOf(data: ImageData) {
  const w = Math.ceil(data.width / MASK_CELL);
  const h = Math.ceil(data.height / MASK_CELL);
  const bits = new Uint8Array(w * h);
  const px = data.data;
  for (let y = 0; y < data.height; y++)
    for (let x = 0; x < data.width; x++) if (px[(y * data.width + x) * 4 + 3] > 0) bits[Math.floor(y / MASK_CELL) * w + Math.floor(x / MASK_CELL)] = 1;
  return { w, h, bits };
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
