// Today's goals and the To-do list as React sees them: one place, so Home (the shift or the To-do list) and the HUD's
// "To do 2/4" chip always agree. The rules are pure (src/state/progress.ts todayGoals, src/state/simple.ts buildTodo).
import { useEffect } from 'react';
import type { Progress } from '@/backend/contract';
import { weeklyChallenge } from '@/state/events';
import { bus } from '@/state/bus';
import { questsDone } from '@/state/ladder';
import { levelOf } from '@/state/mastery';
import { nextAction, openJobs, runNext } from '@/state/next';
import { currentStreak, dayKey, overtimeGoal, settleToday, todayGoals, type TodaySet } from '@/state/progress';
import { isDiscovered } from '@/state/selectors';
import { buildTodo, shows, todoProgress, type TodoTask } from '@/state/simple';
import { useCity } from '@/state/store';
import { PLACES, placeFor } from '@/world/places';
import { GAME_NAMES, readPref, TODAY_SET_KEY, writePref } from './logic';
import type { OpenTab } from './QuestLog';
import { useLadder } from './useLadder';

/**
 * The building whose game the Today game goal opens: this week's challenge if it's put up here (it pays ×1.5), else the
 * discovered building with a game at the lowest level (ties: the one played least).
 */
export function gameBuilding(p: Progress, region: string | undefined, weekly = weeklyChallenge().serviceId) {
  const open = PLACES.filter((pl) => pl.game && isDiscovered(p, pl.serviceId, region));
  if (open.some((pl) => pl.serviceId === weekly)) return weekly;
  const plays = (pl: (typeof open)[number]) => p.games?.[pl.game!]?.plays ?? 0;
  return open.sort((a, b) => levelOf(p, a.serviceId, region) - levelOf(p, b.serviceId, region) || plays(a) - plays(b))[0]?.serviceId;
}

/** A game that always opens: the first building with one (its game works before the building is put up). */
export const ANY_GAME = PLACES.find((pl) => pl.game)?.serviceId ?? 's3';

/** Opens a building's mini-game straight away (the Today chip, the To-do list and the weekly challenge). */
export function playAt(serviceId: string) {
  const game = placeFor(serviceId)?.game;
  const s = useCity.getState();
  s.select(serviceId);
  if (!game) return;
  s.setView({ name: 'game', game });
  // The game takes the keys: the chip keeps no focus (Space would press it again), and the stage comes into view.
  (document.activeElement as HTMLElement | null)?.blur?.();
  const stage = document.querySelector('.stage');
  if (stage && typeof stage.scrollIntoView === 'function') stage.scrollIntoView({ block: 'nearest' });
}

/** The day's saved goal set (this device), if it's readable. */
function readTodaySet(): TodaySet | undefined {
  try {
    const v = JSON.parse(readPref(TODAY_SET_KEY) ?? 'null') as TodaySet | null;
    return v && typeof v.day === 'string' && Array.isArray(v.ids) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** City care shows: the ladder opened it (or it was released), and Simple mode isn't holding it back. */
export function useCare() {
  const ladder = useLadder();
  const released = useCity((s) => s.careReleased);
  const prefs = useCity((s) => s.prefs);
  const linked = useCity((s) => s.account.linked);
  const done = useCity((s) => questsDone(s.progress));
  return (ladder.care || released) && shows('care', prefs, { questsDone: done, linked });
}

/** Today's goals (a few cards, a puzzle, a game, a workshop step, a fix), the finish line fixed at the day's first look. */
export function useTodayGoals(care: boolean) {
  const ladder = useLadder();
  const log = useCity((s) => s.today);
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const streak = useCity((s) => s.progress.streak);
  const focus = useCity((s) => s.clientFocus);
  const day = dayKey();
  const game = gameBuilding(progress, region);
  // The order board feeds the shift: how many jobs it has open now (City Clients must be open).
  const jobs = ladder.clients ? openJobs(progress, region, focus, 5).length : 0;
  const open = { learn: ladder.tabs.has('learn'), puzzles: ladder.learnBuild, care, games: !!game, labs: ladder.places, designs: ladder.learnBuild, jobs };
  // The finish line is set at the day's first look; what opens later is a bonus (it never moves "2/3" to "2/4").
  const saved = readTodaySet();
  const set = settleToday(saved, day, todayGoals(log, day, open).flatMap((g) => (g.bonus ? [] : [g.id])));
  const setKey = set === saved ? '' : JSON.stringify(set);
  useEffect(() => {
    if (setKey) writePref(TODAY_SET_KEY, setKey);
  }, [setKey]);
  const goals = todayGoals(log, day, open, set.ids);
  return { goals, game, days: currentStreak(streak, day), overtime: overtimeGoal(log, day, open, goals) };
}

/** The To-do list (Simple mode's City tab and the HUD's chip): the tasks, and how many of today's goals are done. */
export function useTodo() {
  const care = useCare();
  const today = useTodayGoals(care);
  const ladder = useLadder();
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const clientFocus = useCity((s) => s.clientFocus);
  const next = nextAction({ progress, cityRegion: region, clientFocus }, { clients: ladder.clients });
  const jobs = ladder.clients ? openJobs(progress, region, clientFocus, 3) : [];
  const game = placeFor(today.game ?? ANY_GAME)?.game;
  const list = buildTodo({ next, goals: today.goals, jobs, gameName: game ? GAME_NAMES[game] : undefined });
  return { ...list, ...todoProgress(list), today, next, care };
}

/** Runs a task's "Do it": a plan through the next-action runner, or one of today's goals opened where it's done. */
export function runTodo(t: TodoTask, openTab: OpenTab, opts: { game?: string; openCare: () => void }) {
  if (t.run.kind === 'plan') return runNext(t.run.plan);
  switch (t.run.goal) {
    case 'cards':
      return openTab('cards');
    case 'puzzles':
      return openTab('arch');
    case 'designs':
      return openTab('sandbox');
    case 'jobs':
      return openTab('jobs');
    case 'games':
      return playAt(opts.game ?? ANY_GAME);
    case 'fixes':
      return opts.openCare();
    case 'labs':
      // a workshop step starts in the Workshop Studio (Town Square): its card opens right here in City
      useCity.getState().select('workshop');
      bus.emit('flyTo', { id: 'workshop' });
      return bus.emit('select', { id: 'workshop' });
  }
}
