import Phaser from 'phaser';
import { FEEDBACK, MiniGame, pace, TXT } from './MiniGame';
import { POINTS } from './scoring';
import { freeLane } from './lanes';
import { reducedMotion } from '../../motion';
import { crisp } from '../../SpeechBubble';
import { useCity } from '@/state/store';
import { REDTEAM, tierFor, type Flaw, type RedTeamRequest } from '@/world/minigames';

/**
 * Red Team Range (AWS Security Agent): a penetration test of *your own* app. Requests from your app's log slide across
 * the range; flag the ones that show a security flaw (another customer's invoice, a token in the URL, a query that
 * breaks out of its quotes) before they reach the end, and let the fine ones pass. Each flag names the flaw; the end
 * card says how to fix the ones you found. The city never sends traffic anywhere: it's all on the screen. Every request
 * looks alike until it's read, and a false flag costs more than a real one pays, so flagging everything doesn't win.
 */
export class RedTeamGame extends MiniGame {
  private pool: RedTeamRequest[] = [];
  private found: Partial<Record<Flaw, number>> = {};
  private live: Phaser.GameObjects.Text[] = [];
  /** Which lanes hold a live request (one each, src/game/scenes/games/lanes.ts). */
  private busy: boolean[] = [];
  private dealt = 0;
  private laneTop = 0;
  private laneH = 0;
  /** The range's left (the app) and right edges. */
  private range = { x: 0, r: 0 };

  constructor() {
    super('game:redteam', 'redteam', 'securityagent', '🎯 Red Team Range — read each request: click (or Space) the ones with a flaw; let fine ones pass');
  }

  protected setup() {
    this.live = [];
    this.busy = [false, false, false, false, false];
    this.found = {};
    this.dealt = 0;
    this.onKeys((k) => (k === ' ' || k.startsWith('Arrow')) && this.flagNearest());
    const { width: w, height: h } = this.scale;
    const cw = Math.min(w, 760);
    const legend = crisp(this.add.text(w / 2, 0, '🚩 a flaw: click it (Space: the one nearest the app)   ✅ fine: let it pass', { ...TXT(14, '#cbd5e1'), backgroundColor: '#140d1fcc', padding: { x: 6, y: 2 }, align: 'center', wordWrap: { width: cw - 24 } }))
      .setOrigin(0.5, 0)
      .setDepth(5);
    // Five lanes, each tall enough for a wrapped line but no taller (a tall tab doesn't stretch them), in a centred
    // column (MiniGame.column) with the legend right under them.
    // The strip above the lanes (34 px) holds "your app" and the verdicts, so a verdict never covers a request.
    this.laneH = Phaser.Math.Clamp(Math.floor((h - this.top - 34 - 12 - legend.height) / 5), 18, 58);
    const col = this.column(34 + this.laneH * 5 + 12 + legend.height);
    this.range = { x: col.x, r: col.r };
    this.laneTop = col.y + 34;
    const { laneTop: y0, laneH: lh } = this;
    legend.setY(y0 + lh * 5 + 10);
    const g = this.add.graphics();
    // A test range at dusk: lanes of log lines run right to left into the app.
    g.fillStyle(0x161021, 1).fillRect(0, this.top, w, h - this.top);
    for (let i = 0; i < 5; i++) g.fillStyle(i % 2 ? 0x1d1530 : 0x221938, 1).fillRect(col.x, y0 + i * lh, col.w, lh);
    g.fillStyle(0xdd344c, 1).fillRect(col.x, y0, 70, lh * 5);
    for (let y = y0 + 6; y < y0 + lh * 5 - 4; y += 16) g.fillStyle(0xb02a3d, 1).fillRect(col.x + 6, y, 58, 3);
    crisp(this.add.text(col.x + 35, y0 - 12, 'your app', { ...TXT(14, '#fde2e6'), backgroundColor: '#140d1fcc', padding: { x: 5, y: 1 } })).setOrigin(0.5);
    const plays = useCity.getState().progress.games?.redteam?.plays ?? 0;
    this.pool = REDTEAM.requests.filter((r) => r.tier <= tierFor(plays));
    this.scheduleSpawn();
  }

