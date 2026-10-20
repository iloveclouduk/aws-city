import Phaser from 'phaser';
import { useCity } from '@/state/store';
import type { GameId } from '@/world/places';
import { sfx } from '../../audio';
import { keysBelongToUi } from '../../keys';
import { reducedMotion } from '../../motion';
import { EXPERT_STARS, expert, expertOpen, relaxed, setExpert } from '../../pace';

export { pace } from '../../pace';
import { crisp, TEXT_FONT } from '../../SpeechBubble';
import { syncClock } from './clock';
import { comboMultiplier, comboStepUp } from './combo';
import { countRound, FULL_ROUNDS_A_DAY, RELAXED_MIN_CALLS, roundStars, tooFewCalls } from '@/learning/gameStars';
import { HALF_ROUNDS_A_DAY } from '@/state/wallet';
import { growthLine, growthOf } from '@/state/growth';
import { onSceneEnd } from '../lifecycle';
import { weeklyChallenge, WEEKLY_BONUS } from '@/state/events';
import { bus } from '@/state/bus';
import { accuracyGate, gatedStars, gateLine, minAccuracy, PILL, scoreStep, VERDICT_MS } from './scoring';

export { FEEDBACK } from './scoring';

export const TXT = (size = 16, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: TEXT_FONT, fontSize: `${Math.round(size * 0.85)}px`, fontStyle: '800', color });

/** The panel palette (src/app/app.css tokens), so every game wears the same chrome as the UI. */
export const PAL = {
  bg: 0x140d1f,
  panel: 0x241a37,
  line: 0x4a3768,
  black: 0x000000,
  accent: 0xffb84d,
  accentInk: '#4a2e07',
  paper: 0xfffbeb,
  paperInk: '#1b1200',
  good: '#6fe3a3',
  bad: '#ff8a8a',
  muted: '#b6a7d9',
} as const;

const BAR_H = 34;

/**
 * Shared chrome for mini-games: a title bar with score and timer chips, a hint strip, a draining timer
 * bar, pixel buttons, and a paper end screen with the lesson, stars and best score.
 * Subclasses pass "Title — how to play" as the title.
 */
export abstract class MiniGame extends Phaser.Scene {
  protected score = 0;
  /** Right and wrong calls this round (`hit()` / `wrong()`): below the game's `minAccuracy` a round is no new best. */
  protected hits = 0;
  protected wrongs = 0;
  protected timeLeft = 0;
  /** The running score may go below 0 (Rush Hour's debt); the paid score never does. */
  protected allowDebt = false;
  /** Stars paid for finishing a round, however it went. */
  protected minStars = 0;
  /** How the end card names the floor: "Too many {wrongWord} — {accuracyWord} 40%, need 60%". */
  protected wrongWord = 'wrong calls';
  protected accuracyWord = 'accuracy';
  /** The hint strip's height: the "how to play" line wraps on a narrow panel. */
  private hintH = 22;
  protected over = false;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText?: Phaser.GameObjects.Text;
  private timeBar?: Phaser.GameObjects.Rectangle;
  private timerEvt?: Phaser.Time.TimerEvent;

  constructor(
    key: string,
    protected gameId: GameId,
    protected serviceId: string,
    protected title: string,
  ) {
    super(key);
  }

  protected abstract setup(): void;
  protected abstract lesson(): string;
  /** Seconds per round; 0 = no timer (round ends itself). */
  protected duration = 45;
  /** The clock is the game itself (Rush Hour's day): relaxed play slows it down instead of removing it. */
  protected clockIsTheGame = false;
  /** One game second, in ms: two real seconds in relaxed play when the clock is the game. */
  protected get tickMs() {
    return relaxed() && this.clockIsTheGame ? 2000 : 1000;
  }
  /** Relaxed play without a round clock: the player ends the round with Done. */
  private get untimed() {
    return relaxed() && !this.clockIsTheGame;
  }
  /** Top of the play area (below the title bar and hint strip). */
  protected get top() {
    return BAR_H + 2 + this.hintH;
  }

