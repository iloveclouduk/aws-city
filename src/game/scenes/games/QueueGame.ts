import Phaser from 'phaser';
import { FEEDBACK, MiniGame, pace, TXT } from './MiniGame';
import { reducedMotion } from '../../motion';
import { crisp } from '../../SpeechBubble';
import { QUEUE } from '@/world/minigames';
import { POINTS } from './scoring';

const WORK_MS = 800;

interface Live {
  t: Phaser.GameObjects.Text;
  poison: boolean;
  tw: Phaser.Tweens.Tween;
}

/**
 * Queue Juggler (SQS): messages ride a conveyor to one worker, who takes one at a time. Click a message (or Space for
 * the front one) to park it in the queue: the worker pulls from the queue whenever it's free. A message that reaches a
 * busy worker is lost. Poison messages (red) fail every time: drag them to the dead-letter queue (or D for the front
 * one) instead. Poison put in the queue, or a good message thrown in the DLQ, costs more than a right call pays, so
 * clicking everything doesn't win (src/game/scenes/games/scoring.ts).
 */
export class QueueGame extends MiniGame {
  private queued: Phaser.GameObjects.Text[] = [];
  private live: Live[] = [];
  private busyUntil = 0;
  private waves = 0;
  private qx = 0;
  private qy = 0;
  private beltY = 0;
  /** Where a message meets the worker. */
  private beltEnd = 0;
  private spawned = 0;
  private dlq = 0;
  private dlqText?: Phaser.GameObjects.Text;
  private dlqZone = new Phaser.Geom.Rectangle();
  private worker?: Phaser.GameObjects.Rectangle;

  constructor() {
    super('game:queue', 'queue', 'sqs', '📬 Queue Juggler — click a message (or Space) to queue it; drag red poison to the DLQ (or D)');
  }

