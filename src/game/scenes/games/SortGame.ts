import Phaser from 'phaser';
import { FRAME_H, FRAME_W, PIVOT } from '../../assets';
import { sfx } from '../../audio';
import { reducedMotion } from '../../motion';
import { crisp } from '../../SpeechBubble';
import { FEEDBACK, MiniGame, pace, PAL, TXT } from './MiniGame';
import { POINTS } from './scoring';
import { drain, isHot, label, newSortStats, nextParcel, send, shelfFor, SHELVES, SORT, SORT_LESSON, sortPoints, sortStars, sortVerdict, spawnMs, type Parcel, type SortStats } from './sorting';

interface Box {
  p: Parcel;
  t: Phaser.GameObjects.Text;
  /** When it reached the front of the belt. */
  front?: number;
}
interface Shelf {
  x: number;
  keys: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Rectangle;
  busy: Phaser.GameObjects.Text;
}

const SHELF_COLORS = [0xdd344c, 0xfde047, 0x8c4fff, 0x01a88d];

/**
 * DynamoDB Sorting Office: each parcel's key says which shelf it lives on. Send it there fast. In the
 * hot moment one key floods in and its shelf gets too busy (throttled) until you spread the key.
 * A wrong shelf is a wrong call and costs more than a guess earns, so mashing 1-2-3-4 misses the accuracy floor.
 */
export class SortGame extends MiniGame {
  private belt: Box[] = [];
  private shelves: Shelf[] = [];
  private loads: number[] = [];
  private stats: SortStats = newSortStats();
  private started = 0;
  private hotShown = false;
  private tipShown = false;
  private spreadBtn?: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Text;
  private dyna!: Phaser.GameObjects.Sprite;
  private geo = { beltY: 0, frontX: 0, step: 0, shelfTop: 0, shelfW: 0, shelfH: 0, hintY: 0, left: 0, right: 0 };

  constructor() {
    super('game:dynamodb', 'dynamodb', 'dynamodb', '📦 DynamoDB Sorting Office — send each parcel to the shelf with its key');
    this.duration = SORT.seconds;
  }

