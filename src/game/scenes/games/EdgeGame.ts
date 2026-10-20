import Phaser from 'phaser';
import { FEEDBACK, MiniGame, pace, TXT } from './MiniGame';
import { reducedMotion } from '../../motion';
import { crisp } from '../../SpeechBubble';
import { EDGE } from '@/world/minigames';
import { change, EDGE_RULES, expire, hitRatio, invalidate, isChanged, isPopular, newEdge, request, store, type EdgeState } from './edgeCache';
import { minAccuracy } from './scoring';

/**
 * Edge Cache (CloudFront): viewers (left) ask the edge location (the post office in the middle) for files. Its four
 * cache slots answer a fresh cached file at once (a hit); anything else is a slow trip to the origin (right). Click a
 * missed file in the feed to cache it: popular files are worth a slot. When a file changes at the origin, click its
 * slot to invalidate it, or viewers get the stale copy until its TTL runs out. Rules: src/game/scenes/games/edgeCache.ts.
 * The round's accuracy is the hit ratio itself (requests only: hit() / wrong()), so the end card and the lesson always
 * show one number; invalidations score points but aren't requests. Each miss shows how often its file was asked for,
 * popular ones marked 🔥, and a tip names the strategy a few seconds in.
 */
export class EdgeGame extends MiniGame {
  private s: EdgeState = newEdge([]);
  private feed: Phaser.GameObjects.Text[] = [];
  private boxes: Phaser.GameObjects.Text[] = [];
  private slotXY: { x: number; y: number }[] = [];
  private slotW = 0;
  /** A counter's top and bottom padding: its height is its share of the post office. */
  private slotPad = 6;
  private feedTop = 0;
  private feedRows = 2;
  private viewers: { x: number; y: number }[] = [];
  private edgeX = 0;
  private originX = 0;
  private diagY = 0;
  /** The packets' lane through the post office, under its sign. */
  private laneY = 0;
  private feedX = 12;
  private feedW = 0;
  private ratioBar?: Phaser.GameObjects.Rectangle;
  private ratioText?: Phaser.GameObjects.Text;
  private barW = 0;
  private feedHead?: Phaser.GameObjects.Text;

  constructor() {
    super('game:edge', 'edge', 'cloudfront', '🌍 Edge Cache — click a missed file to cache it; click a ⚠️ slot to invalidate a changed file');
    this.wrongWord = 'misses';
    this.accuracyWord = 'hit ratio';
  }

