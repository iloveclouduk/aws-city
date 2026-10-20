import { startConsoleCopilot } from '@/app/runtime';
import { planDeploy, startQuest as notifyQuest, submitPrompt } from '@/app/runtime';
import { bus } from '@/state/bus';
import { stepButton, type NextPlan } from '@/state/next';
import { useCity } from '@/state/store';
import { walkTo, walkToStation } from '@/state/walk';
import { QUESTS, type Quest, type QuestStep } from '@/world/content';
import { districtById } from '@/world/taxonomy';
import { feel } from './feedback';
import { districtStyle } from './logic';
import { Portrait } from './Portrait';
import { Plain } from './Term';

const KIND: Record<QuestStep['kind'], string> = { visit: 'Visit', cards: 'Flashcards', puzzle: 'Puzzle', ask: 'Ask the agents', deploy: 'Deploy', choose: 'Your call', workshop: 'Workshop', console: 'In the console', design: 'Drawing board' };

/**
 * Where a button sends the player. 'feed', 'quests' and 'map' are the City tab (today's shift, the quests, the places);
 * 'cards', 'arch' and 'sandbox' are Learn's Cards, Puzzles and Drawing board.
 */
export type OpenTab = (t: 'learn' | 'arch' | 'sandbox' | 'deploy' | 'jobs' | 'feed' | 'quests' | 'map' | 'cards') => void;

/** What a quest step's button does (its label, src/state/next.ts stepButton, says the same thing). */
export function runQuestStep(step: QuestStep, openTab: OpenTab) {
  switch (step.kind) {
    case 'visit':
      walkTo(step.serviceId);
      break;
    case 'cards':
      useCity.getState().select(step.serviceId);
      openTab('learn');
      break;
    case 'puzzle':
      useCity.getState().setFocusPuzzle(step.puzzleId);
      openTab('arch');
      break;
    case 'ask':
      submitPrompt(step.prompt);
      openTab('feed');
      break;
    case 'deploy':
      if (!useCity.getState().account.linked) openTab('deploy');
      else planDeploy(step.templateId);
      break;
    case 'choose':
      useCity.getState().openChoice(step.id);
      break;
    case 'workshop':
      useCity.getState().openWorkshop(step.workshopId);
      break;
    case 'console':
      // The Copilot works in a console tab: it opens one first if none is focused.
      void startConsoleCopilot(step.goal);
      openTab('feed');
      break;
    case 'design':
      openTab('sandbox');
      break;
  }
}

/** Runs Home's next action (src/state/next.ts): each kind does exactly what its label says. */
export function runPlan(plan: NextPlan, openTab: OpenTab) {
  const s = useCity.getState();
  switch (plan.kind) {
    case 'step':
      return runQuestStep(plan.step, openTab);
    case 'review':
    case 'upgrade':
    case 'grow':
      s.select(plan.serviceId);
      return openTab('cards');
    case 'quest':
      feel.questStart();
      s.startQuest(plan.questId);
      return notifyQuest(plan.questId);
    case 'job':
      return walkToStation(plan.taskId);
    case 'workshop':
      return s.openWorkshop(plan.workshopId);
    case 'build':
      s.select(plan.serviceId);
      bus.emit('flyTo', { id: plan.serviceId });
      return bus.emit('select', { id: plan.serviceId });
    case 'tokens':
      bus.emit('flyTo', { id: 'plaza' });
      return s.toast('✨', 'Golden tokens glint when Kai walks near them. Try the side streets.');
    case 'explore':
      return bus.emit('flyTo', { id: 'plaza' });
  }
}

/** Quest lines (in the City tab's "More to do"): the active quest (open), one "Up next" card, the rest folded. */
export function QuestLog({ openTab }: { openTab: OpenTab }) {
  const quests = useCity((s) => s.progress.quests) ?? NONE;
  const start = useCity((s) => s.startQuest);
  const act = (step: QuestStep) => runQuestStep(step, openTab);

  const active = QUESTS.filter((q) => quests[q.id]?.status === 'active');
  const fresh = QUESTS.filter((q) => !quests[q.id]);
  const done = QUESTS.filter((q) => quests[q.id]?.status === 'done');
  const [upNext, ...later] = fresh;

  const head = (q: Quest) => {
    const st = quests[q.id];
    const giver = q.steps.find((x) => x.kind === 'visit')?.serviceId ?? q.serviceIds[0];
    return (
      <div className="quest-head">
        <Portrait id={giver} size={32} />
        <div className="quest-title">
          <div className="qt-row">
            <b>{q.title}</b>
            <span className="xp-chip">+{q.rewardXp} ⭐</span>
          </div>
          {st && <Segments total={q.steps.length} at={st.status === 'done' ? q.steps.length : st.step} />}
        </div>
      </div>
    );
  };
  const color = (q: Quest) => districtStyle(districtById(q.districtId)?.color);

  return (
    <div className="quests">
      {active.map((q) => {
        const st = quests[q.id]!;
        return (
          <section key={q.id} className="quest edge active" style={color(q)}>
            {head(q)}
            <p className="quest-intro">
              <Plain text={q.intro} />
            </p>
            <QuestSteps steps={q.steps} at={st.step} count={st.count} onGo={act} />
          </section>
        );
      })}
      {upNext && (
        <>
          <h4 className="up-next-label">Up next</h4>
          <section className="quest edge new" style={color(upNext)}>
            {head(upNext)}
            <p className="quest-intro">
              <Plain text={upNext.intro} />
            </p>
            {/* Home's big button is the one filled button on screen: this one is plain. */}
            <button
              className="btn"
              onClick={() => {
                feel.questStart();
                start(upNext.id);
                notifyQuest(upNext.id);
              }}
            >
              Start quest
            </button>
          </section>
        </>
      )}
      {later.length > 0 && (
        <details className="quest-later">
          <summary>
            {later.length} more quest{later.length === 1 ? '' : 's'} later
          </summary>
          <ul>
            {later.map((q) => (
              <li key={q.id}>{q.title}</li>
            ))}
          </ul>
        </details>
      )}
      {/* Finished quests fold to one line with a stamp. */}
      {done.map((q) => (
        <details key={q.id} className="quest edge done" style={color(q)}>
          <summary>
            {head(q)}
            <span className="stamp" aria-label="Quest complete">
              🏆
            </span>
          </summary>
          <QuestSteps steps={q.steps} at={q.steps.length} />
        </details>
      ))}
    </div>
  );
}

/** One pixel segment per step: done, now (blinking), to do. */
export function Segments({ total, at }: { total: number; at: number }) {
  return (
    <span className="segs-row">
      <span className="segs" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < at ? 'done' : i === at ? 'now' : ''} />
        ))}
      </span>
      <span className="segs-count">
        {Math.min(at, total)}/{total}
      </span>
    </span>
  );
}

function QuestSteps({ steps, at, count, onGo }: { steps: QuestStep[]; at: number; count?: number; onGo?: (s: QuestStep) => void }) {
  return (
    <ol className="steps quest-steps">
      {steps.map((s, i) => {
        const state = i < at ? 'done' : i === at ? 'running' : 'pending';
        return (
          <li key={i} className={state}>
            <span className={`ico n ${state}`} title={KIND[s.kind]}>
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className="step-text">
              <Plain text={s.text} />
              {s.kind === 'cards' && state === 'running' ? ` (${count ?? 0}/${s.count})` : ''}
            </span>
            {state === 'running' && onGo && (
              <button className="btn tiny" onClick={() => (feel.tap(), onGo(s))}>
                {stepButton(s)}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const NONE: Record<string, { status: 'active' | 'done'; step: number; count?: number }> = {};
