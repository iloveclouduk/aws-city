// Static ground stamped into RenderTextures (one a chunk, src/game/chunks.ts), shared by the city's core (CityMap) and
// the landscape round it (Landscape). Phaser doesn't cull off-screen Images, so a tile an Image costs every frame; a
// chunk costs one quad.
//
// Phaser 4: a RenderTexture's stamps are buffered until .render() (node_modules/phaser/src/textures/DynamicTexture.js
// render(); see .claude/references/cached-sources.md), and a lost WebGL context loses its contents, so the owner bakes
// again on 'restorewebgl'.
import Phaser from 'phaser';
import { CITY_ATLAS, seasonal } from './assets';
import { overlaps, type Box } from './chunks';

/** One sprite to stamp, at its world-px box (chunks.ts spriteBox). */
export interface Stamp {
  name: string;
  box: Box;
}

export class GroundBake {
  private rts: (Phaser.GameObjects.RenderTexture | undefined)[];
  /** The last bake's time and the chunks it redrew, for the smoke's stats. */
  lastMs = 0;
  lastChunks = 0;
  totalMs = 0;

  constructor(
    private scene: Phaser.Scene,
    readonly rects: readonly (Box | undefined)[],
    depth: number,
  ) {
    this.rts = rects.map((r) => (r ? scene.add.renderTexture(r.x, r.y, r.w, r.h).setOrigin(0).setDepth(depth) : undefined));
  }

  /**
   * Clear the chunks in `only` (all of them by default) and stamp into them every stamp that touches them, in the
   * order given (painter's order: back rows first). Stamps reaching into a neighbouring chunk are drawn there too.
   */
  bake(stamps: Iterable<Stamp>, only?: ReadonlySet<number>) {
    const t0 = performance.now();
    const ids = this.rts.map((_, i) => i).filter((i) => this.rts[i] && (!only || only.has(i)));
    if (!ids.length) return;
    for (const i of ids) this.rts[i]!.clear();
    for (const s of stamps)
      for (const i of ids) {
        const r = this.rects[i]!;
        if (overlaps(r, s.box)) this.rts[i]!.stamp(CITY_ATLAS, seasonal(this.scene, s.name), s.box.x - r.x, s.box.y - r.y, { originX: 0, originY: 0 });
      }
    for (const i of ids) this.rts[i]!.render();
    this.lastMs = performance.now() - t0;
    this.lastChunks = ids.length;
    this.totalMs += this.lastMs;
  }

  /** The season's soft colour over the whole ground (src/world/seasons.ts SEASON_TINT): the textures' own tint, no extra draw. */
  setTint(color: number) {
    for (const r of this.rts) r?.setTint(color);
  }

  /** The textures' sizes (for the perf notes). */
  sizes() {
    return this.rts.filter((r) => !!r).map((r) => ({ w: r.width, h: r.height }));
  }

  get count() {
    return this.rts.filter((r) => !!r).length;
  }

  destroy() {
    for (const r of this.rts) r?.destroy();
    this.rts = [];
  }
}
