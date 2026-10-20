// Culling for the city's static Images (ring props, decor, street furniture and their @lights): Phaser draws every
// visible object on the display list whether it's on screen or not, so the ones that never move sit in a coarse world
// grid and only the cells in the camera's view (plus a margin) are shown. Updated when the camera moves more than
// MOVE_PX or zooms, not every frame. Pure apart from the objects' setVisible (tested in tests/cull.test.ts).
import type { Box } from './chunks';

/** World px a grid cell spans. Coarse: a few hundred objects, a handful of cells in view. */
export const CELL = 256;
/** Shown past the view's edge: the camera can drift this far before the next update, and tall sprites lean in. */
export const MARGIN = 96;
/** The view must move this far (world px), or zoom, before the visible set is worked out again. */
export const MOVE_PX = 32;

/** What the culler needs of a Phaser Image (and what the tests fake). */
export interface Cullable {
  setVisible(on: boolean): unknown;
}

/** The cells (keys) a box covers. */
export function cellsOf(b: Box, cell = CELL): number[] {
  const out: number[] = [];
  const x0 = Math.floor(b.x / cell);
  const y0 = Math.floor(b.y / cell);
  const x1 = Math.floor((b.x + Math.max(b.w, 1) - 1) / cell);
  const y1 = Math.floor((b.y + Math.max(b.h, 1) - 1) / cell);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(cellKey(x, y));
  return out;
}

/** One number a cell, for cells within ±2^15 of the origin (the map is a few thousand px across). */
export const cellKey = (cx: number, cy: number) => (cy + 32_768) * 65_536 + (cx + 32_768);

/** The cells a camera view (world px) plus `margin` covers. */
export const cellsInView = (view: Box, margin = MARGIN, cell = CELL) =>
  cellsOf({ x: view.x - margin, y: view.y - margin, w: view.w + 2 * margin, h: view.h + 2 * margin }, cell);

/** Whether the view moved (or zoomed) enough since `last` to work the visible set out again. */
export function viewMoved(last: (Box & { zoom: number }) | undefined, view: Box, zoom: number, px = MOVE_PX) {
  if (!last || last.zoom !== zoom) return true;
  return Math.abs(last.x - view.x) > px || Math.abs(last.y - view.y) > px || Math.abs(last.w - view.w) > px || Math.abs(last.h - view.h) > px;
}

/** The world-px box of an Image-like object from its position, origin and size. */
export const boxOfImage = (o: { x: number; y: number; originX: number; originY: number; displayWidth: number; displayHeight: number }): Box => ({
  x: o.x - o.originX * o.displayWidth,
  y: o.y - o.originY * o.displayHeight,
  w: o.displayWidth,
  h: o.displayHeight,
});

export class Culler<T extends Cullable = Cullable> {
  private cells = new Map<number, Set<T>>();
  private of = new Map<T, number[]>();
  private shown = new Set<T>();
  private view?: Box & { zoom: number };
  private inView = new Set<number>();
  /** Visible-set updates so far (the smoke reads it with the counts). */
  updates = 0;

  /** Register a static object covering `box`; it shows or hides at once to match the current view. */
  add(o: T, box: Box) {
    if (this.of.has(o)) this.remove(o);
    const cs = cellsOf(box);
    this.of.set(o, cs);
    for (const c of cs) {
      let s = this.cells.get(c);
      if (!s) this.cells.set(c, (s = new Set()));
      s.add(o);
    }
    const on = !this.view || cs.some((c) => this.inView.has(c));
    o.setVisible(on);
    if (on) this.shown.add(o);
    return o;
  }

  /** Forget an object (call before destroying it). Its visibility is left as it is. */
  remove(o: T) {
    for (const c of this.of.get(o) ?? []) this.cells.get(c)?.delete(o);
    this.of.delete(o);
    this.shown.delete(o);
  }

  /** Per frame from the scene (the camera's worldView): cheap unless the view moved more than MOVE_PX or zoomed. */
  update(v: { x: number; y: number; width: number; height: number }, zoom: number, force = false) {
    const view = { x: v.x, y: v.y, w: v.width, h: v.height };
    if (!force && !viewMoved(this.view, view, zoom)) return false;
    this.view = { x: view.x, y: view.y, w: view.w, h: view.h, zoom };
    this.inView = new Set(cellsInView(view));
    const next = new Set<T>();
    for (const c of this.inView) for (const o of this.cells.get(c) ?? []) next.add(o);
    for (const o of this.shown) if (!next.has(o)) o.setVisible(false);
    for (const o of next) if (!this.shown.has(o)) o.setVisible(true);
    this.shown = next;
    this.updates++;
    return true;
  }

  /** Registered objects, and how many of them show now. */
  stats() {
    return { culled: this.of.size, visible: this.shown.size };
  }

  clear() {
    this.cells.clear();
    this.of.clear();
    this.shown.clear();
    this.view = undefined;
    this.inView.clear();
  }
}

/** The city's perf numbers for the smoke (window.awsCity.ambient.stats() spreads them in; see Ambient.stats). */
export interface CityPerf {
  /** Core ground tiles still drawn as Images (only animated water: the rest is baked). */
  groundImages: number;
  /** Ground RenderTextures (core chunks, edge slabs and the ring). */
  groundTextures: number;
  /** Static Images the culler looks after, and how many of them show now. */
  culled: number;
  visible: number;
  /** The last ground bake (ms) and all bakes so far. */
  bakeMs: number;
  bakeTotalMs: number;
  /** Infill (src/game/InfillLayer.ts): segments drawn, their Images (fallback = one per building), street Images, pages. */
  segments?: number;
  infillImages?: number;
  infillFallback?: number;
  streetImages?: number;
  pages?: number;
  packedPx?: number;
  composeMs?: number;
  /** The living city (CityScene): the season drawn, the combo props standing (world px), the next-level line shown, and
   * the rush-hour helpers out now. */
  season?: string;
  combos?: { id: string; x: number; y: number }[];
  ghost?: string;
  surged?: number;
}
let perf: (() => CityPerf) | undefined;
/** The live city scene registers its numbers (undefined on teardown). */
export const setCityPerf = (fn: (() => CityPerf) | undefined) => void (perf = fn);
export const cityPerf = (): CityPerf | undefined => perf?.();