  /**
   * The play column: the view under the chrome, at most `maxW` wide and centred, so the full tab gets a composed
   * scene instead of one stretched across 1000 px. `contentH` is the height the game's layout wants: on a tall view
   * the spare room goes mostly below it (`y` is the column's top), on a short one the column starts at `top`.
   * Backgrounds still fill the whole canvas; only what the player reads and taps lives in the column.
   */
  protected column(contentH = 0, maxW = 760) {
    const { width: vw, height: vh } = this.scale;
    const w = Math.min(vw, maxW);
    const x = Math.round((vw - w) / 2);
    const room = vh - this.top;
    const y = this.top + Math.max(0, Math.round((room - contentH) * 0.4));
    return { x, y, w, r: x + w, cx: Math.round(x + w / 2), h: Math.min(room, Math.max(contentH, 0) || room), bottom: vh };
  }

  /** The hint strip's text style: wraps inside the view. */
  private hintStyle() {
    return { ...TXT(14, PAL.muted), wordWrap: { width: this.scale.width - 24 } };
  }

  private get how() {
    const how = this.title.split(' — ')[1];
    return how ? how.charAt(0).toUpperCase() + how.slice(1) : '';
  }

  create() {
    syncClock(this);
    this.score = 0;
    this.hits = 0;
    this.wrongs = 0;
    this.over = false;
    this.streak = 0;
    this.endCard = undefined;
    this.endShade = undefined;
    this.verdictText = undefined;
    // The last round's clock is gone with its scene: a round in relaxed play (no clock) must not tick a dead one.
    this.timeText = this.timeBar = this.timerEvt = undefined;
    this.timeLeft = this.duration;
    // Measure the hint before the game lays out its play area under it.
    if (this.how) {
      const probe = this.add.text(0, 0, this.how, this.hintStyle());
      this.hintH = Math.max(22, Math.ceil(probe.height) + 6);
      probe.destroy();
    } else this.hintH = 22;
    this.cameras.main.setBackgroundColor('#140d1f').setRoundPixels(true);
    this.setup();
    this.chrome();
    if (this.duration && !this.untimed) this.timerEvt = this.time.addEvent({ delay: this.tickMs, loop: true, callback: () => --this.timeLeft <= 0 && this.finish() });
    this.scale.on('resize', this.onResize, this);
    onSceneEnd(this, () => this.scale.off('resize', this.onResize, this));
  }