  private scheduleSpawn(ms = pace(Math.max(1100, 1900 - this.dealt * 40))) {
    if (this.over || !this.pool.length) return;
    this.time.delayedCall(ms, () => {
      if (this.over) return;
      // Every lane busy: this request waits a moment for one to clear.
      if (!this.spawn()) return this.scheduleSpawn(300);
      this.scheduleSpawn();
    });
  }

  /** Space or an arrow key: flag the request nearest the app, as a click would. */
  private flagNearest() {
    const t = this.live.reduce<Phaser.GameObjects.Text | undefined>((a, b) => (!a || b.x < a.x ? b : a), undefined);
    t?.emit('pointerdown');
  }

  /** A new request in a free lane; false when every lane is busy. */
  private spawn() {
    const { x: x0, r: x1 } = this.range;
    const lane = freeLane(this.busy);
    if (lane < 0) return false;
    const r = this.pool[Math.floor(Math.random() * this.pool.length)];
    this.dealt++;
    this.busy[lane] = true;
    const y = this.laneTop + (lane + 0.5) * this.laneH;
    const t = crisp(this.add.text(0, y, r.line, { ...TXT(14, '#e2e8f0'), fontFamily: 'monospace', backgroundColor: '#0f172ae6', padding: { x: 5, y: 2 } })).setOrigin(0, 0.5);
    // Spawn fully inside the view: a smaller font on a narrow panel, then wrapping if it's still too wide.
    const room = x1 - x0 - 84;
    if (t.width > room) t.setFontSize(10);
    if (t.width > room) t.setWordWrapWidth(room);
    t.setX(Math.max(x0 + 74, x1 - t.width - 6)).setInteractive({ useHandCursor: true });
    if (!reducedMotion()) {
      t.setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 200 });
    }
    this.live.push(t);
    t.once('destroy', () => {
      this.live = this.live.filter((x) => x !== t);
      this.busy[lane] = false;
    });
    const tw = this.tweens.add({
      targets: t,
      x: x0 + 74,
      duration: pace(7_500 + Math.random() * 1_500),
      onComplete: () => {
        if (this.over) return t.destroy();
        if (r.flaw) {
          this.wrong();
          this.addScore(POINTS.redteam.missed, 'soft');
          this.say(`✗ Missed: ${REDTEAM.flaws[r.flaw]?.name ?? r.flaw}`, FEEDBACK.wrong);
          if (!reducedMotion()) this.cameras.main.shake(100, 0.003);
        } else {
          this.hit();
          this.addScore(POINTS.redteam.passed, 'none');
        }
        t.destroy();
      },
    });
    t.on('pointerdown', () => {
      if (this.over) return;
      tw.stop();
      if (r.flaw) {
        this.hit();
        this.addScore(POINTS.redteam.flag);
        this.found[r.flaw] = (this.found[r.flaw] ?? 0) + 1;
        this.say(`✓ ${REDTEAM.flaws[r.flaw]?.name ?? r.flaw}`, FEEDBACK.right);
      } else {
        this.wrong();
        this.addScore(POINTS.redteam.falseFlag);
        this.say('✗ That one was fine', FEEDBACK.wrong);
      }
      t.destroy();
    });
    return true;
  }

  /** A verdict in the strip above the lanes, never on top of a request. */
  private say(text: string, color: string) {
    const { x: x0, r: x1 } = this.range;
    // Right of the "your app" tag, which shares the strip.
    this.verdict((x0 + 80 + x1) / 2, this.laneTop - 2, text, color, 1);
  }

  protected lesson() {
    const top = (Object.entries(this.found) as [Flaw, number][]).sort((a, b) => b[1] - a[1])[0];
    if (!top) return REDTEAM.lesson || 'A penetration test looks for flaws in your own app before an attacker does.';
    const f = REDTEAM.flaws[top[0]];
    const n = Object.values(this.found).reduce((a, x) => a + (x ?? 0), 0);
    return `You found ${n} flaw${n === 1 ? '' : 's'}. ${f?.name ?? top[0]}: ${f?.fix ?? ''}`;
  }
}
