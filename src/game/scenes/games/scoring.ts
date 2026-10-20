// The mini-games' scoring rules (pure: no Phaser, no store), so tests can play a masher against an honest player.
// Mashing must not win: in every game where the player makes calls, a wrong call costs more than a right one pays, and a
// round below its game's accuracy floor (`minAccuracy` in shared/minigames.json) is no new best and pays fewer stars.
import json from '../../../../shared/minigames.json' with { type: 'json' };
import { comboMultiplier } from './combo';
import { CSS } from '../../theme';

const FLOORS = (json as unknown as { minAccuracy?: Record<string, number> }).minAccuracy ?? {};

/**
 * Right/wrong feedback text in the games: theme tokens (src/game/theme.ts), each at least 4.5:1 on the games' dark
 * grounds (tests/minigames.test.ts checks).
 */
export const FEEDBACK = { right: CSS.goodInk, wrong: CSS.badInk, note: CSS.infoInk, gold: CSS.goldHi } as const;

/** The dark pill behind an answer's verdict (MiniGame.verdict, as in the Dance Hall): FEEDBACK text on it reads at 4.5:1 or better. */
export const PILL = '#140d1ff2';
/** How long a verdict stays up, ms: long enough to read a reason. */
export const VERDICT_MS = 1500;

/**
 * Space in the action games (Shield Wall, Food Stall): one swing per cooldown (presses in between do nothing), and a
 * swing at nothing costs, so holding or mashing Space never beats reading the road.
 */
export const SWING = { cooldownMs: 350, blank: -3 } as const;
/** Is a press at `now` a swing, given the last swing at `last`? */
export const swingReady = (last: number, now: number) => now - last >= SWING.cooldownMs;

/** The accuracy (percent of right calls) a round needs for a new best and full stars; 0 = no floor. */
export const minAccuracy = (game: string) => FLOORS[game] ?? 0;

/** Points per call. Each game's `wrong` costs more than its `right` pays (before the combo); the Sorting Office's guess is one in four. */
export const POINTS = {
  /** Permission Gate: allow/deny right, wrong, and too slow (the queue at the gate doesn't wait). */
  iamgate: { right: 10, wrong: -15, slow: -5 },
  /** Red Team Range: flag a flaw, flag a fine request, let a flaw through, let a fine one pass. */
  redteam: { flag: 10, falseFlag: -15, missed: -8, passed: 2 },
  /**
   * Queue Juggler: a message the worker takes (from the queue or straight off the belt), poison to the DLQ, poison put
   * in the queue or a good message thrown away, poison reaching the worker, a message lost at a busy worker, the tray
   * overflowing.
   */
  queue: { worked: 4, direct: 3, dlq: 8, wrong: -12, poisoned: -6, lost: -5, overflow: -2 },
  /** Shield Wall: stop an L7 attack, block a real user, click a flood (Shield's job), an attack breaching, a user let in. */
  shield: { block: 10, blockedUser: -8, flood: -4, breach: -5, passed: 2 },
  /** Lambda Food Stall: a warm serve, a cold start, an order expiring, invoking with every chef busy (throttled). */
  lambda: { warm: 10, cold: 6, expired: -3, throttled: -3 },
  /**
   * DynamoDB Sorting Office: a parcel on the wrong shelf. Four shelves, so a guess is right one time in four: cycling
   * 1-2-3-4 on every parcel loses more on the wrong shelves than the right one pays (tests/minigames.test.ts).
   */
  sort: { wrong: -7 },
} as const;

export type Cue = 'player' | 'soft' | 'none';

/**
 * One score change, as MiniGame.addScore applies it: the player's own right answers build the combo and are multiplied
 * by it; any loss ends the combo. Returns the points actually added and the new streak.
 */
export function scoreStep(streak: number, n: number, cue: Cue): { n: number; streak: number } {
  if (cue === 'player' && n > 0) {
    const s = streak + 1;
    return { n: n * comboMultiplier(s), streak: s };
  }
  return { n, streak: n < 0 ? 0 : streak };
}

/** A whole round's score from its changes in order (no clamping: the true total). */
export function scoreRun(steps: { n: number; cue: Cue }[]) {
  let streak = 0;
  let score = 0;
  for (const s of steps) {
    const r = scoreStep(streak, s.n, s.cue);
    streak = r.streak;
    score += r.n;
  }
  return score;
}

export interface Gate {
  ok: boolean;
  /** Right calls, percent (100 with no calls at all). */
  pct: number;
  /** The floor, percent (0 = none). */
  need: number;
}

/** Did a round with `right` right calls and `wrong` wrong ones reach its game's floor? */
export function accuracyGate(game: string, right: number, wrong: number): Gate {
  const n = right + wrong;
  const pct = n ? Math.round((right / n) * 100) : 100;
  const need = minAccuracy(game);
  return { ok: pct >= need, pct, need };
}

/** Below the floor a round pays a third of its stars. */
export const gatedStars = (stars: number, gate: Gate) => (gate.ok ? stars : Math.floor(stars / 3));

/** The end card's reason, e.g. "Too many wrong calls: accuracy 40%, need 60%". */
export const gateLine = (gate: Gate, what = 'wrong calls', measure = 'accuracy') => `Too many ${what}: ${measure} ${gate.pct}%, need ${gate.need}%`;