  protected setup() {
    this.s = newEdge(EDGE.files.map((f) => f.name));
    this.feed = [];
    this.boxes = [];
    const { width: w, height: h } = this.scale;
    const g = this.add.graphics();
    g.fillStyle(0x10172a, 1).fillRect(0, this.top, w, h - this.top);
    // Everything lives in a centred column (MiniGame.column), laid out top-down: the hit ratio, the picture, the
    // misses feed, then the legend right under it, so a tall view has no gap between the play and its key.
    const cw = Math.min(w, 760);
    const legend = crisp(
      this.add.text(w / 2, 0, 'Hit = fast and cheap · miss = a trip to the origin · ⚠️ changed file = invalidate its slot', {
        ...TXT(13, '#cbd5e1'),
        backgroundColor: '#140d1fcc',
        padding: { x: 6, y: 2 },
        align: 'center',
        wordWrap: { width: cw - 24 },
      }),
    )
      .setOrigin(0.5, 0)
      .setDepth(5);
    // The picture and the feed share what the ratio row (24), the gaps (44 + 10 + 6) and the legend leave.
    const avail = h - this.top - 84 - legend.height;
    const diagH = Phaser.Math.Clamp(Math.round(avail * 0.5), 100, 210);
    this.feedRows = Phaser.Math.Clamp(Math.floor((avail - diagH) / 22), 2, 6);
    const col = this.column(24 + diagH + 44 + this.feedRows * 22 + 10 + legend.height + 6);

    // The live hit ratio, with a tick at the floor a round needs (shared/minigames.json minAccuracy).
    const ry = col.y + 12;
    this.ratioText = crisp(this.add.text(col.x + 12, ry, 'Hit ratio –', TXT(13, '#e2e8f0'))).setOrigin(0, 0.5);
    const bx = this.ratioText.x + 104;
    this.barW = Math.max(60, col.r - bx - 14);
    this.add.rectangle(bx, ry, this.barW, 10, 0x1e293b).setOrigin(0, 0.5).setStrokeStyle(1, 0x334155);
    this.ratioBar = this.add.rectangle(bx, ry, 0, 10, 0x5db39e).setOrigin(0, 0.5);
    const floor = minAccuracy('edge') / 100;
    if (floor) this.add.rectangle(bx + this.barW * floor, ry, 2, 16, 0xffc233);

    // The picture: viewers on the left, the edge location's post office in the middle, the origin on the right.
    // Packets run along a lane under the post office's sign, never over its title or its slots.
    this.diagY = col.y + 24;
    this.laneY = this.diagY + 30;
    this.viewers = [0, 1, 2].map((i) => ({ x: col.x + 22, y: this.diagY + 8 + ((i + 0.5) * (diagH - 8)) / 3 }));
    for (const v of this.viewers) {
      g.fillStyle(0x93c5fd, 1).fillCircle(v.x, v.y - 7, 6);
      g.fillStyle(0x3b82f6, 1).fillRoundedRect(v.x - 9, v.y, 18, 10, 4);
    }
    crisp(this.add.text(col.x + 22, this.diagY + diagH + 4, 'viewers', TXT(12, '#93c5fd'))).setOrigin(0.5, 0);
    const ow = 52;
    this.originX = col.r - 10 - ow / 2;
    const oy = this.laneY - 8;
    g.fillStyle(0x000000, 1).fillRect(this.originX - ow / 2 - 2, oy - 2, ow + 4, 64);
    g.fillStyle(0x7c2d12, 1).fillRect(this.originX - ow / 2, oy, ow, 60);
    for (let k = 0; k < 4; k++) {
      g.fillStyle(0x1f2937, 1).fillRect(this.originX - ow / 2 + 6, oy + 6 + k * 13, ow - 12, 8);
      g.fillStyle(0x6fe3a3, 1).fillRect(this.originX + ow / 2 - 12, oy + 8 + k * 13, 3, 3);
    }
    crisp(this.add.text(this.originX, oy + 64, 'origin', TXT(12, '#fdba74'))).setOrigin(0.5, 0);
    const ex0 = col.x + 46;
    const ex1 = this.originX - ow / 2 - 14;
    this.edgeX = (ex0 + ex1) / 2;
    // The post office: a sign band with its name, the packet lane, and the slots as its counters.
    g.fillStyle(0x000000, 1).fillRect(ex0 - 2, this.diagY - 2, ex1 - ex0 + 4, diagH + 4);
    g.fillStyle(0x4c1d95, 1).fillRect(ex0, this.diagY, ex1 - ex0, diagH);
    g.fillStyle(0x8c4fff, 1).fillRect(ex0, this.diagY, ex1 - ex0, 22);
    g.fillStyle(0x3b1578, 1).fillRect(ex0 + 6, this.laneY - 1, ex1 - ex0 - 12, 2);
    crisp(this.add.text(this.edgeX, this.diagY + 11, 'Edge location: 4 cache slots', TXT(13, '#ffffff'))).setOrigin(0.5);
    const inner = ex1 - ex0 - 12;
    const cols = inner >= 330 ? 4 : 2;
    const rows = 4 / cols;
    this.slotW = Math.floor(inner / cols);
    const slotTop = this.laneY + 8;
    const slotH = (this.diagY + diagH - 4 - slotTop) / rows;
    // Each counter fills its share of the post office (a tall view gets tall counters, not empty purple).
    this.slotPad = Math.max(6, Math.floor((slotH - 12 - 14) / 2));
    this.slotXY = Array.from({ length: EDGE_RULES.slots }, (_, i) => ({ x: ex0 + 6 + (i % cols) * this.slotW + this.slotW / 2, y: slotTop + (Math.floor(i / cols) + 0.5) * slotH }));
    for (let i = 0; i < EDGE_RULES.slots; i++) this.drawSlot(i);

    this.feedX = col.x + 12;
    this.feedW = col.w - 24;
    this.feedTop = this.diagY + diagH + 44;
    this.feedHead = crisp(this.add.text(this.feedX, this.feedTop - 4, 'Misses (click a file to cache it):', { ...TXT(13, '#93c5fd'), wordWrap: { width: this.feedW } })).setOrigin(0, 1);
    legend.setY(this.feedTop + this.feedRows * 22 + 10);
    this.time.addEvent({ delay: pace(650), loop: true, callback: () => this.request() });
    this.time.addEvent({ delay: pace(EDGE_RULES.changeMs), loop: true, callback: () => this.change() });
    // A few seconds in, the strategy in one line, in the feed's heading where the player is already looking.
    this.time.delayedCall(EDGE_RULES.tipMs, () => {
      if (this.over) return;
      const low = hitRatio(this.s) < minAccuracy('edge');
      this.feedHead?.setText(low ? 'Tip: cache the 🔥 files: they’re asked for most' : 'Misses: keep the 🔥 files cached').setColor(FEEDBACK.gold);
    });
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.expire() });
  }

  /** One counter per slot: the cached file (⚠️ once it changed at the origin; tap to invalidate), or "(empty)". */
  private drawSlot(i: number) {
    const c = this.s.slots[i];
    const p = this.slotXY[i];
    this.boxes[i]?.destroy();
    const changed = c && isChanged(this.s, c);
    const box = crisp(
      this.add.text(p.x, p.y, c ? `${c.name}${changed ? ' ⚠️' : ''}` : '(empty)', {
        ...TXT(13, c ? '#ffffff' : '#94a3b8'),
        backgroundColor: changed ? '#92400e' : c ? '#2e1065' : '#1e293b',
        padding: { x: 4, y: this.slotPad },
        align: 'center',
        fixedWidth: this.slotW - 8,
      }),
    ).setOrigin(0.5);
    if (c) box.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.invalidate(i));
    this.boxes[i] = box;
  }

  private pickFile() {
    const total = EDGE.files.reduce((n, f) => n + f.weight, 0);
    let r = Math.random() * total;
    for (const f of EDGE.files) if ((r -= f.weight) < 0) return f.name;
    return EDGE.files[0].name;
  }

  /** A packet dot from a viewer to the edge (and on to the origin on a miss). */
  private packet(miss: boolean) {
    if (reducedMotion()) return;
    const v = this.viewers[Math.floor(Math.random() * this.viewers.length)];
    const dot = this.add.circle(v.x + 10, v.y, 3, miss ? 0xffb84d : 0x6fe3a3).setDepth(4);
    const lane = this.laneY;
    this.tweens.chain({
      targets: dot,
      tweens: miss
        ? [
            { x: this.edgeX, y: lane, duration: 200 },
            { x: this.originX, duration: 380 },
            { x: v.x + 10, y: v.y, duration: 420 },
          ]
        : [
            { x: this.edgeX, y: lane, duration: 200 },
            { x: v.x + 10, y: v.y, duration: 160 },
          ],
      onComplete: () => dot.destroy(),
    });
  }

  private request() {
    if (this.over) return;
    const name = this.pickFile();
    const city = EDGE.cities[Math.floor(Math.random() * EDGE.cities.length)];
    const r = request(this.s, name, this.time.now);
    this.packet(r === 'miss');
    const i = this.s.slots.findIndex((c) => c?.name === name);
    if (r === 'stale') {
      this.wrong();
      this.addScore(EDGE_RULES.stale, 'soft');
      this.floater(this.boxes[i].x, this.boxes[i].y + 20, `✗ stale ${name}!`, FEEDBACK.wrong);
    } else if (r === 'hit') {
      this.hit();
      this.addScore(EDGE_RULES.hit, 'none');
      this.floater(this.boxes[i].x, this.boxes[i].y + 20, 'hit', FEEDBACK.right);
    } else {
      this.wrong();
      this.addScore(EDGE_RULES.miss, 'none');
      this.addFeed(city, name);
    }
    this.showRatio();
  }

  /** A miss lands in the feed: the player may cache it now. */
  private addFeed(city: string, name: string) {
    // The first free row; a full feed drops its oldest line.
    const used = new Set(this.feed.map((f) => Math.round((f.y - this.feedTop) / 22)));
    let row = [...Array(this.feedRows).keys()].find((r) => !used.has(r));
    if (row === undefined) {
      const old = this.feed.shift()!;
      row = Math.round((old.y - this.feedTop) / 22);
      old.destroy();
    }
    // Each miss shows the file's heat: how often it's been asked for, 🔥 for the most popular (worth a slot).
    const n = this.s.asked.get(name) ?? 1;
    const hot = isPopular(this.s, name);
    const t = crisp(
      this.add.text(this.feedX, this.feedTop + row * 22, `${hot ? '🔥 ' : ''}${city} → ${name} · asked ${n}×`, {
        ...TXT(13, hot ? FEEDBACK.gold : '#e2e8f0'),
        backgroundColor: '#0f172ae6',
        padding: { x: 5, y: 2 },
        wordWrap: { width: this.feedW },
      }),
    ).setInteractive({ useHandCursor: true });
    this.feed.push(t);
    t.once('pointerdown', () => this.store(name, t));
    this.time.delayedCall(pace(EDGE_RULES.feedMs), () => {
      this.feed = this.feed.filter((x) => x !== t);
      t.destroy();
    });
  }

  private showRatio() {
    const pct = hitRatio(this.s);
    this.ratioText?.setText(`Hit ratio ${pct}%`);
    this.ratioBar?.setSize((this.barW * pct) / 100, 10).setFillStyle(pct >= minAccuracy('edge') ? 0x5db39e : 0xe5676b);
  }

  /** Caching pays nothing by itself: the hits it brings do. */
  private store(name: string, from: Phaser.GameObjects.Text) {
    if (this.over) return;
    from.destroy();
    const i = store(this.s, name, this.time.now, pace(EDGE_RULES.ttlMs));
    if (i < 0) return;
    this.drawSlot(i);
    this.floater(this.boxes[i].x, this.boxes[i].y - 18, `cached ${name}`, FEEDBACK.note);
  }

  private change() {
    if (this.over) return;
    const cached = this.s.slots.filter((c) => !!c);
    if (!cached.length) return;
    const c = cached[Math.floor(Math.random() * cached.length)]!;
    change(this.s, c.name);
    const i = this.s.slots.indexOf(c);
    this.drawSlot(i);
    this.floater(this.boxes[i].x, this.boxes[i].y - 22, `${c.name} changed at the origin!`, FEEDBACK.gold);
  }

  private invalidate(i: number) {
    if (this.over) return;
    const b = this.boxes[i];
    const r = invalidate(this.s, i);
    if (!r) return;
    // Invalidations score, but they aren't requests: the round's accuracy stays the hit ratio.
    if (r === 'right') {
      this.addScore(EDGE_RULES.invalidate);
      this.floater(b.x, b.y + 20, '✓ invalidated', FEEDBACK.right);
    } else {
      this.addScore(EDGE_RULES.wrongInvalidate);
      this.floater(b.x, b.y + 20, '✗ it was still fresh', FEEDBACK.wrong);
    }
    this.drawSlot(i);
    this.showRatio();
  }

  /** A cached copy past its TTL is dropped (the next request goes back to the origin and gets the new version). */
  private expire() {
    for (const i of expire(this.s, this.time.now)) this.drawSlot(i);
  }

  protected lesson() {
    return `Cache hit ratio ${hitRatio(this.s)}%${this.s.stale ? `, ${this.s.stale} stale` : ''}. ${EDGE.lesson}`;
  }
}
