import Phaser from 'phaser';
import { FEEDBACK, MiniGame, pace, TXT } from './MiniGame';
import { POINTS } from './scoring';
import { reducedMotion } from '../../motion';
import { crisp } from '../../SpeechBubble';
import { IAM_GATE } from '@/world/minigames';

/**
 * Permission Gate (IAM): a role's policy is pinned up; requests walk up to the gate one by one. Allow (A, or the left
 * button) only what a statement allows; Deny (D, or the right button) everything else, and anything an explicit Deny
 * names. Each answer says why; a new role (and policy) every few requests. A wrong call costs more than a right one
 * pays, so always pressing Deny doesn't win (src/game/scenes/games/scoring.ts).
 */
export class IamGateGame extends MiniGame {
  private wave = 0;
  private queue: { text: string; allow: boolean; why: string }[] = [];
  private card?: Phaser.GameObjects.Text;
  private current?: { text: string; allow: boolean; why: string };
  private policyText?: Phaser.GameObjects.Text;
  private roleText?: Phaser.GameObjects.Text;
  private right = 0;
  private timer?: Phaser.Time.TimerEvent;

  constructor() {
    super('game:iamgate', 'iamgate', 'iam', '🛂 Permission Gate — A or ← allows, D or → denies: only what the policy allows gets through');
  }

  protected setup() {
    this.wave = 0;
    this.right = 0;
    const { width: w, height: h } = this.scale;
    const g = this.add.graphics();
    g.fillStyle(0x161021, 1).fillRect(0, this.top, w, h - this.top);
    // Top-down in a centred column (MiniGame.column): the role and its policy (as tall as the longest one, so the
    // gate never moves between roles), then the gate with the request at it, then the two buttons.
    const cw = Math.min(w, 760);
    const policyStyle = { ...TXT(16, '#e2e8f0'), backgroundColor: '#0f172ae6', padding: { x: 10, y: 8 }, lineSpacing: 3, wordWrap: { width: Math.min(cw - 32, 560) } };
    const probe = this.add.text(0, 0, '', policyStyle);
    const policyH = Math.max(...IAM_GATE.waves.map((wv) => probe.setText(this.policyLines(wv.policy)).height));
    probe.destroy();
    const col = this.column(26 + policyH + 20 + 150 + 30);
    this.roleText = crisp(this.add.text(col.cx, col.y + 12, '', TXT(18, '#ffb84d'))).setOrigin(0.5);
    this.policyText = crisp(this.add.text(col.cx, col.y + 26, '', policyStyle)).setOrigin(0.5, 0);
    const gy = col.y + 26 + policyH + 20;
    this.cardAt = gy + 56;
    // The gate: two posts and a red-and-white boom under the request.
    const half = Math.min(200, col.w / 2 - 24);
    const boomY = this.cardAt + 46;
    g.fillStyle(0x475569, 1).fillRect(col.cx - half - 8, gy + 10, 12, boomY - gy + 6).fillRect(col.cx + half - 4, gy + 10, 12, boomY - gy + 6);
    g.fillStyle(0x000000, 1).fillRect(col.cx - half, boomY - 5, half * 2, 10);
    for (let x = col.cx - half, i = 0; x < col.cx + half; x += 24, i++) g.fillStyle(i % 2 ? 0xffffff : 0xdd344c, 1).fillRect(x + 1, boomY - 4, Math.min(24, col.cx + half - x) - 2, 8);
    const by = boomY + 50;
    this.pxButton(col.cx - 90, by, '✅ Allow (A)', () => this.answer(true), 0x5db39e);
    this.pxButton(col.cx + 90, by, '⛔ Deny (D)', () => this.answer(false), 0xe5676b);
    this.onKeys((k) => {
      if (k === 'a' || k === 'A' || k === 'ArrowLeft') this.answer(true);
      if (k === 'd' || k === 'D' || k === 'ArrowRight') this.answer(false);
    });
    this.nextWave();
  }

  private nextWave() {
    const wv = IAM_GATE.waves[this.wave % IAM_GATE.waves.length];
    this.wave++;
    this.roleText?.setText(`Role: ${wv.role}`);
    this.policyText?.setText(this.policyLines(wv.policy));
    this.queue = [...wv.requests].sort(() => Math.random() - 0.5);
    this.next();
  }

  private next() {
    if (this.over) return;
    if (!this.queue.length) return this.nextWave();
    this.current = this.queue.shift()!;
    const { width: w } = this.scale;
    this.card?.destroy();
    const y = this.cardAt;
    this.card = crisp(this.add.text(w / 2, y, this.current.text, { ...TXT(18, '#ffffff'), backgroundColor: '#2d2144', padding: { x: 12, y: 8 }, align: 'center', wordWrap: { width: Math.min(w - 40, 480) } })).setOrigin(0.5);
    if (!reducedMotion()) {
      this.card.setAlpha(0).setY(y - 20);
      this.tweens.add({ targets: this.card, alpha: 1, y, duration: 160 });
    }
    // Too slow counts as a wrong answer: the queue at the gate doesn't wait forever.
    this.timer?.remove();
    this.timer = this.time.delayedCall(pace(Math.max(2600, 5200 - this.wave * 400)), () => this.answer(undefined));
  }

  private answer(allow: boolean | undefined) {
    if (this.over || !this.current) return;
    this.timer?.remove();
    const c = this.current;
    this.current = undefined;
    // The verdict covers the boom, between the request card and the buttons: never on the next request.
    const x = this.scale.width / 2;
    const y = this.cardAt + 52;
    if (allow === c.allow) {
      this.right++;
      this.hit();
      this.addScore(POINTS.iamgate.right);
      this.verdict(x, y, `✓ ${c.why}`, FEEDBACK.right);
    } else {
      this.wrong();
      if (allow === undefined) this.addScore(POINTS.iamgate.slow, 'soft');
      else this.addScore(POINTS.iamgate.wrong);
      this.verdict(x, y, `✗ ${allow === undefined ? 'Too slow. ' : ''}${c.why}`, FEEDBACK.wrong);
    }
    this.time.delayedCall(pace(650), () => this.next());
  }

  /** The request card's middle: at the gate, under the tallest policy (setup). */
  private cardAt = 0;

  private policyLines(policy: string[]) {
    return ['Policy:', ...policy.map((s) => `• ${s}`)].join('\n');
  }

  protected lesson() {
    return `${this.right} right at the gate. ${IAM_GATE.lesson}`;
  }
}
