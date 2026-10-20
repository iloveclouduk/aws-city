import Phaser from 'phaser';
import type { Tile } from '@/world/layout';
import { foundIn, GLINT_TILES, tokenFact, tokensFor, TOKENS_PER_CITY, type Token } from '@/world/tokens';
import { useCity } from '@/state/store';
import { addSprite, hasSprite } from './assets';
import { CITY_ISO, footprintDepth, toScreen } from './iso';
import { reducedMotion } from './motion';

const SPIN_MS = 140;
/** The pickup sparkle: this many gold and white motes fly out and fade over BURST_MS (one tween drives them all). */
const MOTES = 10;
const BURST_MS = 650;
const BURST_PX = 22;
const MOTE_COLOURS = [0xffd34d, 0xfff4c2, 0xffb000];
/** Over the token and the street, under speech bubbles and labels. */
const BURST_DEPTH = 49_000;

/**
 * The city's golden tokens (src/world/tokens.ts): hidden until Kai walks within GLINT_TILES, then they glint and spin;
 * stepping on one collects it (Progress.finds, synced) with a short sparkle where it lay. `onFound` lets the scene
 * celebrate (one moment, on the street).
 */
export class Tokens {
  private shown: { token: Token; img: Phaser.GameObjects.Image }[] = [];
  private key = '';
  private frame = 0;
  private frameAt = 0;
  /** Pooled motes for the pickup sparkle (made on the first pickup, reused after). */
  private motes: Phaser.GameObjects.Rectangle[] = [];
  private burstTween?: Phaser.Tweens.Tween;

  constructor(
    private scene: Phaser.Scene,
    private streets: () => Tile[],
    private onFound: (token: Token, fact: string, found: number, of: number) => void,
  ) {}

  /** Lays out the city's unfound tokens (again when the Region or the streets change). */
  sync() {
    const st = useCity.getState();
    const all = tokensFor(st.cityRegion, this.streets());
    const left = all.filter((t) => !st.progress.finds?.[t.id]);
    const key = `${st.cityRegion}|${left.map((t) => `${t.id}@${t.x},${t.y}`).join(';')}`;
    if (key === this.key || !hasSprite('token:0')) return;
    this.key = key;
    this.clear();
    for (const token of left) {
      const p = toScreen(CITY_ISO, token.x, token.y);
      const img = addSprite(this.scene, 'token:0', p.x, p.y).setDepth(footprintDepth(CITY_ISO, { x: token.x, y: token.y, w: 1, h: 1 }) + 1).setAlpha(0);
      this.shown.push({ token, img });
    }
  }

  /** Per frame: glint near Kai, spin, and pick up the one he stands on. */
  update(time: number, kai: Tile) {
    const spin = !reducedMotion() && time - this.frameAt >= SPIN_MS;
    if (spin) {
      this.frameAt = time;
      this.frame = (this.frame + 1) % 4;
    }
    for (const s of [...this.shown]) {
      const d = Math.abs(s.token.x - kai.x) + Math.abs(s.token.y - kai.y);
      if (d === 0) {
        this.collect(s);
        continue;
      }
      const target = d <= GLINT_TILES ? 1 - (d - 1) / (GLINT_TILES + 1) : 0;
      s.img.setAlpha(s.img.alpha + (target - s.img.alpha) * 0.15);
      if (spin && s.img.alpha > 0.05) s.img.setFrame(`token:${this.frame}`);
    }
  }

  private collect(s: { token: Token; img: Phaser.GameObjects.Image }) {
    this.shown = this.shown.filter((x) => x !== s);
    const { x, y } = s.img;
    s.img.destroy();
    if (!useCity.getState().collectFind(s.token.id)) return;
    this.burst(x, y - 6);
    const st = useCity.getState();
    this.onFound(s.token, tokenFact(s.token.certId), foundIn(st.progress, st.cityRegion), TOKENS_PER_CITY);
  }

  /** A short burst of gold motes where the token was (nothing under reduced motion: the speech bubble says it). */
  private burst(x: number, y: number) {
    if (reducedMotion()) return;
    if (!this.motes.length)
      for (let i = 0; i < MOTES; i++)
        this.motes.push(this.scene.add.rectangle(0, 0, i % 3 === 0 ? 3 : 2, i % 3 === 0 ? 3 : 2, MOTE_COLOURS[i % MOTE_COLOURS.length]).setDepth(BURST_DEPTH).setVisible(false));
    this.burstTween?.stop();
    const dirs = this.motes.map((_, i) => {
      const a = (i / MOTES) * Math.PI * 2 + Math.random() * 0.4;
      return { dx: Math.cos(a), dy: Math.sin(a) * 0.6 - 0.5, r: BURST_PX * (0.6 + Math.random() * 0.5) };
    });
    this.burstTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: BURST_MS,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        this.motes.forEach((m, i) => {
          const d = dirs[i];
          // Whole pixels, so the motes stay crisp in the pixel-art world; they drift up a little as they fade.
          m.setPosition(Math.round(x + d.dx * d.r * t), Math.round(y + d.dy * d.r * t - 6 * t * t)).setAlpha(1 - t * t).setVisible(true);
        });
      },
      onComplete: () => this.hideMotes(),
      onStop: () => this.hideMotes(),
    });
  }

  private hideMotes() {
    for (const m of this.motes) m.setVisible(false);
  }

  private clear() {
    for (const s of this.shown) s.img.destroy();
    this.shown = [];
  }

  destroy() {
    this.clear();
    this.burstTween?.stop();
    this.burstTween = undefined;
    for (const m of this.motes) m.destroy();
    this.motes = [];
    this.key = '';
  }
}
