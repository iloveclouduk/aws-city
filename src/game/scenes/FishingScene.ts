import Phaser from 'phaser';
import { useCity } from '@/state/store';
import { FRAME_H, FRAME_W, PIVOT } from '../assets';
import { sfx } from '../audio';
import { crisp, UI_FONT } from '../SpeechBubble';
import { FISH, type Fish, type StorageClass } from '@/world/minigames';
import { KAI_SHEET } from '@/world/culture';
import { syncClock } from './games/clock';
import { mixCatch } from './games/fishDeck';
import { growthLine, growthOf } from '@/state/growth';
import { dealRound, expert, expertOpen, pace, relaxed, setExpert } from '../pace';
import { onSceneEnd } from './lifecycle';
import { countRound, fishingStars, FULL_ROUNDS_A_DAY } from '@/learning/gameStars';
import { weeklyChallenge, WEEKLY_BONUS } from '@/state/events';
import { reducedMotion } from '../motion';
import { CSS } from '../theme';

/** Clicks are ignored this long after the line is reset, so the click that answered doesn't cast at once. */
const CALM_MS = 300;
/**
 * The quiz card's buttons wait this long, and then answer only on a press that starts and ends on the same button: an
 * excited click (or a held button) from the hook can't answer unread.
 */
const QUIZ_CALM_MS = 800;
/** The bite window: longer for the round's first bite, while the player learns the rhythm (both through pace()). */
const FIRST_BITE_MS = 1800;
const BITE_MS = 1100;

/**
 * S3 Lake mini-game: every fish is an object. Hook one, then drop it in the right storage-class
 * bucket based on how often it's accessed. Teaches Standard vs Standard-IA vs the S3 Glacier archive classes.
 */

type ClassId = StorageClass;
const CLASSES: { id: ClassId; label: string; color: number; note: string }[] = [
  { id: 'standard', label: 'S3 Standard', color: 0x3f9b4f, note: 'hot · read often' },
  { id: 'ia', label: 'Standard-IA', color: 0x3a6fd8, note: 'warm · monthly' },
  // The S3 Glacier storage classes as one archive bucket (Flexible Retrieval, Deep Archive); the cards explain each.
  { id: 'glacier', label: 'S3 Glacier', color: 0x7dd3fc, note: 'cold · archive' },
];

const ROUND = 5;
type State = 'ready' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'quiz' | 'summary';

export class FishingScene extends Phaser.Scene {
  private state: State = 'ready';
  private deck: Fish[] = [];
  private caught = 0;
  private correct = 0;
  private waterY = 0;
  private bobber!: Phaser.GameObjects.Arc;
  private line!: Phaser.GameObjects.Graphics;
  private rodTip = new Phaser.Math.Vector2();
  private player!: Phaser.GameObjects.Sprite;
  private hud!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private swimmers: Phaser.GameObjects.Container[] = [];
  private card?: Phaser.GameObjects.Container;
  private biteTimer?: Phaser.Time.TimerEvent;
  private hooked?: Phaser.GameObjects.Container;
  private bites = 0;
  private calmUntil = 0;

  constructor() {
    super('fishing');
  }