  protected setup() {
    this.belt = [];
    this.shelves = [];
    this.loads = SHELVES.map(() => 0);
    this.stats = newSortStats();
    this.hotShown = this.tipShown = false;
    this.spreadBtn = undefined;
    this.started = this.time.now;
    const { width: w, height: h } = this.scale;
    const top = this.top;
    const g = this.add.graphics();
    // library wall (Database Row purple) and a wooden floor
    g.fillStyle(0x2a1035, 1).fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 36) g.fillStyle(0x341443, 1).fillRect(x, top, 18, h);
    // The office is laid out top-down in a centred column (MiniGame.column): the belt, Dyna, the shelves (no taller
    // than they need to be), and the hint right under them. The belt runs on to the canvas's right edge.
    const room = h - top;
    const scale = Phaser.Math.Clamp(Math.floor((Math.min(room, 560) / 300) * 2) / 2, 1, 2);
    // Dyna stands between the belt's "sort me" mark and the shelves.
    const dynaRoom = 40 + Math.round(62 * scale) + 22;
    const shelfH = Phaser.Math.Clamp(room - 34 - dynaRoom - 44, 120, 230);
    const col = this.column(34 + dynaRoom + shelfH + 44);
    // the belt
    const beltY = col.y + 34;
    g.fillStyle(PAL.black, 1).fillRect(0, beltY - 18, w, 36);
    g.fillStyle(0x334155, 1).fillRect(0, beltY - 16, w, 32);
    for (let x = 6; x < w; x += 22) g.fillStyle(0x475569, 1).fillRect(x, beltY - 16, 4, 32);
    const frontX = col.x + 44;
    g.fillStyle(0xffb84d, 1).fillRect(frontX - 30, beltY + 18, 60, 4);
    crisp(this.add.text(frontX, beltY + 30, 'sort me', TXT(12, '#ffb84d'))).setOrigin(0.5);
    // Dyna in the middle, sorting
    const shelfTop = beltY + dynaRoom;
    this.dyna = this.add.sprite(col.cx, shelfTop - 22, 'char:dynamodb', 0).setOrigin(PIVOT.x / FRAME_W, PIVOT.y / FRAME_H).setScale(scale);
    this.dyna.play('dynamodb:idle:SE');
    // four shelves (partitions), each with its keys, a busy meter and a tap zone
    const n = SHELVES.length;
    const gap = 6;
    const shelfW = (col.w - 16 - gap * (n - 1)) / n;
    SHELVES.forEach((keys, i) => {
      const x = col.x + 8 + i * (shelfW + gap);
      const cx = x + shelfW / 2;
      g.fillStyle(PAL.black, 1).fillRect(x - 2, shelfTop - 2, shelfW + 4, shelfH + 4);
      g.fillStyle(0x7c4a21, 1).fillRect(x, shelfTop, shelfW, shelfH);
      for (let y = shelfTop + 44; y < shelfTop + shelfH - 6; y += 22) g.fillStyle(0x5b3415, 1).fillRect(x + 4, y, shelfW - 8, 4);
      g.fillStyle(SHELF_COLORS[i], 1).fillRect(x, shelfTop, shelfW, 6);
      crisp(this.add.text(cx, shelfTop + 18, `${i + 1}`, TXT(20, '#ffffff'))).setOrigin(0.5);
      // The keys are the thing to read: big, on a dark plate so they stand off the wood.
      const keyText = crisp(this.add.text(cx, shelfTop + 34, keys.join(' '), { ...TXT(24, '#ffffff'), align: 'center', backgroundColor: '#140d1f99', padding: { x: 6, y: 3 } })).setOrigin(0.5, 0);
      this.add.rectangle(x + 4, shelfTop + shelfH - 12, shelfW - 8, 8, 0x1f2937).setOrigin(0, 0.5).setStrokeStyle(1, PAL.black);
      const bar = this.add.rectangle(x + 5, shelfTop + shelfH - 12, 0, 6, 0x6fe3a3).setOrigin(0, 0.5);
      const busy = crisp(this.add.text(cx, shelfTop + shelfH - 26, '', { ...TXT(12, PAL.bad), backgroundColor: '#140d1fcc', padding: { x: 3, y: 1 } })).setOrigin(0.5);
      this.add
        .zone(x, shelfTop, shelfW, shelfH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.sortTo(i));
      this.shelves.push({ x: cx, keys: keyText, bar, busy });
    });
    this.geo = { beltY, frontX, step: Math.min(46, (col.r - frontX - 20) / SORT.beltMax), shelfTop, shelfW, shelfH, hintY: shelfTop + shelfH + 24, left: col.x, right: col.r };
    this.hint = crisp(this.add.text(w / 2, this.geo.hintY, 'Tap the shelf with the parcel’s key (or press 1–4)', { ...TXT(13, PAL.muted), align: 'center', wordWrap: { width: col.w - 24 } })).setOrigin(0.5);
    this.onKeys((k) => {
      const i = Number(k) - 1;
      if (i >= 0 && i < SHELVES.length) this.sortTo(i);
      else if ((k === 's' || k === 'S') && this.spreadBtn) this.spread();
    });
    this.spawn();
    this.scheduleSpawn();
  }

  /** Keeps a floater over a shelf on screen. */
  private near(x: number) {
    return Phaser.Math.Clamp(x, this.geo.left + 90, this.geo.right - 90);
  }

  private get t() {
    return (this.time.now - this.started) / 1000;
  }

  private scheduleSpawn() {
    this.time.delayedCall(pace(spawnMs(this.t)), () => {
      if (this.over) return;
      this.spawn();
      this.scheduleSpawn();
    });
  }

  private spawn() {
    if (this.belt.length >= SORT.beltMax) {
      this.stats.dropped++;
      this.addScore(-2, 'soft');
      this.floater(this.geo.right - 60, this.geo.beltY + 30, 'a parcel fell off!', FEEDBACK.wrong);
      return;
    }
    const p = nextParcel(this.t, this.stats.spread);
    const t = crisp(this.add.text(this.scale.width + 30, this.geo.beltY, label(p), { ...TXT(24, PAL.paperInk), backgroundColor: '#fffbeb', padding: { x: 6, y: 3 } })).setOrigin(0.5);
    this.belt.push({ p, t });
    this.layout();
  }

  /** Parcels slide up the belt; the first one is the one to sort. */
  private layout() {
    const { frontX, step, beltY } = this.geo;
    this.belt.forEach((b, i) => {
      const x = frontX + i * step;
      if (i === 0 && b.front === undefined) b.front = this.time.now;
      b.t.setScale(i === 0 ? 1.15 : 0.9).setDepth(i === 0 ? 20 : 10);
      if (reducedMotion()) b.t.setPosition(x, beltY);
      else this.tweens.add({ targets: b.t, x, y: beltY, duration: 180, ease: 'Stepped', easeParams: [4] });
    });
  }

  private sortTo(i: number) {
    if (this.over) return;
    const b = this.belt[0];
    if (!b) return;
    const shelf = this.shelves[i];
    const right = shelfFor(b.p);
    // Verdicts hang just above the shelves: clear of the belt's parcels and the shelves' keys.
    const vx = this.near(shelf.x);
    const vy = this.geo.shelfTop - 6;
    if (right !== i) {
      this.stats.wrong++;
      this.wrong();
      this.addScore(POINTS.sort.wrong);
      this.verdict(vx, vy, `✗ ${label(b.p)} lives on shelf ${right + 1}`, FEEDBACK.wrong, 1);
      return;
    }
    if (send(this.loads, i) === 'busy') {
      this.stats.throttled++;
      this.miss();
      this.verdict(vx, vy, '✗ Too busy! Wait…', FEEDBACK.wrong, 1);
      if (!this.stats.spread && this.spreadBtn && !this.tipShown) {
        this.tipShown = true;
        this.hint.setText('One shelf has all the 🍎. Tap 🔀 to spread the keys (or press S)').setColor('#fde047');
      }
      return;
    }
    const pts = sortPoints(this.time.now - (b.front ?? this.time.now));
    this.stats.sorted++;
    this.hit();
    this.addScore(pts);
    this.verdict(vx, vy, `✓ Shelf ${i + 1} +${pts}`, FEEDBACK.right, 1);
    this.belt.shift();
    this.dyna.play('dynamodb:file:SE');
    this.time.delayedCall(600, () => !this.over && this.dyna.play('dynamodb:idle:SE'));
    this.tweens.killTweensOf(b.t);
    if (reducedMotion()) b.t.destroy();
    else this.tweens.add({ targets: b.t, x: shelf.x, y: this.geo.shelfTop + this.geo.shelfH / 2, scale: 0.6, duration: 220, onComplete: () => b.t.destroy() });
    this.layout();
  }

  private spread() {
    if (this.over || this.stats.spread) return;
    this.stats.spread = true;
    this.spreadBtn?.destroy();
    this.spreadBtn = undefined;
    const hot = SORT.hotKey;
    this.shelves.forEach((s, i) => s.keys.setText(`${SHELVES[i].join(' ')}\n${hot}${i + 1}`));
    this.hint.setText(`Now ${hot} gets a number: ${hot}1 goes on shelf 1, ${hot}2 on shelf 2…`).setColor('#fde047');
    this.floater(this.scale.width / 2, this.geo.shelfTop - 40, 'Keys spread out!', '#fde047');
    sfx('correct', { own: true });
  }

  override update(t: number, dt: number) {
    super.update(t, dt);
    if (this.over) return;
    this.loads = drain(this.loads, dt / 1000);
    this.shelves.forEach((s, i) => {
      const f = this.loads[i] / SORT.shelfCap;
      s.bar.setSize((this.geo.shelfW - 10) * f, 6).setFillStyle(f > 0.67 ? 0xff6b6b : f > 0.34 ? 0xffb84d : 0x6fe3a3);
      s.busy.setText(this.loads[i] + 1 > SORT.shelfCap ? 'too busy' : '');
    });
    if (!this.hotShown && isHot(this.t)) {
      this.hotShown = true;
      const { width: w } = this.scale;
      this.floater(w / 2, this.geo.beltY + 60, `So many ${SORT.hotKey}!`, '#fde047');
      if (!this.stats.spread) {
        this.hint.setText('');
        this.spreadBtn = this.pxButton(w / 2, this.geo.hintY, `🔀 Spread the ${SORT.hotKey} keys`, () => this.spread(), 0x6fe3a3, PAL.paperInk);
      }
      sfx('pop', { soft: true });
    }
  }

  protected lesson() {
    // One line a kid can read. Partition keys, hashing and write sharding are in the DynamoDB flashcards.
    return `${'⭐'.repeat(sortStars(this.stats))} ${sortVerdict(this.stats)} ${SORT_LESSON}`;
  }
}
