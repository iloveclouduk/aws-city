import Phaser from 'phaser';
import { FEEDBACK, MiniGame, pace, TXT } from './MiniGame';
import { POINTS, SWING, swingReady } from './scoring';
import { reducedMotion } from '../../motion';
import { crisp } from '../../SpeechBubble';
import { useCity } from '@/state/store';
import { SHIELD, tierFor, type Attack, type WafRule } from '@/world/minigames';

type Kind = 'good' | 'flood' | 'l7';
/** A new wave every this many seconds: traffic comes faster and moves quicker. */
const WAVE_S = 15;

/**
 * Shield Wall: Shield Standard absorbs volumetric floods (L3/L4) automatically, so you don't click those.
 * Application-layer (L7) attacks need AWS WAF rules: click them before they reach the castle. Never block real users.
 * Each block names the rule that would catch it; the lesson at the end counts what you stopped. Space strikes whatever
 * is nearest the wall (a real user too), once per cooldown, and a swing at an empty road costs: mashing doesn't win.
 */
export class ShieldGame extends MiniGame {
  private attacks: Attack[] = [];
  private stopped: Partial<Record<WafRule, number>> = {};
  private wave = 0;
  private started = 0;
  /** The castle's left edge and the road's top and bottom. */
  private road = { x: 0, y0: 0, y1: 0 };

  constructor() {
    super('game:shield', 'shield', 'shield', '🛡️ Shield Wall — click red L7 attacks; let green users in. Space strikes whatever is in front (a user too): press it only when a red one leads');
  }

  protected setup() {
    this.onRoad = [];
    this.lastSwing = -Infinity;
    this.onKeys((k) => (k === ' ' || k.startsWith('Arrow')) && this.strikeNearest());
    const { width: w, height: h } = this.scale;
    // A composed scene in a centred column (MiniGame.column): sky, the road between the castle and the right edge,
    // a strip of grass, and the legend right under it. The road's height is capped, so a tall tab doesn't stretch it.
    const legend = crisp(this.add.text(w / 2, 0, '🔵 floods: leave them to Shield   🔴 click L7 attacks   🟢 let real users in   Space: strikes the one in front, red or not', { ...TXT(14, '#cbd5e1'), backgroundColor: '#140d1fcc', padding: { x: 6, y: 2 }, align: 'center', wordWrap: { width: Math.min(w, 760) - 24 } }))
      .setOrigin(0.5, 0)
      .setDepth(5);
    const roadH = Phaser.Math.Clamp(Math.round((h - this.top - 70 - 40 - legend.height) * 0.9), 150, 340);
    const col = this.column(70 + roadH + 40 + legend.height);
    const y0 = col.y + 70;
    const y1 = y0 + roadH;
    this.road = { x: col.x, y0, y1 };
    legend.setY(y1 + 34);
    const g = this.add.graphics();
    // night sky in bands, a few stars
    const sky = [0x0f172a, 0x131c33, 0x17213c, 0x1b2745];
    sky.forEach((c, i) => g.fillStyle(c, 1).fillRect(0, (i * y0) / sky.length, w, y0 / sky.length + 1));
    for (let i = 0; i < 24; i++) g.fillStyle(0xffffff, 0.3 + (i % 3) * 0.2).fillRect((i * 97) % w, this.top + ((i * 53) % Math.max(1, y0 - this.top - 6)), 2, 2);
    // the internet road the traffic travels along
    g.fillStyle(0x1e293b, 1).fillRect(0, y0, col.x, roadH);
    g.fillStyle(0x334155, 1).fillRect(col.x, y0, w - col.x, roadH);
    for (let x = col.x + 90; x < w; x += 40) g.fillStyle(0x475569, 1).fillRect(x, (y0 + y1) / 2, 20, 3);
    g.fillStyle(0x1e293b, 1).fillRect(0, y1, w, h - y1);
    g.fillStyle(0x3f9b4f, 1).fillRect(0, y1, w, 6);
    // castle: wall, battlements, gate
    const cx = col.x;
    const cw = 76;
    const cTop = y0 - 14;
    g.fillStyle(0x94a3b8, 1).fillRect(cx, cTop, cw, y1 + 6 - cTop);
    for (let x = cx; x < cx + cw; x += 16) g.fillStyle(0x94a3b8, 1).fillRect(x, cTop - 10, 10, 10);
    for (let y = cTop + 6; y < y1 + 6; y += 14) for (let x = cx + ((y / 14) % 2) * 8; x < cx + cw; x += 18) g.fillStyle(0x7c8aa0, 1).fillRect(x, y, 14, 2);
    const gateH = Math.min(90, roadH * 0.4);
    g.fillStyle(0x3b2414, 1).fillRect(cx + 26, y1 + 6 - gateH, 26, gateH);
    g.fillStyle(0x000000, 1).fillRect(cx, cTop - 10, 2, y1 + 16 - cTop);
    crisp(this.add.text(cx + cw / 2, cTop - 22, 'your app', { ...TXT(14, '#e2e8f0'), backgroundColor: '#140d1fcc', padding: { x: 5, y: 1 } })).setOrigin(0.5);
    // the shield (Shield Standard): always on, absorbs floods
    this.add.ellipse(cx + cw + 8, (cTop + y1) / 2, 56, y1 - cTop + 24, 0x60a5fa, 0.14).setStrokeStyle(3, 0x60a5fa, 0.7);
    const plays = useCity.getState().progress.games?.shield?.plays ?? 0;
    this.attacks = SHIELD.attacks.filter((a) => a.tier <= tierFor(plays));
    this.stopped = {};
    this.wave = 0;
    this.started = this.time.now;
    this.scheduleSpawn();
  }