  private chrome() {
    const { width: w } = this.scale;
    const [name] = this.title.split(' — ');
    const how = this.how;
    this.add.rectangle(0, 0, w, BAR_H, PAL.bg, 0.94).setOrigin(0).setDepth(100);
    this.add.rectangle(0, BAR_H, w, 2, PAL.black).setOrigin(0).setDepth(100);
    const titled = crisp(this.add.text(12, BAR_H / 2, name, TXT(17, '#ffb84d'))).setOrigin(0, 0.5).setDepth(101);
    if (expert()) crisp(this.add.text(titled.x + titled.width + 8, BAR_H / 2, '⚡ Expert', { ...TXT(14, PAL.accentInk), backgroundColor: '#ffb84d', padding: { x: 6, y: 2 } })).setOrigin(0, 0.5).setDepth(101);
    if (how) {
      this.add.rectangle(0, BAR_H + 2, w, this.hintH, PAL.panel, 0.88).setOrigin(0).setDepth(100);
      crisp(this.add.text(12, BAR_H + 2 + this.hintH / 2, how, this.hintStyle())).setOrigin(0, 0.5).setDepth(101);
    }
    this.scoreText = this.chip(w - 12, '★ 0');
    if (this.duration && this.untimed) {
      const t = crisp(this.add.text(0, 0, '✓ Done', TXT(15, PAL.accentInk))).setOrigin(0.5);
      const right = this.scoreText.x - this.scoreText.width - 8;
      const bw = t.width + 16;
      const bg = this.add.rectangle(0, 0, bw, 22, PAL.accent).setStrokeStyle(2, PAL.black);
      this.add
        .container(right - bw / 2, BAR_H / 2, [bg, t])
        .setSize(bw, 22)
        .setDepth(101)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => (sfx('click'), this.finish()));
      this.input.keyboard?.on('keydown-ENTER', () => !keysBelongToUi(document.activeElement, this.game.canvas) && this.finish());
    } else if (this.duration) {
      this.timeText = this.chip(this.scoreText.x - this.scoreText.width - 8, `⏱ ${this.duration}`);
      this.timeBar = this.add.rectangle(0, BAR_H, w, 2, PAL.accent).setOrigin(0).setDepth(102);
    }
  }

  /** A right-aligned stat chip in the title bar. */
  private chip(right: number, text: string) {
    return crisp(this.add.text(right, BAR_H / 2, text, { ...TXT(16, '#ffffff'), backgroundColor: '#2d2144', padding: { x: 8, y: 3 } }))
      .setOrigin(1, 0.5)
      .setDepth(101);
  }

  /** A chunky pixel button (hard shadow, sinks when pressed). */
  protected pxButton(x: number, y: number, label: string, fn: () => void, fill: number = PAL.accent, ink: string = PAL.accentInk) {
    const t = crisp(this.add.text(0, 0, label, TXT(16, ink))).setOrigin(0.5);
    const bw = Math.max(64, t.width + 22);
    const bh = t.height + 12;
    const shadow = this.add.rectangle(0, 3, bw, bh, PAL.black);
    const face = this.add.rectangle(0, 0, bw, bh, fill).setStrokeStyle(2, PAL.black);
    const c = this.add.container(x, y, [shadow, face, t]).setSize(bw, bh + 3).setDepth(150);
    c.setInteractive({ useHandCursor: true })
      .on('pointerover', () => face.setAlpha(0.88))
      .on('pointerout', () => (face.setAlpha(1), face.setY(0), t.setY(0)))
      .on('pointerdown', () => {
        face.setY(3);
        t.setY(3);
        fn();
        sfx('click'); // after fn: skipped when the press already made its own sound
      })
      .on('pointerup', () => (face.setY(0), t.setY(0)));
    return c;
  }

  /** Keyboard play: `fn(key)` on each key press during the round, unless a UI control has focus (see keys.ts). */
  protected onKeys(fn: (key: string) => void) {
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.over || e.repeat || keysBelongToUi(document.activeElement, this.game.canvas)) return;
      fn(e.key);
    });
  }

  /**
   * Re-lay out by restarting, but never mid-round (a panel resize must not wipe the score and timer), and never once
   * the round is over: the end card (everything at depth 200 and up) moves to the new centre and keeps the result.
   */
  private onResize() {
    if (this.over) return this.recentreEndCard();
    const live = this.score !== 0 || this.timeLeft < this.duration;
    if (!live) this.scene.restart();
  }

  /** The end card (one container, centred on its middle) and its natural size, so a resize can move and fit it. */
  private endCard?: { c: Phaser.GameObjects.Container; w: number; h: number };

  /** Centres the end card and shrinks it to fit a short or narrow view (the 400 px side panel). */
  private recentreEndCard() {
    if (!this.endCard) return;
    const { width: w, height: h } = this.scale;
    this.endShade?.setSize(w, h);
    const { c, w: cw, h: ch } = this.endCard;
    c.setPosition(Math.round(w / 2), Math.round(h / 2)).setScale(Math.min(1, (h - 12) / (ch + 6), (w - 8) / cw));
  }

  private endShade?: Phaser.GameObjects.Rectangle;

  override update(_t: number, _dt: number) {
    this.scoreText?.setText(`★ ${this.score}`).setColor(this.score < 0 ? PAL.bad : '#ffffff');
    if (this.timeText) {
      const left = Math.max(0, this.timeLeft);
      this.timeText.setText(`⏱ ${left}`).setColor(left <= 10 ? PAL.bad : '#ffffff');
      this.timeBar?.setSize(this.scale.width * (left / this.duration), 2).setFillStyle(left <= 10 ? 0xff6b6b : PAL.accent);
    }
  }

  /**
   * `cue`: 'player' for the player's own press (full feedback), 'soft' for an outcome a timer decided
   * (quieter), 'none' for routine timer ticks. A 0 change makes no sound; call `miss()` for a wrong answer.
   */
  protected addScore(n: number, cue: 'player' | 'soft' | 'none' = 'player') {
    // The player's own right answers build a combo (src/game/scenes/games/combo.ts); any mistake ends it.
    const step = scoreStep(this.streak, n, cue);
    if (cue === 'player' && n > 0) {
      this.streak = step.streak;
      this.sparks();
      if (comboStepUp(this.streak)) this.comboFloat();
    } else if (n < 0) this.breakStreak(cue === 'player');
    n = step.n;
    this.score = this.allowDebt ? this.score + n : Math.max(0, this.score + n);
    if (n === 0 || cue === 'none') return;
    sfx(n > 0 ? 'correct' : 'wrong', cue === 'soft' ? { soft: true } : { own: true });
  }

  /** A right call (counts toward the round's accuracy). */
  protected hit() {
    this.hits++;
  }

  /** A wrong call, or a flaw let through (counts against the round's accuracy). */
  protected wrong() {
    this.wrongs++;
  }

  /** The player's answer was wrong but costs nothing (it still ends the combo). */
  protected miss() {
    this.breakStreak(true);
    sfx('wrong', { own: true });
  }

  /** Right answers in a row (the combo). */
  protected streak = 0;

  private breakStreak(shake: boolean) {
    this.streak = 0;
    if (shake && !reducedMotion()) this.cameras.main.shake(110, 0.0035);
  }

  /** "×2!" by the score chip when the combo steps up. */
  private comboFloat() {
    const x = (this.scoreText?.x ?? this.scale.width - 40) - (this.scoreText?.width ?? 40) / 2;
    this.floater(x, BAR_H + 34, `×${comboMultiplier(this.streak)} combo!`, '#ffd166');
  }

  /** A little burst of sparks where the player pressed (no textures: a few pixel squares, no tweens under reduced motion). */
  private sparks() {
    if (reducedMotion()) return;
    const p = this.input.activePointer;
    const x = p.x || this.scale.width / 2;
    const y = p.y || this.scale.height / 2;
    const colors = [0xffd166, 0x6fe3a3, 0xffb84d, 0xffffff];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
      const d = 18 + Math.random() * 14;
      const sq = this.add.rectangle(x, y, 3, 3, colors[i % colors.length]).setDepth(95);
      this.tweens.add({ targets: sq, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => sq.destroy() });
    }
  }

  protected floater(x: number, y: number, text: string, color: string) {
    const { width: w } = this.scale;
    const t = crisp(this.add.text(x, y, text, { ...TXT(16, color), stroke: '#140d1f', strokeThickness: 4, align: 'center', wordWrap: { width: Math.min(w - 24, 360) } })).setOrigin(0.5).setDepth(90);
    // Never cut at an edge: keep the whole floater inside the view.
    t.setX(Math.max(t.width / 2 + 6, Math.min(w - t.width / 2 - 6, x)));
    if (reducedMotion()) return void this.time.delayedCall(900, () => t.destroy());
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 900, ease: 'Stepped', easeParams: [6], onComplete: () => t.destroy() });
  }

  /** The verdict on screen now (one at a time: a new one replaces it). */
  private verdictText?: Phaser.GameObjects.Text;

  /**
   * An answer's verdict, as in the Dance Hall: FEEDBACK text (green/red by outcome) on a dark pill, held VERDICT_MS so
   * the reason can be read, then faded. One at a time; each game puts it where it never covers what the player reads.
   * `originY` 1 hangs it above `y`, 0 below it.
   */
  protected verdict(x: number, y: number, text: string, color: string, originY = 0.5) {
    this.verdictText?.destroy();
    const { width: w } = this.scale;
    const t = crisp(this.add.text(x, y, text, { ...TXT(16, color), align: 'center', backgroundColor: PILL, padding: { x: 10, y: 5 }, wordWrap: { width: Math.min(w - 32, 520) } }))
      .setOrigin(0.5, originY)
      .setDepth(95);
    // Never cut at an edge.
    t.setX(Phaser.Math.Clamp(x, t.width / 2 + 6, w - t.width / 2 - 6));
    this.verdictText = t;
    this.time.delayedCall(VERDICT_MS, () => {
      if (!t.active) return;
      if (reducedMotion()) t.destroy();
      else this.tweens.add({ targets: t, alpha: 0, duration: 250, onComplete: () => t.destroy() });
    });
    return t;
  }

  protected finish() {
    if (this.over) return;
    this.over = true;
    this.timerEvt?.remove();
    const s = useCity.getState();
    const best = s.progress.games?.[this.gameId]?.best ?? 0;
    // The paid score never goes below 0, though Rush Hour's running total may (its debt).
    const paid = Math.max(0, this.score);
    // Mashing must not win: below the game's accuracy floor a round is no new best and pays a third (src/game/scenes/games/scoring.ts).
    // Without a clock, Done after one right answer is no round: a game with an accuracy floor needs RELAXED_MIN_CALLS calls.
    const short = tooFewCalls(this.untimed, minAccuracy(this.gameId) > 0, this.hits + this.wrongs);
    const raw = accuracyGate(this.gameId, this.hits, this.wrongs);
    const gate = short ? { ...raw, ok: false } : raw;
    const newBest = gate.ok && paid > best;
    // Full stars for a new best or the first rounds of the day; half after that (src/learning/gameStars.ts).
    const weekly = weeklyChallenge().game === this.gameId;
    // The weekly challenge's game pays half as many stars again (src/state/events.ts).
    const base = Math.min(expert() ? 38 : 25, Math.round((paid / 10) * (expert() ? EXPERT_STARS : 1)));
    const roundsBefore = countRound(this.gameId);
    const xp = Math.max(this.minStars, gatedStars(Math.round(roundStars(base, roundsBefore, newBest) * (weekly ? WEEKLY_BONUS : 1)), gate));
    // Boards keep timed rounds only (relaxed play is excluded); a round below the floor records no score. A round that
    // scored pays City Coins too (store.recordGame, contract v2.14).
    const coins = s.recordGame(this.gameId, gate.ok ? paid : 0, { timed: !relaxed() });
    // Past the day's full-pay rounds (and no new best) a round pays half: say so kindly, once, on the card.
    const halved = !newBest && roundsBefore >= FULL_ROUNDS_A_DAY;
    if (xp > 0) s.addXp(this.serviceId, xp);
    // a round played counts toward Today and the streak (src/state/progress.ts)
    if (paid > 0) s.noteLearning('games');
    const { width: w, height: h } = this.scale;
    this.endShade = this.add.rectangle(0, 0, w, h, PAL.bg, 0.72).setOrigin(0).setDepth(200);
    // A paper card, like the flashcards: hard black border and shadow. Laid out top-down at its natural size, then
    // centred and shrunk to fit (recentreEndCard), so it fits the side panel too.
    const cw = Math.min(440, Math.max(300, w - 24));
    const c = this.add.container(0, 0).setDepth(201);
    const items: Phaser.GameObjects.GameObject[] = [];
    const text = (y: number, str: string, size: number, color: string, wrap = true) =>
      crisp(this.add.text(0, y, str, { ...TXT(size, color), align: 'center', ...(wrap ? { wordWrap: { width: cw - 40 } } : {}), lineSpacing: 2 })).setOrigin(0.5, 0);
    let y = 18;
    const title = text(y, newBest ? '🏆 New best!' : 'Round over', 18, '#92400e', false);
    items.push(title);
    y += title.height + 8;
    // No best yet and this round didn't reach the floor: say what sets one, never "best 0". Coins as a word: the coin
    // emoji draws as a grey ball on canvases without colour emoji.
    const bestNow = Math.max(best, gate.ok ? paid : 0);
    const bestText = bestNow > 0 || gate.ok ? `best ${bestNow}` : short ? `${RELAXED_MIN_CALLS} calls to set a best` : `pass at ${gate.need}% to set a best`;
    const score = text(y, `Score ${this.score}   ·   +${xp} ⭐${coins ? `  +${coins} coins` : ''}${weekly ? ' ⚡ weekly' : ''}   ·   ${bestText}`, 16, PAL.paperInk);
    items.push(score);
    y += score.height + 6;
    if (halved && gate.ok) {
      // Coins stop after the half-pay rounds (src/state/wallet.ts roundCoins); stars keep growing the building.
      const noCoins = !coins && roundsBefore >= FULL_ROUNDS_A_DAY + HALF_ROUNDS_A_DAY;
      const cap = text(
        y,
        noCoins
          ? 'No more coins from this game today: stars still grow the building. Full pay again tomorrow, or beat your best!'
          : `Half stars and coins after ${FULL_ROUNDS_A_DAY} rounds a day. Full pay again tomorrow, or beat your best!`,
        13,
        '#6b7280',
      );
      items.push(cap);
      y += cap.height + 6;
    }
    if (!gate.ok) {
      const why = text(y, short ? `Make at least ${RELAXED_MIN_CALLS} calls before Done to score a round` : gateLine(gate, this.wrongWord, this.accuracyWord), 14, '#991b1b');
      items.push(why);
      y += why.height + 6;
    }
    // The building this game grows, and how far (src/state/growth.ts): the reason to play another round.
    const g = growthOf(useCity.getState().progress, this.serviceId, useCity.getState().cityRegion);
    const grew = text(y, `🏗️ ${growthLine(g)}`, 14, '#374151');
    items.push(grew);
    y += grew.height + 8;
    const barW = Math.min(260, cw - 60);
    items.push(this.add.rectangle(0, y, barW, 8, 0x000000, 0.15), this.add.rectangle(-barW / 2, y, Math.max(4, barW * g.pct), 8, 0x16a34a).setOrigin(0, 0.5));
    y += 14;
    items.push(this.add.rectangle(0, y, cw - 40, 2, 0x000000, 0.12));
    y += 10;
    const lesson = crisp(this.add.text(0, y, this.lesson(), { ...TXT(14, '#374151'), fontStyle: '600', align: 'center', wordWrap: { width: cw - 40 }, lineSpacing: 2 })).setOrigin(0.5, 0);
    items.push(lesson);
    y += lesson.height + 16;
    const by = y + 14;
    const ch = by + 30;
    const leave = () => (setExpert(false), useCity.getState().setView({ name: 'city' }));
    const buttons: Phaser.GameObjects.Container[] = [];
    // The Expert round opens at building level 3: quicker, harder cards, half as many stars again.
    if (expertOpen(this.serviceId)) {
      const dx = Math.min(118, (cw - 40) / 3);
      buttons.push(this.pxButton(-dx, by, '↻ Again', () => (setExpert(false), this.scene.restart())));
      buttons.push(this.pxButton(0, by, '⚡ Expert', () => (setExpert(true), this.scene.restart()), 0xf472b6, PAL.paperInk));
      buttons.push(this.pxButton(dx, by, '← City', leave, 0x2d2144, '#ffffff'));
    } else {
      buttons.push(this.pxButton(-74, by, '↻ Play again', () => (setExpert(false), this.scene.restart())));
      buttons.push(this.pxButton(74, by, '← City', leave, 0x2d2144, '#ffffff'));
    }
    // This week's board for this game (src/ui/Leaderboard.tsx): a small link in the card's corner.
    const board = crisp(this.add.text(cw / 2 - 14, 14, '🏆 Board', { ...TXT(14, '#92400e'), backgroundColor: '#fde68a', padding: { x: 5, y: 2 } }))
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => bus.emit('openBoard', { board: this.gameId }));
    // The card's children sit relative to its middle.
    const shadow = this.add.rectangle(0, ch / 2 + 5, cw, ch, PAL.black);
    const card = this.add.rectangle(0, ch / 2, cw, ch, PAL.paper).setStrokeStyle(3, PAL.black);
    c.add([shadow, card, ...items, board, ...buttons]);
    for (const o of c.list as unknown as Phaser.GameObjects.Components.Transform[]) o.y -= ch / 2;
    this.endCard = { c, w: cw, h: ch };
    this.recentreEndCard();
    // A new best gets the fanfare; an ordinary round ends on a plain ding (the quest jingle means a finished quest).
    sfx(newBest ? 'levelup' : 'correct', { own: true });
  }
}
