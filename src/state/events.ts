// The weekly challenge: one mini-game a week pays half as many stars again, the same for everyone (it's picked from
// the ISO week, so every surface and every player agree without asking a server). Pure; Home shows it, games pay it.
import { PLACES, type GameId } from '@/world/places';

/** ISO-8601 week of a local date, as "2026-W42" (the weekly challenge: the player's own week). */
export const isoWeek = (date: Date = new Date()): string => weekOf(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * ISO-8601 week of the UTC date, as "2026-W42": the leaderboards' week (server/src/social.ts `isoWeekUtc`). A game's
 * weekly timed best (`bestWeek`) uses it too, so a best set late on Sunday or early on Monday lands on the board it's
 * filed under, whatever the player's time zone.
 */
export const isoWeekUtc = (date: Date = new Date()): string => weekOf(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

function weekOf(year: number, month: number, date: number): string {
  const d = new Date(Date.UTC(year, month, date));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // the week's Thursday decides its year
  const y = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

/** Every game, in a fixed order (by the building that has it), so the rotation is stable. */
export const GAMES: { game: GameId; serviceId: string }[] = PLACES.filter((p) => p.game).map((p) => ({ game: p.game!, serviceId: p.serviceId }));
/** The weekly game pays this many times the usual stars. */
export const WEEKLY_BONUS = 1.5;

export function weeklyChallenge(week: string = isoWeek()) {
  const [y, w] = week.split('-W').map(Number);
  return GAMES[(y! * 53 + w!) % GAMES.length]!;
}
