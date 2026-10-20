// The gentle return note (plan round 3, Step 2): at most one positive line a day on Home, and only for a player who
// turned it on (prefs.returnNote, My City). It says what's waiting, never what was missed: no "you lost", no countdowns,
// nothing that decays. No browser notifications: it shows only when the player opens the city. Pure
// (tests/welcome.test.ts).
import type { Progress } from '@/backend/contract';
import { claimable, seasonFor } from './season';
import { lightsOf, lightsView } from './lights';
import { dueNow, openJobs } from './next';
import { COIN_PAY } from './wallet';

export interface ReturnInput {
  progress: Progress;
  region: string;
  /** Local day (YYYY-MM-DD). */
  today: string;
  /** The picked season road (prefs.road), else this month’s. */
  season?: string;
  /** City Clients is open (the ladder): a job can be named. */
  jobs?: boolean;
  now?: number;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * "Welcome back! 4 cards are ready · Lumen Bank's job pays 15🪙." Undefined when the player already learned today
 * (they're not returning) or there's nothing nice to say.
 */
export function returnNote(i: ReturnInput): string | undefined {
  const p = i.progress;
  const v = lightsView(lightsOf(p), i.today);
  if (v.tonight) return undefined;
  const parts: string[] = [];
  const due = dueNow(p, i.region, i.now).n;
  if (due > 0) parts.push(`${plural(due, 'card')} ${due === 1 ? 'is' : 'are'} ready`);
  const job = i.jobs ? openJobs(p, i.region, undefined, 1)[0] : undefined;
  if (job) parts.push(`${job.client}’s job pays ${COIN_PAY.job}🪙`);
  const season = i.season ?? seasonFor(i.today).id;
  const steps = claimable(p, season).length;
  if (steps) parts.push(`${plural(steps, 'season reward')} to claim`);
  if (v.dim > 0) parts.push('a learning day relights a window');
  if (!parts.length) return undefined;
  return `Welcome back! ${parts.slice(0, 2).join(' · ')}.`;
}

/** The note shows at most once a day: `lastShown` is the local day it last showed. */
export const noteDue = (lastShown: string | undefined, today: string) => lastShown !== today;
