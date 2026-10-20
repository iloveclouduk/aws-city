// Where each infill segment's composed picture lives on the canvas pages (src/game/InfillLayer.ts): a shelf packer
// that can give space back, so re-composing one district reuses its own room instead of repacking every segment.
// Pure (no Phaser, no canvas), tested in tests/infill.test.ts.

export interface Slot {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Shelf {
  page: number;
  y: number;
  h: number;
  /** Free spans along the shelf, sorted by x. */
  free: { x: number; w: number }[];
}

/** Shelf heights are rounded up to this, so a freed slot fits the next segment of a similar height. */
const SHELF_STEP = 16;

export class ShelfPacker {
  private shelves: Shelf[] = [];
  /** The first unused row of each page opened so far. */
  private tops: number[] = [];

  constructor(
    readonly size = 2048,
    readonly maxPages = 2,
    /** Transparent pixels kept round each slot, so linear sampling never bleeds a neighbour in. */
    readonly pad = 1,
  ) {}

  /** Pages opened so far (each one a canvas the layer creates on demand). */
  get pages() {
    return this.tops.length;
  }

  /** Room for a w×h picture, or undefined when every page is full. */
  alloc(w: number, h: number): Slot | undefined {
    const W = w + 2 * this.pad;
    const H = h + 2 * this.pad;
    if (W > this.size || H > this.size) return undefined;
    const take = (s: Shelf) => {
      const i = s.free.findIndex((f) => f.w >= W);
      if (i < 0) return undefined;
      const f = s.free[i];
      const slot = { page: s.page, x: f.x + this.pad, y: s.y + this.pad, w, h };
      if (f.w === W) s.free.splice(i, 1);
      else s.free[i] = { x: f.x + W, w: f.w - W };
      return slot;
    };
    // A shelf about this tall first (little wasted height), then a new shelf, then any shelf tall enough.
    for (const s of this.shelves) if (s.h >= H && s.h <= H * 1.5 + SHELF_STEP) {
      const got = take(s);
      if (got) return got;
    }
    const sh = Math.min(this.size, Math.ceil(H / SHELF_STEP) * SHELF_STEP);
    for (let p = 0; p < this.maxPages; p++) {
      if (p === this.tops.length) this.tops.push(0);
      if (this.tops[p] + sh > this.size) continue;
      const s: Shelf = { page: p, y: this.tops[p], h: sh, free: [{ x: 0, w: this.size }] };
      this.tops[p] += sh;
      this.shelves.push(s);
      return take(s);
    }
    for (const s of this.shelves) if (s.h >= H) {
      const got = take(s);
      if (got) return got;
    }
    return undefined;
  }

  /** Give a slot's room back (its shelf stays; neighbouring free spans merge). */
  free(slot: Slot) {
    const y = slot.y - this.pad;
    const s = this.shelves.find((q) => q.page === slot.page && q.y === y);
    if (!s) return;
    const span = { x: slot.x - this.pad, w: slot.w + 2 * this.pad };
    s.free.push(span);
    s.free.sort((a, b) => a.x - b.x);
    const merged: { x: number; w: number }[] = [];
    for (const f of s.free) {
      const last = merged[merged.length - 1];
      if (last && last.x + last.w === f.x) last.w += f.w;
      else merged.push({ ...f });
    }
    s.free = merged;
  }

  /** Pixels handed out (for the smoke's stats). */
  used() {
    let free = 0;
    for (const s of this.shelves) for (const f of s.free) free += f.w * s.h;
    return this.shelves.reduce((n, s) => n + this.size * s.h, 0) - free;
  }
}