  protected setup() {
    this.queued = [];
    this.live = [];
    this.busyUntil = 0;
    this.waves = 0;
    this.dlq = 0;
    this.onKeys((k) => {
      const f = this.front();
      if (!f) return;
      if (k === ' ') this.decide(f, false);
      else if (k === 'd' || k === 'D') this.decide(f, true);
    });
    const { width: w, height: h } = this.scale;
    // The play sits in a centred column (MiniGame.column): the belt, the queue tray a short walk below it, and the
    // legend right under the tray. The belt still runs in from the canvas's left edge.
    const cw = Math.min(w, 760);
    const legend = crisp(
      this.add.text(w / 2, 0, '⚪ click to queue · 🔴 drag poison to the DLQ · Space: queue the front one · D: front one to the DLQ', {
        ...TXT(13, '#cbd5e1'),
        backgroundColor: '#140d1fcc',
        padding: { x: 6, y: 2 },
        align: 'center',
        wordWrap: { width: cw - 24 },
      }),
    )
      .setOrigin(0.5, 0)
      .setDepth(5);
    // Room between the belt and the tray for the floaters ("worker busy: lost!", "✓ to the DLQ").
    const gap = Phaser.Math.Clamp(h - this.top - 44 - 26 - 18 - legend.height - 12, 96, 170);
    const col = this.column(44 + gap + 26 + 18 + legend.height);
    this.beltY = col.y + 44;
    this.qy = this.beltY + gap;
    legend.setY(this.qy + 26 + 18);
    const g = this.add.graphics();
    g.fillStyle(0x1b1530, 1).fillRect(0, this.top, w, h - this.top);
    // The conveyor (left to right), the worker (right), the queue tray (bottom) and the DLQ bin (bottom right).
    const r = col.r;
    this.beltEnd = r - 90;
    g.fillStyle(0x334155, 1).fillRect(0, this.beltY - 20, r - 100, 40);
    for (let x = 10; x < r - 100; x += 30) g.fillStyle(0x475569, 1).fillRect(x, this.beltY - 2, 14, 3);
    this.worker = this.add.rectangle(r - 50, this.beltY, 76, 56, 0xf0a63a).setStrokeStyle(3, 0x000000);
    crisp(this.add.text(r - 50, this.beltY, 'worker', TXT(14, '#2a1a04'))).setOrigin(0.5);
    this.qx = col.x + 20;
    g.lineStyle(2, 0xff9900, 1).strokeRect(col.x + 10, this.qy - 20, col.w - 140, 40);
    crisp(this.add.text(col.x + 14, this.qy - 36, 'SQS queue: the worker pulls when free', TXT(13, '#ffb84d')));
    this.dlqZone.setTo(r - 120, this.qy - 26, 110, 52);
    g.fillStyle(0x3b0d12, 1).fillRect(r - 120, this.qy - 26, 110, 52);
    g.lineStyle(2, 0xe5676b, 1).strokeRect(r - 120, this.qy - 26, 110, 52);
    this.dlqText = crisp(this.add.text(r - 65, this.qy, 'DLQ 0', TXT(14, FEEDBACK.wrong))).setOrigin(0.5);
    // The bin is a button too: tap it to send the front message there.
    this.add
      .zone(r - 65, this.qy, 110, 52)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        const f = this.front();
        if (f) this.decide(f, true);
      });
    this.input.on('drag', (_p: Phaser.Input.Pointer, o: Phaser.GameObjects.GameObject, x: number, y: number) => {
      if (this.live.some((e) => e.t === o)) (o as Phaser.GameObjects.Text).setPosition(x, y);
    });
    this.time.addEvent({ delay: 120, loop: true, callback: () => this.work() });
    this.scheduleWave();
  }

  /** The message nearest the worker. */
  private front() {
    return this.live.reduce<Live | undefined>((a, b) => (!a || b.t.x > a.t.x ? b : a), undefined);
  }

  /** Bursts: a few quiet messages, then a rush that a single worker can't keep up with. */
  private scheduleWave() {
    if (this.over) return;
    this.waves++;
    const burst = this.waves % 3 === 0;
    const n = burst ? 6 + Math.min(4, this.waves) : 2;
    for (let i = 0; i < n; i++) this.time.delayedCall(pace(i * (burst ? 260 : 900)), () => !this.over && this.spawn(Math.random() < 0.15 + Math.min(0.1, this.waves * 0.01)));
    this.time.delayedCall(pace(burst ? 4200 : 2600), () => this.scheduleWave());
  }

  private spawn(poison: boolean) {
    const pool = poison ? QUEUE.poison : QUEUE.messages;
    const label = pool[Math.floor(Math.random() * pool.length)];
    // Two rows on the belt, so a burst's messages sit side by side instead of on top of each other.
    const t = crisp(this.add.text(-10, this.beltY + (this.spawned++ % 2 ? 10 : -10), label, { ...TXT(13, poison ? '#fecaca' : '#e2e8f0'), backgroundColor: poison ? '#7f1d1dee' : '#0f172aee', padding: { x: 5, y: 2 } }))
      .setOrigin(1, 0.5)
      .setDepth(20)
      .setInteractive({ useHandCursor: true, draggable: true });
    const tw = this.tweens.add({
      targets: t,
      x: this.beltEnd,
      duration: pace(4200 - Math.min(1500, this.waves * 60)),
      onComplete: () => this.arrive(t, poison),
    });
    const entry: Live = { t, poison, tw };
    this.live.push(entry);
    // A tap queues it; a drag that ends on the DLQ bin sends it there (Phaser starts a drag on press).
    t.on('dragstart', () => tw.pause());
    t.on('dragend', (p: Phaser.Input.Pointer) => {
      if (!this.live.includes(entry)) return;
      this.decide(entry, this.dlqZone.contains(p.x, p.y));
    });
  }

  /** The player's call on a message: the queue, or the dead-letter queue. */
  private decide(e: Live, toDlq: boolean) {
    if (this.over || !this.live.includes(e)) return;
    e.tw.stop();
    this.live = this.live.filter((x) => x !== e);
    const { t, poison } = e;
    t.disableInteractive();
    if (toDlq && poison) {
      this.hit();
      this.dlq++;
      this.dlqText?.setText(`DLQ ${this.dlq}`);
      this.addScore(POINTS.queue.dlq);
      this.floater(this.dlqZone.centerX, this.qy - 40, '✓ to the DLQ', FEEDBACK.right);
      t.destroy();
    } else if (toDlq) {
      this.wrong();
      this.addScore(POINTS.queue.wrong);
      this.floater(this.dlqZone.centerX, this.qy - 40, '✗ a good message thrown away', FEEDBACK.wrong);
      t.destroy();
    } else if (poison) {
      this.wrong();
      this.addScore(POINTS.queue.wrong);
      this.floater(this.qx + (this.dlqZone.x - this.qx) / 2, this.qy - 40, '✗ poison fails over and over: drag it to the DLQ', FEEDBACK.wrong);
      t.destroy();
    } else {
      this.hit();
      this.enqueue(t);
    }
  }

  private enqueue(t: Phaser.GameObjects.Text) {
    this.queued.push(t);
    this.layoutQueue();
    if (this.queued.length > 12) {
      // A queue holds a lot, but a round's tray holds 12: the oldest waits too long here.
      const old = this.queued.shift()!;
      this.addScore(POINTS.queue.overflow, 'soft');
      old.destroy();
    }
  }

  private layoutQueue() {
    this.queued.forEach((q, i) => {
      const x = this.qx + 4 + i * 2;
      q.setOrigin(0, 0.5);
      if (reducedMotion()) q.setPosition(x, this.qy);
      else this.tweens.add({ targets: q, x, y: this.qy, duration: 160 });
      q.setDepth(10 + i);
    });
  }

  private arrive(t: Phaser.GameObjects.Text, poison: boolean) {
    this.live = this.live.filter((x) => x.t !== t);
    if (this.over) return t.destroy();
    if (poison) {
      this.wrong();
      this.addScore(POINTS.queue.poisoned, 'soft');
      this.floater(t.x - 60, this.beltY - 30, 'poison: fails forever', FEEDBACK.wrong);
    } else if (this.time.now < this.busyUntil) {
      this.addScore(POINTS.queue.lost, 'soft');
      this.floater(t.x - 60, this.beltY - 30, 'worker busy: lost!', FEEDBACK.wrong);
      if (!reducedMotion()) this.cameras.main.shake(90, 0.003);
    } else {
      this.busyUntil = this.time.now + pace(WORK_MS);
      this.addScore(POINTS.queue.direct, 'none');
    }
    t.destroy();
  }

  /** A free worker pulls the oldest message from the queue. */
  private work() {
    if (this.over) return;
    const free = this.time.now >= this.busyUntil;
    this.worker?.setFillStyle(free ? 0x5db39e : 0xf0a63a);
    if (!free || !this.queued.length) return;
    const q = this.queued.shift()!;
    this.busyUntil = this.time.now + pace(WORK_MS);
    this.addScore(POINTS.queue.worked, 'none');
    q.destroy();
    this.layoutQueue();
  }

  protected lesson() {
    return this.dlq ? `${this.dlq} poison message${this.dlq === 1 ? '' : 's'} parked safely. ${QUEUE.lesson}` : QUEUE.lesson;
  }
}
