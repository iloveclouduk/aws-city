// Build mode in the city (src/state/buildmode.ts holds the rules): the player's decorations, drawn from Progress.decor
// for this Region's city (culled, depth-sorted like the decor, their @lights at night), the city sign with the city's
// name written on its board, and while building, the ghost under the pointer (or the keyboard cursor): the picked
// prop tinted green where it may stand and red where it may not, over its footprint's tiles, and every tile it may
// stand on tinted green (src/world/decorate.ts). Placing puffs a little
// cloud of dust (none under reduced motion).
import Phaser from 'phaser';
import type { DecorProp } from '@/backend/contract';
import { itemOfKind, tilesFor, whyNot, type Ground } from '@/state/buildmode';
import type { Tile } from '@/world/layout';
import { addSprite, hasSprite } from './assets';
import { boxOfImage, type Culler } from './cull';
import { cornerScreen, CITY_ISO, footprintDepth, toScreen } from './iso';
import { reducedMotion } from './motion';
import { crisp, TEXT_FONT } from './SpeechBubble';

/** The city sign's board: its centre stands this many px above the middle of its 2×2 lot (art/tiles/builder_art.py SIGN_Z). */
export const SIGN_Z = 30;
/** The board's lettering area (px): the name shrinks to fit. */
const SIGN_TEXT_W = 52;
const SIGN_TEXT_H = 13;
/** The ghost and its tiles draw over the city (buildings, night lights at 70,001 aside): above props, below labels. */
const GHOST_DEPTH = 39_000;

/**
 * For the smoke (window.awsCity.build, dev builds): where a prop of `kind` may go now, as tiles and the page pixels to
 * click (the live city scene fills it in, and empties it on teardown).
 */
export const buildProbe: { spots?: (kind: string, n: number) => { x: number; y: number; px: number; py: number }[]; count?: () => number; cursor?: () => Tile | undefined; free?: () => number } = {};

interface Shown {
  key: string;
  img: Phaser.GameObjects.Image;
  lit?: Phaser.GameObjects.Image;
  text?: Phaser.GameObjects.Text;
}

const sizeOf = (kind: string) => itemOfKind(kind)?.size ?? 1;

export class BuildLayer {
  private shown = new Map<string, Shown>();
  private night = 0;
  private ghost?: Phaser.GameObjects.Image;
  private ghostTiles?: Phaser.GameObjects.Graphics;
  private ghostKind?: string;
  /** Every tile the picked decoration may stand on now, tinted green while building (redrawn only when they change). */
  private freeTint?: Phaser.GameObjects.Graphics;
  private freeKey = '';
  private freeCount = 0;
  private cityName = '';
  /** The keyboard cursor / last pointer tile while building. */
  cursor?: Tile;

  constructor(
    private scene: Phaser.Scene,
    private culler?: Culler,
  ) {}

  /** Draws this city's decorations; only what changed is redrawn. */
  sync(props: DecorProp[], cityName: string, hidden?: string) {
    const renamed = cityName !== this.cityName;
    this.cityName = cityName;
    const want = new Map(props.filter((q) => q.id !== hidden && hasSprite(q.kind)).map((q) => [q.id, q] as const));
    for (const [id, s] of this.shown) {
      const q = want.get(id);
      if (q && `${q.kind}@${q.x},${q.y}` === s.key && !(renamed && s.text)) continue;
      this.drop(s);
      this.shown.delete(id);
    }
    for (const [id, q] of want) if (!this.shown.has(id)) this.shown.set(id, this.show(q));
  }

