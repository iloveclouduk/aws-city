import { agentName, useCity } from '@/state/store';
import { actionText, whereOf, nextAction, readyToUpgrade, shiftSummary, type NextAction } from '@/state/next';
import { weeklyChallenge } from '@/state/events';
import { questById, QUESTS } from '@/world/content';
import { taskById } from '@/world/clients';
import { placeFor, TIER_NAMES } from '@/world/places';
import { isDiscovered } from '@/state/selectors';
import type { Progress } from '@/backend/contract';
import { districtById, FEATURED_REQUESTS as REQUESTS } from '@/world/taxonomy';
import { ActivityFeed, AgentOffer, TaskCard } from './ActivityFeed';
import { AwsIcon } from './AwsIcon';
import { feel } from './feedback';
import { districtStyle } from './logic';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { bus } from '@/state/bus';
import { Portrait } from './Portrait';
import { CityCare } from './FindingCard';
import { CityHealth } from './CityHealth';
import { OrderBoard } from './clients/ClientsPanel';
import { QuestLog, Segments, type OpenTab } from './QuestLog';
import { Plain } from './Term';
import { useLadder, useLocked } from './useLadder';
import { questsDone } from '@/state/ladder';
import { coinsToday } from '@/state/wallet';
import { dayKey, todayDone, type OvertimeGoal, type TodayGoal } from '@/state/progress';
import { CERTS, certProgress } from '@/world/culture';
import { glowingNow, ReturnNote, SupplyDrop } from './Loops';
import { withCoins } from './icons';
import { doneLine, isSimple, type TodoTask } from '@/state/simple';
import { ANY_GAME, playAt, runTodo, useCare, useTodayGoals, useTodo } from './today';

export { gameBuilding } from './today';

/**
 * The City tab: today's shift on top (one big button that says exactly what it does, the order board, buildings ready
 * to upgrade, and how today is going), everything else folded under "More to do", then the places in the city
 * (`places`: App passes the Navigator, which reads the city's art and so stays out of this module's imports).
 */
