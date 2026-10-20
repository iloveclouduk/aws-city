// Stars a mini-game round pays its building: full for the first few rounds of a game each day and for any new best,
// half after that, so the city grows from learning across the board (cards, drawings, games), not one game on repeat.
import { countDaily, deviceLedger, type LedgerStore } from './dailyLedger';
import { dayKey } from '@/state/progress';

export const FULL_ROUNDS_A_DAY = 3;

/**
 * Games without a clock (prefs.relaxed) end on Done, so in a game that counts right and wrong calls a round needs at
 * least this many calls to reach its accuracy floor: one right answer then Done is no round.
 */
export const RELAXED_MIN_CALLS = 6;
/** True when a relaxed (untimed) round of a game with an accuracy floor ended before RELAXED_MIN_CALLS calls. */
export const tooFewCalls = (untimed: boolean, hasFloor: boolean, calls: number) => untimed && hasFloor && calls < RELAXED_MIN_CALLS;

export const roundStars = (base: number, roundsToday: number, newBest: boolean) => (newBest || roundsToday < FULL_ROUNDS_A_DAY ? base : Math.ceil(base / 2));

/** S3 fishing: 3 stars a right bucket and 5 for a perfect round, paid once at the end under the same daily rule. */
export const fishingStars = (correct: number, perfect: boolean, roundsToday: number, newBest: boolean) =>
  roundStars(correct * 3 + (perfect ? 5 : 0), roundsToday, newBest);

/**
 * How many rounds of `game` were played before this one today (the player's local day); counts this one. Kept in the
 * daily ledger on this device, so a reload doesn't hand out three more full-star rounds.
 */
export const countRound = (game: string, day = dayKey(), store: LedgerStore = deviceLedger) => countDaily(`round:${game}`, day, store);