  private show(q: DecorProp): Shown {
    const n = cornerScreen(CITY_ISO, q.x, q.y);
    const s = sizeOf(q.kind);
    const img = addSprite(this.scene, q.kind, n.x, n.y).setDepth(footprintDepth(CITY_ISO, { x: q.x, y: q.y, w: s, h: s }));
    this.culler?.add(img, boxOfImage(img));
    const lk = `${q.kind}@lights`;
    let lit: Phaser.GameObjects.Image | undefined;
    if (hasSprite(lk)) {
      lit = addSprite(this.scene, lk, n.x, n.y).setDepth(70_001).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.night);
      this.culler?.add(lit, boxOfImage(lit));
    }
    let text: Phaser.GameObjects.Text | undefined;
    if (q.kind === 'deco:citysign' && this.cityName) {
      const c = cornerScreen(CITY_ISO, q.x + 1, q.y + 1);
      text = crisp(this.scene.add.text(c.x, c.y - SIGN_Z, this.cityName.toUpperCase(), { fontFamily: TEXT_FONT, fontSize: '10px', fontStyle: '900', color: '#232f3e' }))
        .setOrigin(0.5, 0.5)
        .setDepth(img.depth + 0.01);
      text.setScale(Math.min(1, SIGN_TEXT_W / Math.max(1, text.width), SIGN_TEXT_H / Math.max(1, text.height)));
    }
    return { key: `${q.kind}@${q.x},${q.y}`, img, lit, text };
  }

  private drop(s: Shown) {
    for (const o of [s.img, s.lit]) if (o) (this.culler?.remove(o), o.destroy());
    s.text?.destroy();
  }

  setNight(n: number) {
    this.night = n;
    for (const s of this.shown.values()) s.lit?.setAlpha(n);
  }

  /** The ghost of `kind` at tile t, green where it may stand on this ground among `props`, red where not. */
  showGhost(kind: string | undefined, t: Tile | undefined, ground: Ground, props: DecorProp[], moving?: string) {
    this.cursor = t;
    if (!kind || !t || !hasSprite(kind)) return this.hideGhost();
    const ok = !whyNot(ground, props, kind, t.x, t.y, moving);
    const n = cornerScreen(CITY_ISO, t.x, t.y);
    // A new kind gets a new Image: addSprite sets the origin from that sprite's own anchor.
    if (!this.ghost || this.ghostKind !== kind) {
      this.ghost?.destroy();
      this.ghost = addSprite(this.scene, kind, n.x, n.y).setAlpha(0.8);
      this.ghostKind = kind;
    }
    // Over everything (a ghost behind a tower would be lost), under the labels' and bubbles' layer.
    this.ghost.setPosition(n.x, n.y).setDepth(GHOST_DEPTH + 1).setTint(ok ? 0xa8ffb0 : 0xff8a80).setVisible(true);
    const g = (this.ghostTiles ??= this.scene.add.graphics().setDepth(GHOST_DEPTH));
    g.clear();
    const col = ok ? 0x3ddc84 : 0xff5252;
    for (const c of tilesFor(kind, t.x, t.y)) {
      const p = toScreen(CITY_ISO, c.x, c.y);
      const pts = [new Phaser.Math.Vector2(p.x, p.y - 8), new Phaser.Math.Vector2(p.x + 16, p.y), new Phaser.Math.Vector2(p.x, p.y + 8), new Phaser.Math.Vector2(p.x - 16, p.y)];
      g.fillStyle(col, 0.35).fillPoints(pts, true);
      g.lineStyle(1, col, 0.9).strokePoints(pts, true);
    }
    g.setVisible(true);
  }

  hideGhost() {
    this.ghost?.setVisible(false);
    this.ghostTiles?.clear().setVisible(false);
  }

  /**
   * Tints every tile of `tiles()` green (where a tap builds); undefined clears it. An unchanged `key` keeps what's
   * drawn (tiles() isn't even asked: the pointer moves often, the free ground rarely).
   */
  showFree(tiles: (() => Tile[]) | undefined, key = '') {
    if (!tiles) {
      this.freeKey = '';
      this.freeTint?.clear().setVisible(false);
      return;
    }
    if (key && key === this.freeKey && this.freeTint?.visible) return;
    this.freeKey = key;
    const list = tiles();
    this.freeCount = list.length;
    const g = (this.freeTint ??= this.scene.add.graphics().setDepth(GHOST_DEPTH - 1));
    g.clear();
    for (const c of list) {
      const p = toScreen(CITY_ISO, c.x, c.y);
      const pts = [new Phaser.Math.Vector2(p.x, p.y - 8), new Phaser.Math.Vector2(p.x + 16, p.y), new Phaser.Math.Vector2(p.x, p.y + 8), new Phaser.Math.Vector2(p.x - 16, p.y)];
      g.fillStyle(0x3ddc84, 0.28).fillPoints(pts, true);
      g.lineStyle(1, 0x3ddc84, 0.55).strokePoints(pts, true);
    }
    g.setVisible(true);
  }

  /** For the smoke: how many tiles are tinted green now. */
  freeShown() {
    return this.freeTint?.visible ? this.freeCount : 0;
  }

  /** A little puff of dust where a prop was placed or removed. */
  poof(t: Tile, size = 1) {
    if (reducedMotion()) return;
    const c = toScreen(CITY_ISO, t.x + (size - 1) / 2, t.y + (size - 1) / 2);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const dot = this.scene.add.circle(c.x, c.y, 3 + (i % 3), 0xf4ede0, 0.9).setDepth(60_000);
      this.scene.tweens.add({ targets: dot, x: c.x + Math.cos(a) * 18 * size, y: c.y + Math.sin(a) * 9 * size - 6, alpha: 0, scale: 0.4, duration: 420, ease: 'Quad.easeOut', onComplete: () => dot.destroy() });
    }
  }

  /** For the smoke: decorations drawn now. */
  count() {
    return this.shown.size;
  }

  destroy() {
    for (const s of this.shown.values()) this.drop(s);
    this.shown.clear();
    this.ghost?.destroy();
    this.ghostTiles?.destroy();
    this.freeTint?.destroy();
    this.ghost = this.ghostTiles = this.freeTint = undefined;
  }
}