export function Home({ openTab, places }: { openTab: OpenTab; places?: ReactNode }) {
  const ladder = useLadder();
  const care = useCare();
  // Simple mode (the default, src/state/simple.ts): one plain To-do list, then the places.
  const simple = useCity((s) => isSimple(s.prefs));
  // On a first run's world map the only thing to do is pick a Region (WorldIntro): the shift waits until the city opens.
  const choosing = useCity((s) => s.view.name === 'world' && !s.prefs.region);
  const more = useRef<HTMLDetailsElement>(null);
  const careFold = useRef<HTMLDetailsElement>(null);
  /** Today's "Fix something" opens City care (inside More to do) and brings it into view. */
  const openCare = () => {
    if (more.current) more.current.open = true;
    const el = careFold.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  if (choosing)
    return (
      <div className="home">
        <p className="home-wait">
          <span aria-hidden="true">🌍</span> Pick a glowing dot on the map to start your city. Your first job will be waiting here.
        </p>
      </div>
    );
  if (simple) return <SimpleHome openTab={openTab} care={care} places={ladder.places ? places : undefined} />;
  return (
    <div className="home">
      <Shift openTab={openTab} care={care} openCare={openCare} />
      <RunningTask />
      <details ref={more} className="more-fold">
        <summary className="label">More to do</summary>
        <MoreToDo openTab={openTab} care={care} careFold={careFold} openCare={openCare} />
      </details>
      {ladder.places && places && (
        <section className="city-places">
          <h4 className="label">Places</h4>
          {places}
        </section>
      )}
    </div>
  );
}

// ── Simple mode: the To-do list ────────────────────────────────────────────────

/** Where a task's button goes when it's another tab (its label says what happens; this says where). */
const TASK_WHERE: Partial<Record<TodayGoal['id'], string>> = { cards: 'Learn', puzzles: 'Learn', designs: 'Learn', jobs: 'Jobs' };
const taskWhere = (t: TodoTask) => (t.run.kind === 'plan' ? whereOf(t.run.plan) : TASK_WHERE[t.run.goal]);

/**
 * The City tab in Simple mode: what the player asked an agent (while it works), one plain To-do list (a box, one line
 * why, one button that says what happens), City care once a quest is done, then the places. Nothing else.
 */
function SimpleHome({ openTab, care, places }: { openTab: OpenTab; care: boolean; places?: ReactNode }) {
  const careFold = useRef<HTMLDetailsElement>(null);
  const openCare = () => {
    const el = careFold.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const todo = useTodo();
  const [showMore, setShowMore] = useState(false);
  const progress = useCity((s) => s.progress);
  const shift = useCity((s) => s.shift);
  const locked = useLocked();
  const day = dayKey();
  // The day is done when every row on the list is ticked (the "+N more" ones too): only then the shift pays.
  const summary = shiftSummary({ progress, shift }, day, { goals: { done: todo.done, of: todo.of }, coins: coinsToday(progress, day), overtime: todo.today.overtime });
  // The shift still pays its City Coins (and fills the season road, shown with Everything on) once a day.
  const grew = summary.buildings.map((b) => b.serviceId).join(',');
  useEffect(() => {
    if (!summary.done) return;
    useCity.getState().payShift();
    useCity.getState().fillSeason(grew ? grew.split(',') : []);
  }, [summary.done, day, grew]);
  // Simple hides AWS news and shows Deploy only when it's needed, so the next unlock it names is one it shows.
  const unlock = locked.filter((u) => u.area !== 'deploy' && u.area !== 'news').map((u) => (u.area === 'care' ? { ...u, how: 'Finish a quest' } : u))[0];
  const latest = useLatestTask();
  const taskUp = onShift(latest);
  const working = latest?.status === 'routing' || latest?.status === 'running';
  const rows = showMore ? [...todo.tasks, ...todo.more] : todo.tasks;
  const firstOpen = rows.findIndex((t) => !t.done);
  const run = (t: TodoTask) => {
    feel.tap();
    taskMovedOn();
    runTodo(t, openTab, { game: todo.today.game, openCare });
  };
  return (
    <div className="home simple">
      {/* What the player asked from the prompt bar: its card while it works, over the list. */}
      {taskUp && working && <TaskCard key={latest!.taskId} task={latest!} openTab={openTab} quiet />}
      <section className="todo" aria-labelledby="todo-title">
        <div className="todo-head">
          <h3 id="todo-title">To do</h3>
          {todo.of > 0 && (
            <span className="todo-count">
              {todo.done}/{todo.of} done
            </span>
          )}
        </div>
        {todo.of > 1 && (
          <div className="todo-bar" role="progressbar" aria-valuemin={0} aria-valuemax={todo.of} aria-valuenow={todo.done} aria-label="Today’s tasks done">
            <i style={{ width: `${Math.round((todo.done / todo.of) * 100)}%` }} />
          </div>
        )}
        {todo.allDone && (
          <p className="todo-done" role="status">
            <span aria-hidden="true">🎉</span> {doneLine(summary.cardsTomorrow)}
          </p>
        )}
        <ul className="todo-list" aria-label="To do">
          {rows.map((t, i) => (
            <TodoRow key={t.key} t={t} primary={i === firstOpen} onRun={run} />
          ))}
        </ul>
        {todo.more.length > 0 && !showMore && (
          <button className="btn tiny ghost todo-more" aria-expanded={false} data-done={todo.more.filter((t) => t.done).length} onClick={() => setShowMore(true)}>
            +{todo.more.length} more
            {todo.more.some((t) => !t.done) ? '' : ' (done)'}
          </button>
        )}
        {/* The day is done: the next thing, if they want more (not a row: the day stays done). It's Home's one filled
            button then, so there's always a next step. */}
        {todo.allDone && todo.extra && (
          <p className="todo-extra">
            <span>Want more?</span>{' '}
            <button className="btn small primary todo-go" title={todo.extra.action} onClick={() => run(todo.extra!)}>
              {todo.extra.action}
            </button>
          </p>
        )}
      </section>
      {/* Its result, under the list until they move on (quiet: the list holds the next step and the one filled button). */}
      {taskUp && !working && <TaskCard key={latest!.taskId} task={latest!} openTab={openTab} quiet />}
      {care && (
        <details ref={careFold} className="care-fold">
          <summary className="label">🩺 City care</summary>
          <CityCare />
        </details>
      )}
      {unlock && (
        <p className="coming-next" aria-label="Coming up next">
          <span aria-hidden="true">🔓</span> <b>Coming up next: {unlock.label}.</b> {unlock.how}.
        </p>
      )}
      {places && (
        <section className="city-places">
          <h4 className="label">Places</h4>
          {places}
        </section>
      )}
    </div>
  );
}

/** One row of the To-do list: a box, its name (and "2/5"), one line why and one button that says what happens. */
function TodoRow({ t, primary, onRun }: { t: TodoTask; primary: boolean; onRun: (t: TodoTask) => void }) {
  const where = taskWhere(t);
  return (
    <li className={`todo-row ${t.done ? 'done' : ''}`}>
      <span className={`todo-check ${t.done ? 'on' : ''}`} aria-hidden="true">
        {t.done ? '✓' : ''}
      </span>
      <span className="todo-text">
        <b>
          {t.title}
          {t.goal !== undefined && !t.done && (
            <span className="todo-of">
              {' '}
              {t.have}/{t.goal}
            </span>
          )}
          <span className="sr-only">{t.done ? ' (done)' : ''}</span>
        </b>
        {/* A ticked task folds to its name: what's left stands out. */}
        {!t.done && (
          <small className="todo-why">
            <Plain text={t.why} />
          </small>
        )}
        {!t.done && (
          <button className={`btn small todo-go ${primary ? 'primary' : ''}`} title={where ? `${t.action} (opens ${where})` : t.action} onClick={() => onRun(t)}>
            {t.action}
            {where && <small className="todo-where"> (opens {where})</small>}
          </button>
        )}
      </span>
    </li>
  );
}

// ── Today's shift ──────────────────────────────────────────────────────────────

function Shift({ openTab, care, openCare }: { openTab: OpenTab; care: boolean; openCare: () => void }) {
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const shift = useCity((s) => s.shift);
  const clientFocus = useCity((s) => s.clientFocus);
  const ladder = useLadder();
  const locked = useLocked();
  const day = dayKey();
  const today = useTodayGoals(care);
  const action = nextAction({ progress, cityRegion: region, clientFocus }, { clients: ladder.clients });
  const goals = todayDone(today.goals);
  const summary = shiftSummary({ progress, shift }, day, { goals, coins: coinsToday(progress, day), overtime: today.overtime });
  // A finished shift pays its City Coins once a day (wallet.shift remembers the day, across the panel and the tab).
  // v2.15: it also fills the season road once a day (the shift's buildings may add the theme bonus).
  const grew = summary.buildings.map((b) => b.serviceId).join(',');
  useEffect(() => {
    if (!summary.done) return;
    useCity.getState().payShift();
    useCity.getState().fillSeason(grew ? grew.split(',') : []);
  }, [summary.done, day, grew]);
  const lights = glowingNow(progress);
  const latest = useLatestTask();
  // A finished task's card holds the floor (its next step is the primary button); the shift's button waits, calm.
  const taskUp = onShift(latest) && latest!.status !== 'routing' && latest!.status !== 'running';
  // Not the building the big button already points at.
  const ready = readyToUpgrade(progress, region, 3).filter((r) => !('serviceId' in action && action.serviceId === r.serviceId));
  return (
    <section className="shift" aria-labelledby="shift-title">
      <div className="shift-head">
        <h3 id="shift-title">Today’s shift</h3>
        {goals.of > 0 && <Ring done={goals.done} of={goals.of} />}
        {lights.glowing > 0 && (
          <span className="muted small" title="City Lights: windows glowing for your learning days">
            💡 {lights.glowing}
          </span>
        )}
      </div>
      <ReturnNote jobs={ladder.clients} />
      {/* The day's own goals as chips until the shift is done (then its card says how it went); bonus goals wait in More to do. */}
      {!summary.done && <TodayChips goals={today.goals.filter((g) => !g.bonus)} openTab={openTab} game={today.game} openCare={openCare} />}
      {summary.done && (
        <section className="shift-done" aria-label="Shift done">
          <b>🎉 Shift done!</b>
          {summary.line && <span>{withCoins(summary.line)}</span>}
          <span className="muted small">{summary.tomorrow}</span>
        </section>
      )}
      <SupplyDrop shiftDone={summary.done} />
      {/* Done for the day, and still keen: one optional overtime goal, with a bonus crate of its own. */}
      {summary.overtime && <OvertimeChip goal={summary.overtime} openTab={openTab} game={today.game} />}
      {summary.overtimeDone && <SupplyDrop shiftDone overtime />}
      {/* A finished task's card holds the floor: its next step is this same action, so the shift's button waits. */}
      {taskUp ? <TaskCard key={latest!.taskId} task={latest!} openTab={openTab} /> : <NextButton action={action} calm={summary.done} />}
      {ladder.clients && <OrderBoard max={3} skip={action.kind === 'job' ? action.taskId : undefined} />}
      {ready.length > 0 && (
        <section className="ready" aria-label="Ready to upgrade">
          <h4 className="label">Ready to upgrade</h4>
          <ul>
            {ready.map((r) => (
              <li key={r.serviceId} className="ready-row">
                <AwsIcon serviceId={r.serviceId} size={20} />
                <span className="ready-text">
                  <b>{r.place}</b>
                  <small className="muted">
                    {r.reviews} {r.reviews === 1 ? 'review' : 'reviews'} to {r.nextName}
                  </small>
                </span>
                <button
                  className="btn tiny"
                  onClick={() => {
                    feel.tap();
                    useCity.getState().select(r.serviceId);
                    openTab('cards');
                  }}
                >
                  Open cards (Learn)
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* Only the next unlock, as a hint (no button: it comes in its own time, or via ⋯ → Peek at everything). */}
      {locked[0] && (
        <p className="coming-next" aria-label="Coming up next">
          <span aria-hidden="true">🔓</span> <b>Coming up next: {locked[0].label}.</b> {locked[0].how}.
        </p>
      )}
    </section>
  );
}

/** "2/3": today's goals as a small ring. */
function Ring({ done, of }: { done: number; of: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span className="ring" role="img" aria-label={`${done} of ${of} of today’s goals done`}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r={r} className="ring-track" />
        <circle cx="12" cy="12" r={r} className="ring-fill" strokeDasharray={`${(done / of) * c} ${c}`} transform="rotate(-90 12 12)" />
      </svg>
      <span className="ring-text">
        {done}/{of}
      </span>
    </span>
  );
}

/** Who speaks for the next action, and what they say (the button itself says what happens). */
function voiceOf(a: NextAction, p: Progress, helped?: string): { who: string; line: string; quest?: { title: string; at: number; of: number; color?: number } } {
  switch (a.kind) {
    case 'step': {
      const q = questById(a.questId)!;
      const st = p.quests?.[a.questId];
      const giver = q.steps.find((x) => x.kind === 'visit')?.serviceId ?? q.serviceIds[0];
      const self = a.step.kind === 'visit' && a.step.serviceId === giver && st?.step === 0;
      const line = self ? `Come and find me at ${placeFor(giver)?.place ?? 'my place'}. I’ll show you around.` : a.step.text;
      return { who: giver, line, quest: { title: q.title, at: st?.step ?? 0, of: q.steps.length, color: districtById(q.districtId)?.color } };
    }
    case 'quest': {
      const q = questById(a.questId)!;
      const firstTime = !Object.keys(p.quests ?? {}).length;
      const line = firstTime
        ? helped
          ? `${helped} sorted that for you. Want to learn how it works? “${q.title}” walks you through it in about five minutes.`
          : `New in town? “${q.title}” takes about five minutes and shows you how the city works.`
        : `Ready for more? “${q.title}” is next.`;
      return { who: 'concierge', line };
    }
    case 'review':
      return { who: a.serviceId, line: 'Some cards are back. They return right before you’d forget them.' };
    case 'upgrade':
      return { who: a.serviceId, line: `${placeFor(a.serviceId)?.place ?? a.serviceId} is nearly at its next level.` };
    case 'job': {
      const t = taskById(a.taskId);
      return { who: 'concierge', line: t ? `${a.label.replace(/^Do a job for /, '')} needs help: “${t.task.title}”. Kai walks to the ${t.task.station}.` : a.label };
    }
    case 'workshop':
      return { who: 'concierge', line: 'A hands-on workshop: practise each command, step by step.' };
    case 'build':
      return { who: 'concierge', line: 'A new building to put up: ask its agent to move in.' };
    case 'grow':
      return { who: a.serviceId, line: 'Every card you review grows this building a little.' };
    case 'tokens':
      return { who: 'concierge', line: 'Golden tokens hide on this city’s streets.' };
    case 'explore':
      return { who: 'concierge', line: 'Everything’s done for now. Have a walk round your city.' };
  }
}

/** The one big button: its label is exactly what happens, and it says when it opens another tab. */
function NextButton({ action, calm }: { action: NextAction; calm: boolean }) {
  const progress = useCity((s) => s.progress);
  const lastDone = useCity((s) => s.taskOrder.map((id) => s.tasks[id]).find((t) => t?.status === 'done')?.agentId);
  const v = voiceOf(action, progress, lastDone && agentName(lastDone));
  const where = whereOf(action);
  return (
    <section className={`next ${calm ? 'calm' : ''}`} style={districtStyle(v.quest?.color)} aria-label="Your next step">
      {v.quest && (
        <div className="next-head">
          <span className="eyebrow">{v.quest.title}</span>
          <Segments total={v.quest.of} at={v.quest.at} />
        </div>
      )}
      <div className="next-body">
        <Portrait id={v.who} size={32} />
        <p className="say">
          <b>{v.who === 'concierge' ? 'Connie' : agentName(v.who)}</b>
          <Plain text={v.line} />
        </p>
      </div>
      <button
        className={`btn wide next-go ${calm ? '' : 'primary'}`}
        title={actionText(action)}
        onClick={() => {
          feel.tap();
          action.run();
        }}
      >
        <span className="next-go-label">{calm ? `Keep going: ${action.label}` : action.label}</span>
        {where && <small className="next-go-where"> (opens {where})</small>}
      </button>
    </section>
  );
}

/**
 * The player's latest ask (tasks live in memory: this session's only) stays on the shift while it works and once it's
 * done, until the player moves on with the shift's own button; then it waits in More to do.
 */
let movedOn: string | undefined;
/** The player ran a next action (the shift's button or a task card's next step): the latest task's card steps aside. */
export function taskMovedOn() {
  movedOn = useCity.getState().taskOrder[0];
}
const useLatestTask = () => useCity((s) => (s.taskOrder[0] ? s.tasks[s.taskOrder[0]] : undefined));
/** The latest task is on the shift (so its result card's next step is the one primary button). */
const onShift = (t: { taskId: string; status: string } | undefined) => !!t && (t.status === 'routing' || t.status === 'running' || t.taskId !== movedOn);

function RunningTask() {
  const latest = useLatestTask();
  if (!latest || (latest.status !== 'routing' && latest.status !== 'running')) return null;
  return <TaskCard key={latest!.taskId} task={latest!} />;
}

// ── More to do ─────────────────────────────────────────────────────────────────

function MoreToDo({ openTab, care, careFold, openCare }: { openTab: OpenTab; care: boolean; careFold: RefObject<HTMLDetailsElement | null>; openCare: () => void }) {
  const asked = useCity((s) => s.taskOrder.length > 0);
  const latest = useLatestTask();
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const certGoal = useCity((s) => s.prefs.certGoal);
  const r = REQUESTS[0];
  const weekly = weeklyChallenge();
  const weeklyPlace = placeFor(weekly.serviceId);
  const cert = CERTS.certifications.find((c) => c.id === certGoal);
  const steps = cert ? certProgress(progress, cert) : [];
  const done = QUESTS.filter((q) => progress.quests?.[q.id]?.status === 'done').length;
  const today = useTodayGoals(care);
  const bonus = today.goals.filter((g) => g.bonus);
  return (
    <div className="more-body">
      {latest && !onShift(latest) && <TaskCard key={latest.taskId} task={latest} openTab={openTab} />}
      {bonus.length > 0 && <TodayChips goals={bonus} openTab={openTab} game={today.game} openCare={openCare} />}
      {isDiscovered(progress, weekly.serviceId, region) && (
        <button className="today-goal weekly" onClick={() => (feel.tap(), playAt(weekly.serviceId))}>
          <span aria-hidden="true">⚡</span>
          <span>This week: {weeklyPlace?.place ?? weekly.serviceId}'s game pays ×1.5 stars</span>
        </button>
      )}
      <LaunchCard />
      {cert && (
        <p className="today-goal-cert">
          🎯 <b>{cert.name.replace(/^AWS Certified /, '')}</b>:{' '}
          {steps.every((x) => x.done)
            ? 'trophy lit! 🏆'
            : steps.map((x) => `${districtById(x.districtId)?.name} ${x.done ? '✅' : `${TIER_NAMES[x.tier]} → ${TIER_NAMES[x.need]}`}`).join(' · ')}
        </p>
      )}
      {care && <CityHealth />}
      {care && (
        <details ref={careFold} className="care-fold">
          <summary className="label">🩺 City care</summary>
          <CityCare />
        </details>
      )}
      {/* A second way to play (ask an agent) shows once the first quest has taught the basics. */}
      {!asked && r && questsDone(progress) > 0 && (
        <section className="try" aria-label="An agent who can help">
          <h4 className="label">Or let an agent help</h4>
          <AgentOffer serviceId={r.agent} ask={r.ask} />
        </section>
      )}
      <details className="quests-fold">
        <summary className="label">
          📜 Quests · {done}/{QUESTS.length} done
        </summary>
        <QuestLog openTab={openTab} />
      </details>
      <details className="around">
        <summary className="label">Around town</summary>
        <ActivityFeed />
      </details>
    </div>
  );
}

/** Launch Day, once there's something to build a stack from (two buildings put up). */
function LaunchCard() {
  const built = useCity((s) => Object.values(s.progress.cities?.[s.cityRegion]?.landmarks ?? {}).filter((l) => l.discovered).length);
  const best = useCity((s) => s.progress.games?.launch?.best);
  if (built < 2) return null;
  return (
    <button className="today-goal launch-cta" onClick={() => (feel.tap(), useCity.getState().openLaunch(true))}>
      <span aria-hidden="true">🚀</span>
      <span>
        <b>Launch Day</b>: build a stack and survive the traffic{best ? ` · best ${best}` : ''}
      </span>
    </button>
  );
}

// ── Today's goals ──────────────────────────────────────────────────────────────

const GOAL_TAB: Record<Exclude<TodayGoal['id'], 'games' | 'fixes' | 'labs'>, Parameters<OpenTab>[0]> = { cards: 'cards', puzzles: 'arch', designs: 'sandbox', jobs: 'jobs' };
/** Each goal's chip says where it goes when that's another tab. */
const GOAL_WHERE: Partial<Record<TodayGoal['id'], string>> = { cards: 'Learn', puzzles: 'Learn', designs: 'Learn', jobs: 'Jobs' };

/** The overtime goal as one chip under the finished shift: what it asks, how far along, and where it's done. */
function OvertimeChip({ goal, openTab, game }: { goal: OvertimeGoal; openTab: OpenTab; game?: string }) {
  const ok = goal.have >= goal.goal;
  const where = goal.id === 'jobs' ? 'Jobs' : goal.id === 'cards' ? 'Learn' : undefined;
  return (
    <ul className="today-goals overtime" aria-label="Overtime">
      <li>
        <button
          className={`today-goal bonus ${ok ? 'done' : ''}`}
          title={where ? `Opens ${where}` : undefined}
          onClick={() => {
            feel.tap();
            if (goal.id === 'games') return playAt(game ?? ANY_GAME);
            openTab(goal.id === 'jobs' ? 'jobs' : 'cards');
          }}
        >
          <span aria-hidden="true">{ok ? '✅' : '⏱️'}</span>
          <span>{goal.label}</span>
          <span className="today-bonus">bonus crate</span>
          {!ok && (
            <span className="muted">
              {goal.have}/{goal.goal}
            </span>
          )}
          <span className="sr-only">{ok ? ', done' : where ? `, opens ${where}` : ''}</span>
        </button>
      </li>
    </ul>
  );
}

/** Today's goals as small chips under the ring (never a second big button): tap one to go and do it. */
function TodayChips({ goals, openTab, game, openCare }: { goals: TodayGoal[]; openTab: OpenTab; game?: string; openCare: () => void }) {
  if (!goals.length) return null;
  return (
    <ul className="today-goals" aria-label="Today’s goals">
      {goals.map((g) => {
        const ok = g.have >= g.goal;
        const where = GOAL_WHERE[g.id];
        return (
          <li key={g.id}>
            <button
              className={`today-goal ${ok ? 'done' : ''} ${g.bonus ? 'bonus' : ''}`}
              title={where ? `Opens ${where}` : undefined}
              onClick={() => {
                feel.tap();
                // a workshop step starts in the Workshop Studio (Town Square): its card opens right here in City
                if (g.id === 'labs') return (useCity.getState().select('workshop'), bus.emit('flyTo', { id: 'workshop' }), bus.emit('select', { id: 'workshop' }));
                // City care is in More to do: open it and bring it into view
                if (g.id === 'fixes') return openCare();
                // a game opens straight away (a fly-to alone changed nothing the player could see in the panel); with no
                // game building put up yet, the first game in the city still opens, so the chip never does nothing
                if (g.id === 'games') return playAt(game ?? ANY_GAME);
                openTab(GOAL_TAB[g.id]);
              }}
            >
              <span aria-hidden="true">{ok ? '✅' : '◻️'}</span>
              <span>{g.label}</span>
              {g.bonus && <span className="today-bonus">bonus</span>}
              {g.goal > 1 && !ok && <span className="muted">{g.have}/{g.goal}</span>}
              <span className="sr-only">{ok ? ', done' : where ? `, opens ${where}` : ''}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