  create() {
    syncClock(this);
    this.state = 'ready';
    this.caught = 0;
    this.correct = 0;
    this.bites = 0;
    this.calmUntil = 0;
    this.swimmers = [];
    this.summaryCard = undefined;
    this.lastVerdict = '';
    // A mix of storage classes each round (at most two of a kind), so the answer isn't "Standard" four times.
    this.deck = mixCatch(dealRound(FISH, useCity.getState().progress.games?.fishing?.plays ?? 0, ROUND), FISH);
    this.build();
    this.scale.on('resize', this.relayout, this);
    onSceneEnd(this, () => this.scale.off('resize', this.relayout, this));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => !over.length && this.onClick(p));
  }

  /**
   * Re-lay out by restarting, but only before the first cast: mid-round the catch count would reset, and on the summary
   * the result would be lost, so there the result card just moves to the new centre ("Play again" picks up the size).
   */
  private relayout() {
    if (this.state === 'summary') return this.fitSummary();
    if (this.state === 'ready' && this.caught === 0) this.scene.restart();
  }

  /** The round's result card (centred on its middle) and its natural size, so a resize can move and fit it. */
  private summaryCard?: { c: Phaser.GameObjects.Container; shade: Phaser.GameObjects.Rectangle; w: number; h: number };

  /** Centres the result card and shrinks it to fit a short or narrow view, like MiniGame's end card. */
  private fitSummary() {
    if (!this.summaryCard) return;
    const { width: w, height: h } = this.scale;
    const { c, shade, w: cw, h: ch } = this.summaryCard;
    shade.setSize(w, h);
    c.setPosition(Math.round(w / 2), Math.round(18 + (h - 18) / 2)).setScale(Math.min(1, (h - 52) / (ch + 6), (w - 8) / cw));
  }

  private build() {
    const { width: w, height: h } = this.scale;
    this.waterY = h * 0.45;
    const g = this.add.graphics();
    // sky + far hills
    g.fillGradientStyle(0x7dd3fc, 0x7dd3fc, 0xe0f2fe, 0xe0f2fe, 1).fillRect(0, 0, w, this.waterY);
    g.fillStyle(0x4caf50, 1).fillEllipse(w * 0.75, this.waterY + 10, w * 0.9, 90);
    g.fillStyle(0x3f9b4f, 1).fillEllipse(w * 0.2, this.waterY + 16, w * 0.7, 70);
    // water
    g.fillGradientStyle(0x3b82f6, 0x3b82f6, 0x1e3a8a, 0x1e3a8a, 1).fillRect(0, this.waterY, w, h - this.waterY);
    for (let i = 0; i < 14; i++) g.fillStyle(0xffffff, 0.15).fillRect(Math.random() * w, this.waterY + 10 + Math.random() * (h - this.waterY - 20), 30 + Math.random() * 40, 2);

    // pier
    // Wide enough for three buckets and Kai side by side on the narrow panel too (his sprite never covers a label).
    const pierW = Math.min(340, Math.max(250, w * 0.42), w - 110);
    g.fillStyle(0x8b5a2b, 1).fillRect(0, this.waterY - 18, pierW, 18);
    g.fillStyle(0x6b4423, 1);
    for (let x = 12; x < pierW; x += 48) g.fillRect(x, this.waterY, 10, 60);

    // buckets on the pier
    CLASSES.forEach((c, i) => {
      const bx = 22 + i * ((pierW - 90) / 3);
      g.fillStyle(c.color, 1).fillRect(bx, this.waterY - 44, 30, 26);
      g.fillStyle(0x161622, 1).fillRect(bx - 2, this.waterY - 46, 34, 4);
      // Labels on dark plates, staggered so neighbours never overlap on a narrow screen.
      crisp(this.add.text(bx + 15, this.waterY - 50 - (i % 2) * 20, c.label.replace('S3 ', ''), { fontFamily: UI_FONT, fontSize: '12px', fontStyle: '800', color: '#ffffff', backgroundColor: '#140d1fd9', padding: { x: 5, y: 2 } })).setOrigin(0.5, 1);
    });

    // player with a rod
    // Kai, the player, fishing (team sprite, 2× for the close-up)
    this.player = this.add.sprite(pierW - 40, this.waterY - 18, `char:${KAI_SHEET}`, 0).setOrigin(PIVOT.x / FRAME_W, PIVOT.y / FRAME_H).setScale(2);
    this.player.play(`${KAI_SHEET}:idle:SE`);
    this.rodTip.set(this.player.x + 26, this.player.y - 62);

    this.line = this.add.graphics().setDepth(5);
    this.bobber = this.add.circle(0, 0, 6, 0xef4444).setStrokeStyle(2, 0xffffff).setVisible(false).setDepth(6);

    for (let i = 0; i < 6; i++) this.spawnSwimmer(i);

    // The same title bar as the other mini-games (MiniGame.chrome): dark plate, orange title, stat chip.
    this.add.rectangle(0, 0, w, 34, 0x140d1f, 0.94).setOrigin(0).setDepth(19);
    this.add.rectangle(0, 34, w, 2, 0x000000).setOrigin(0).setDepth(19);
    crisp(this.add.text(12, 17, '🎣 S3 Lake', { fontFamily: UI_FONT, fontSize: '14px', fontStyle: '800', color: '#ffb84d' })).setOrigin(0, 0.5).setDepth(20);
    this.hud = crisp(this.add.text(w - 12, 17, '', { fontFamily: UI_FONT, fontSize: '13px', fontStyle: '800', color: '#ffffff', backgroundColor: '#2d2144', padding: { x: 8, y: 3 } })).setOrigin(1, 0.5).setDepth(20);
    this.info = this.add
      .text(w / 2, 46, '', { fontFamily: UI_FONT, fontSize: '14px', fontStyle: '700', color: '#ffffff', backgroundColor: '#140d1fd9', padding: { x: 10, y: 6 }, align: 'center', wordWrap: { width: Math.min(520, w - 40) } })
      .setOrigin(0.5, 0)
      .setDepth(20);
    this.updateHud();
    this.setInfo('Click the water to cast. Each fish is an S3 object — choose the right storage class!');
  }

  private spawnSwimmer(i: number) {
    const { width: w, height: h } = this.scale;
    const y = this.waterY + 70 + ((h - this.waterY - 100) * (i + 0.5)) / 6;
    const c = this.add.container(Math.random() * w, y);
    const body = this.add.ellipse(0, 0, 34, 16, [0xfbbf24, 0xf472b6, 0xa3e635, 0xfb923c][i % 4]);
    const tail = this.add.triangle(-20, 0, 0, -8, 0, 8, 10, 0, 0xf59e0b);
    const eye = this.add.circle(10, -2, 2, 0x111827);
    c.add([tail, body, eye]).setDepth(3).setAlpha(0.9);
    const dir = Math.random() < 0.5 ? 1 : -1;
    c.setScale(dir, 1);
    c.setData('dir', dir);
    c.setData('speed', 30 + Math.random() * 40);
    c.setData('lane', i);
    c.setData('laneY', y);
    this.swimmers.push(c);
  }

  /** A new fish takes the first lane no fish swims in, so the lake stays spread out. */
  private freeLane() {
    const used = new Set(this.swimmers.map((f) => f.getData('lane') as number));
    return [0, 1, 2, 3, 4, 5].find((i) => !used.has(i)) ?? Math.floor(Math.random() * 6);
  }

  override update(_t: number, dt: number) {
    const w = this.scale.width;
    for (const f of this.swimmers) {
      if (f === this.hooked || f.getData('target')) continue;
      f.x += (f.getData('dir') * f.getData('speed') * dt) / 1000;
      if (f.x > w + 30) f.x = -30;
      if (f.x < -30) f.x = w + 30;
    }
    this.line.clear();
    if (this.bobber.visible) {
      this.line.lineStyle(1.5, 0xf8fafc, 0.9).lineBetween(this.rodTip.x, this.rodTip.y, this.bobber.x, this.bobber.y);
    }
  }

  private onClick(p: Phaser.Input.Pointer) {
    if (this.time.now < this.calmUntil) return;
    if (this.state === 'ready' && p.y > this.waterY + 10) return this.cast(p.x, p.y);
    if (this.state === 'bite') return this.hook();
  }

  private cast(x: number, y: number) {
    this.state = 'casting';
    this.player.play(`${KAI_SHEET}:fish:SE`);
    sfx('whoosh', { own: true });
    this.bobber.setPosition(this.rodTip.x, this.rodTip.y).setVisible(true);
    this.tweens.add({
      targets: this.bobber,
      x,
      y: this.waterY + 12,
      duration: 500,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.state = 'waiting';
        // The last answer's verdict stays up until the next bite: a quick cast never hides it.
        this.setInfo(this.lastVerdict ? `${this.lastVerdict}\nWaiting for a bite…` : 'Waiting for a bite…');
        this.tweens.add({ targets: this.bobber, y: '+=3', yoyo: true, repeat: -1, duration: 600 });
        this.time.delayedCall(900 + Math.random() * 1600, () => this.approach(x, y));
      },
    });
  }

  private approach(x: number, _y: number) {
    if (this.state !== 'waiting') return;
    const fish = this.swimmers.reduce((a, b) => (Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b));
    fish.setData('target', true);
    this.tweens.add({
      targets: fish,
      x: this.bobber.x,
      y: this.bobber.y + 18,
      duration: 700,
      onComplete: () => {
        this.state = 'bite';
        this.hooked = fish;
        this.tweens.killTweensOf(this.bobber);
        this.tweens.add({ targets: this.bobber, y: this.waterY + 22, yoyo: true, repeat: 3, duration: 110 });
        this.setInfo('❗ BITE! Click now!');
        this.splash();
        if (this.bites === 0) this.firstBite();
        this.biteTimer = this.time.delayedCall(pace(this.bites++ === 0 ? FIRST_BITE_MS : BITE_MS, 3), () => this.miss());
      },
    });
  }

  /**
   * The round's first bite: a big "Click now!" across the water and a soft white flash (no flash under reduced motion),
   * so a new player sees that this is the moment. Gone with the bite.
   */
  private firstBite() {
    const { width: w } = this.scale;
    const t = crisp(this.add.text(w / 2, this.waterY - 70, '👆 Click now!', { fontFamily: UI_FONT, fontSize: '34px', fontStyle: '900', color: CSS.gold, stroke: '#140d1f', strokeThickness: 7 }))
      .setOrigin(0.5)
      .setDepth(30);
    const gone = () => t.active && t.destroy();
    this.time.delayedCall(pace(FIRST_BITE_MS, 3), gone);
    this.input.once('pointerdown', gone);
    if (reducedMotion()) return;
    this.cameras.main.flash(160, 255, 255, 255);
    this.tweens.add({ targets: t, scale: { from: 0.6, to: 1.1 }, yoyo: true, repeat: 2, duration: 200 });
  }

  /** A big "!" over the bobber and a ring on the water: the bite is the moment to click. */
  private splash() {
    const { x, y } = this.bobber;
    const bang = crisp(this.add.text(x, y - 34, '!', { fontFamily: UI_FONT, fontSize: '40px', fontStyle: '900', color: CSS.gold, stroke: '#140d1f', strokeThickness: 6 })).setOrigin(0.5).setDepth(25);
    const ring = this.add.ellipse(x, y + 2, 20, 8).setStrokeStyle(2, 0xffffff, 0.9).setDepth(4);
    const done = () => (bang.destroy(), ring.destroy());
    if (reducedMotion()) return void this.time.delayedCall(pace(BITE_MS, 3), done);
    this.tweens.add({ targets: bang, scale: { from: 0.4, to: 1.2 }, yoyo: true, duration: 180, repeat: 1 });
    this.tweens.add({ targets: ring, scaleX: 3, scaleY: 3, alpha: 0, duration: 700, onComplete: () => this.time.delayedCall(300, done) });
  }

  private miss() {
    if (this.state !== 'bite') return;
    const fish = this.hooked;
    this.hooked = undefined;
    // The one that got away swims back down to its own lane (not along the surface).
    if (fish) this.tweens.add({ targets: fish, y: fish.getData('laneY') as number, duration: 600, ease: 'Quad.easeOut', onComplete: () => fish.setData('target', false) });
    this.reset('It got away! Click the water to cast again.');
  }

  private hook() {
    this.biteTimer?.remove();
    const fish = this.hooked!;
    const item = this.deck[this.caught];
    this.state = 'reeling';
    this.setInfo(`Reeling in ${item.name}…`);
    this.tweens.add({ targets: [fish, this.bobber], x: this.rodTip.x + 20, y: this.waterY - 60, duration: 700, ease: 'Back.easeIn', onComplete: () => this.quiz(item) });
  }

  private quiz(item: (typeof FISH)[number]) {
    this.state = 'quiz';
    this.calmUntil = this.time.now + QUIZ_CALM_MS;
    const { width: w } = this.scale;
    const cw = Math.min(420, w - 24);
    // The card stands in the sky, above the water where the player was clicking to cast and hook, so a click still
    // going there lands on the lake, not on a bucket. The info line steps aside while it's up.
    this.info.setVisible(false);
    const card = this.add.container(w / 2, Math.max(40, this.waterY - 200)).setDepth(30);
    const bg = this.add.rectangle(0, 0, cw, 190, 0xffffff).setStrokeStyle(3, 0x161622).setOrigin(0.5, 0);
    const t1 = crisp(this.add.text(0, 12, `📄 ${item.name}`, { fontFamily: UI_FONT, fontSize: '16px', color: '#161622' })).setOrigin(0.5, 0);
    const t2 = crisp(this.add.text(0, 38, `“${item.hint}”\nWhich bucket (storage class)?`, { fontFamily: UI_FONT, fontSize: '14px', color: '#374151', align: 'center', wordWrap: { width: cw - 24 } })).setOrigin(0.5, 0);
    card.add([bg, t1, t2]);
    const bw = (cw - 40) / 3;
    CLASSES.forEach((c, i) => {
      const x = -cw / 2 + 12 + bw / 2 + i * (bw + 8);
      const b = this.add.rectangle(x, 110, bw, 56, c.color).setStrokeStyle(2, 0x161622).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      const l = crisp(this.add.text(x, 118, `${c.label}\n${c.note}`, { fontFamily: UI_FONT, fontSize: w < 420 ? '12px' : '14px', fontStyle: '700', color: '#ffffff', align: 'center', stroke: '#161622', strokeThickness: 3, wordWrap: { width: bw - 6 } })).setOrigin(0.5, 0);
      // Armed by a press that starts on this button after the calm; answered when that press ends on it.
      let armed = false;
      b.on('pointerdown', () => (armed = this.time.now >= this.calmUntil))
        .on('pointerout', () => (armed = false))
        .on('pointerup', () => armed && this.state === 'quiz' && this.answer(item, c.id));
      card.add([b, l]);
    });
    this.card = card;
  }

  private answer(item: (typeof FISH)[number], choice: ClassId) {
    this.card?.destroy();
    this.card = undefined;
    this.caught++;
    const right = choice === item.answer;
    if (right) {
      this.correct++;
      sfx('correct', { own: true });
      this.player.play(`${KAI_SHEET}:jump:SE`);
      this.time.delayedCall(700, () => this.player.play(`${KAI_SHEET}:idle:SE`));
    }
    this.hooked?.destroy();
    this.swimmers = this.swimmers.filter((f) => f !== this.hooked);
    this.hooked = undefined;
    this.spawnSwimmer(this.freeLane());
    this.updateHud();
    if (!right) sfx('wrong', { own: true });
    const verdict = right ? `✅ Correct! ${item.why}` : `❌ Not quite: it’s ${CLASSES.find((c) => c.id === item.answer)?.label}. ${item.why}`;
    this.lastVerdict = verdict;
    if (this.caught >= ROUND) return this.summary(verdict);
    this.reset(`${verdict}\nClick the water to cast again.`);
  }

  private summary(last: string) {
    this.state = 'summary';
    this.bobber.setVisible(false);
    const perfect = this.correct === ROUND;
    const s = useCity.getState();
    const best = s.progress.games?.fishing?.best ?? 0;
    // Paid once, like the other games: full for the first rounds of the day or a new best, half after
    // (src/learning/gameStars.ts). The next round deals harder catches (dealRound) and the best score is kept.
    // The weekly challenge's game pays half as many stars again (src/state/events.ts), as in MiniGame.finish.
    const weekly = weeklyChallenge().game === 'fishing';
    const roundsBefore = countRound('fishing');
    const stars = Math.round(fishingStars(this.correct, perfect, roundsBefore, this.correct > best) * (weekly ? WEEKLY_BONUS : 1));
    // A round that caught something pays City Coins too (store.recordGame, contract v2.14).
    const coins = s.recordGame('fishing', this.correct, { timed: !relaxed() });
    const halved = this.correct > 0 && this.correct <= best && roundsBefore >= FULL_ROUNDS_A_DAY;
    if (stars > 0) s.addXp('s3', stars);
    if (this.correct > 0) s.noteLearning('games');
    const record = this.correct > best && best > 0 ? ' New best!' : '';
    // The building the round grew, and how far (src/state/growth.ts), like the other games' end card.
    const g = growthOf(useCity.getState().progress, 's3', useCity.getState().cityRegion);
    // A paper card in the middle, like the other games' end card (MiniGame.finish): the last answer, the result, the
    // building it grew, a tip, and the buttons, all in one place on any size of view.
    this.info.setVisible(false);
    const { width: w, height: h } = this.scale;
    const cw = Math.min(440, Math.max(300, w - 24));
    const items: Phaser.GameObjects.GameObject[] = [];
    let y = 18;
    const text = (str: string, size: number, color: string, weight = '800') => {
      const t = crisp(this.add.text(0, y, str, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: weight, color, align: 'center', wordWrap: { width: cw - 40 }, lineSpacing: 2 })).setOrigin(0.5, 0);
      items.push(t);
      y += t.height + 8;
      return t;
    };
    text(record ? '🏆 New best!' : 'Round over', 16, '#92400e');
    text(`${this.correct}/${ROUND} objects in the right bucket${perfect ? ' — perfect!' : ''}${stars ? `   ·   +${stars} ⭐${coins ? `  +${coins} City Coins` : ''}${weekly ? ' ⚡ weekly' : ''}` : ''}`, 14, '#1b1200');
    if (halved) text(`Half stars after ${FULL_ROUNDS_A_DAY} rounds a day. Full stars again tomorrow, or beat your best!`, 12, '#6b7280', '600');
    text(last, 13, '#374151', '600');
    text(`🏗️ ${growthLine(g)}`, 13, '#374151');
    const barW = Math.min(260, cw - 60);
    items.push(this.add.rectangle(0, y, barW, 8, 0x000000, 0.15), this.add.rectangle(-barW / 2, y, Math.max(4, barW * g.pct), 8, 0x16a34a).setOrigin(0, 0.5));
    y += 16;
    text('Tip: Lifecycle rules can move files to cheaper shelves for you.', 13, '#374151', '600');
    const by = y + 16;
    const ch = by + 30;
    const buttons: Phaser.GameObjects.Text[] = [];
    const button = (x: number, label: string, color: string, bg: string, run: () => void) =>
      buttons.push(
        crisp(this.add.text(x, by, label, { fontFamily: UI_FONT, fontSize: '14px', fontStyle: '800', color, backgroundColor: bg, padding: { x: 14, y: 8 } }))
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', run),
      );
    const leave = () => (setExpert(false), useCity.getState().setView({ name: 'city' }));
    // S3 Lake at level 3: an Expert round with the harder catches and a shorter bite.
    const dx = Math.min(130, (cw - 40) / 3);
    if (expertOpen('s3')) {
      button(-dx, '🎣 Play again', '#4a2e07', '#ffb84d', () => (setExpert(false), this.scene.restart()));
      button(0, '⚡ Expert', '#1b1200', '#f472b6', () => (setExpert(true), this.scene.restart()));
      button(dx, '← City', '#ffffff', '#2d2144', leave);
    } else {
      button(-Math.min(80, dx), '🎣 Play again', '#4a2e07', '#ffb84d', () => (setExpert(false), this.scene.restart()));
      button(Math.min(80, dx), '← City', '#ffffff', '#2d2144', leave);
    }
    const shade = this.add.rectangle(0, 0, w, h, 0x140d1f, 0.5).setOrigin(0).setDepth(28);
    const c = this.add.container(0, 0).setDepth(30);
    c.add([this.add.rectangle(0, ch / 2 + 5, cw, ch, 0x000000), this.add.rectangle(0, ch / 2, cw, ch, 0xfffbeb).setStrokeStyle(3, 0x000000), ...items, ...buttons]);
    for (const o of c.list as unknown as Phaser.GameObjects.Components.Transform[]) o.y -= ch / 2;
    this.summaryCard = { c, shade, w: cw, h: ch };
    this.fitSummary();
  }

  /** The last answer's verdict, shown until the next bite. */
  private lastVerdict = '';

  private reset(msg: string) {
    this.info.setVisible(true);
    this.player.play(`${KAI_SHEET}:idle:SE`);
    this.tweens.killTweensOf(this.bobber);
    this.bobber.setVisible(false);
    this.state = 'ready';
    this.calmUntil = this.time.now + CALM_MS;
    this.setInfo(msg);
  }

  private setInfo(t: string) {
    this.info.setText(t);
  }

  private updateHud() {
    this.hud.setText(`${expert() ? '⚡ Expert · ' : ''}Catches ${this.caught}/${ROUND} · Correct ${this.correct}`);
  }
}