  /** The next arrival: sooner each wave (900 ms apart at first, 500 ms by the third wave). */
  private scheduleSpawn() {
    if (this.over) return;
    const wave = Math.floor((this.time.now - this.started) / 1000 / WAVE_S);
    if (wave > this.wave) {
      this.wave = wave;
      this.floater(this.scale.width / 2, this.road.y0 - 30, `Wave ${wave + 1}: they're getting faster`, '#fde047');
    }
    this.time.delayedCall(pace(Math.max(500, 900 - this.wave * 200)), () => {
      if (this.over) return;
      this.spawn();
      this.scheduleSpawn();
    });
  }

  /** Everything on the road now (Space strikes the one nearest the wall, whatever it is). */
  private onRoad: Phaser.GameObjects.Text[] = [];
  /** When Space last swung (one swing per SWING.cooldownMs). */
  private lastSwing = -Infinity;

  /**
   * Space or an arrow key: strike whatever is closest to the castle, as a click on it would: a real user or a flood
   * too, so the key is for reading the road, not holding down. A swing at an empty road costs (src/game/scenes/games/scoring.ts).
   */
  private strikeNearest() {
    const now = this.time.now;
    if (!swingReady(this.lastSwing, now)) return;
    this.lastSwing = now;
    const t = this.onRoad.reduce<Phaser.GameObjects.Text | undefined>((a, b) => (!a || b.x < a.x ? b : a), undefined);
    if (t) return void t.emit('pointerdown');
    this.wrong();
    this.addScore(SWING.blank);
    this.floater(this.road.x + 110, (this.road.y0 + this.road.y1) / 2, `nothing to stop ${SWING.blank}`, FEEDBACK.wrong);
  }

  private spawn() {
    const FLOODS = ['SYN SYN SYN', 'UDP UDP UDP', 'ACK ACK ACK', 'DNS reflect'];
    const { width: w } = this.scale;
    const { x: cx, y0, y1 } = this.road;
    const r = Math.random();
    const kind: Kind = r < 0.4 ? 'good' : r < 0.6 ? 'flood' : 'l7';
    const y = y0 + (y1 - y0) * (0.08 + Math.random() * 0.84);
    const attack = kind === 'l7' ? this.attacks[Math.floor(Math.random() * this.attacks.length)] : undefined;
    // Floods are network and transport layer (layer 3/4) attacks, which Shield Standard absorbs; layer 7 is WAF's job.
    const label = kind === 'good' ? SHIELD.good[Math.floor(Math.random() * SHIELD.good.length)] : attack ? attack.label : FLOODS[Math.floor(Math.random() * FLOODS.length)];
    const color = kind === 'good' ? '#86efac' : kind === 'l7' ? '#fca5a5' : '#93c5fd';
    const t = crisp(this.add.text(w + 10, y, label, { ...TXT(16, color), backgroundColor: '#0f172ae6', padding: { x: 5, y: 2 } })).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    this.onRoad.push(t);
    t.once('destroy', () => (this.onRoad = this.onRoad.filter((x) => x !== t)));
    const quicken = 1 - Math.min(0.35, this.wave * 0.15);
    const speed = (kind === 'flood' ? 5200 : 6500 + Math.random() * 1500) * quicken;
    const tw = this.tweens.add({
      targets: t,
      x: cx + 80,
      duration: pace(speed),
      onComplete: () => {
        if (this.over) return t.destroy();
        if (kind === 'flood') {
          this.floater(cx + 110, y, 'absorbed by Shield', FEEDBACK.note);
          // Gone from the road: neither Space nor a click can strike it now.
          this.onRoad = this.onRoad.filter((x) => x !== t);
          t.disableInteractive();
          this.tweens.add({ targets: t, x: cx + (w - cx) * 0.4, alpha: 0, duration: 400, onComplete: () => t.destroy() });
          return;
        }
        if (kind === 'good') {
          this.hit();
          this.addScore(POINTS.shield.passed, 'none');
        } else {
          this.wrong();
          this.addScore(POINTS.shield.breach, 'soft');
          this.floater(cx + 110, y, 'breach!', FEEDBACK.wrong);
          if (!reducedMotion()) this.cameras.main.shake(120, 0.004);
        }
        t.destroy();
      },
    });
    t.on('pointerdown', () => {
      if (this.over) return;
      tw.stop();
      if (kind === 'l7' && attack) {
        this.hit();
        this.addScore(POINTS.shield.block);
        this.stopped[attack.rule] = (this.stopped[attack.rule] ?? 0) + 1;
        this.floater(t.x, y, `${SHIELD.rules[attack.rule].name} ✓`, '#fde047');
      } else if (kind === 'good') {
        this.wrong();
        this.addScore(POINTS.shield.blockedUser);
        this.floater(t.x, y, 'blocked a real user!', FEEDBACK.wrong);
      } else {
        // A flood is Shield's: clicking it wastes the defender's time (the lesson is "let Shield absorb it").
        this.wrong();
        this.addScore(POINTS.shield.flood);
        this.floater(t.x, y, 'Shield had this one: let floods through', FEEDBACK.note);
      }
      t.destroy();
    });
  }

  protected lesson() {
    // One line a kid can read. Shield Standard, WAF and Shield Advanced are in the Shield flashcards.
    const caught = Object.values(this.stopped).reduce((a, n) => a + (n ?? 0), 0);
    const tally = caught ? `You stopped ${caught} sneaky attack${caught === 1 ? '' : 's'}! ` : '';
    return `${tally}Shield blocks big floods for free; WAF rules catch the sneaky ones.`;
  }
}
