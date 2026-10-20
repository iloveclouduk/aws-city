import { Coin } from '../icons';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { COIN_PAY } from '@/state/wallet';
import { askDistrict, openPractice, startConsoleCopilot } from '@/app/runtime';
import { puzzleForJob } from '@/learning/jobPuzzle';
import { checkKeywords, framedJobExplain, MAX_CHARS } from '@/state/explain';
import { bus } from '@/state/bus';
import { agentName, useCity } from '@/state/store';
import { choiceOrder } from '@/world/content';
import { clientById, clientName, levelCount, taskById, taskPay, TASK_ICON, TASK_VERB, type ChooseJob, type ClickJob, type ExplainJob, type FixJob, type TaskRef } from '@/world/clients';
import { placeFor } from '@/world/places';
import { serviceById } from '@/world/taxonomy';
import { Builder } from '../ArchitectureBoard';
import { feel } from '../feedback';
import { GrowLine } from '../Flashcards';
import { PracticeTerminal } from '../PracticeTerminal';
import { Plain } from '../Term';
import { useDialog, useShieldGame } from '../useDialog';
import { StationRunner } from './stations/StationRunner';
import { clientEmoji, JobsBar } from './ClientsPanel';

/**
 * One side job, opened when Kai reaches its station (store `clientTaskOpen`). Each kind reuses a part the game has:
 * the architecture board, the practice terminal, a choose card, the practice console's Copilot, a settings checklist,
 * Explain it back, or a station panel. Passing it pays its stars once ever (store.clientTaskDone).
 */
export function ClientTask() {
  const id = useCity((s) => s.clientTaskOpen);
  const ref = id ? taskById(id) : undefined;
  const box = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = () => {
    const back = ref?.client.id;
    useCity.getState().openClientTask(undefined);
    // Back to the business's task list (unless its level-up card holds the floor).
    if (back && !useCity.getState().clientDone) useCity.getState().openClients(back);
  };
  useDialog(!!ref, box, close, closeBtn);
  useShieldGame(!!ref, scrim);
  if (!ref) return null;
  return (
    <div ref={scrim} className="finding-scrim app-modal" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <section ref={box} className={`finding-card job-card job-${ref.task.type}`} role="dialog" aria-modal="true" aria-labelledby="job-title">
        <header className="finding-head">
          <span className="clients-emoji" aria-hidden="true">
            {TASK_ICON[ref.task.type]}
          </span>
          <div className="finding-who">
            <b id="job-title">{ref.task.title}</b>
            <span className="muted">
              {clientName(ref.client)} · 📍 {ref.task.station} · {TASK_VERB[ref.task.type]}
            </span>
          </div>
          <button ref={closeBtn} className="btn icon ghost" aria-label="Close" onClick={close}>
            ✕
          </button>
        </header>
        <JobBody key={ref.task.id} ref_={ref} onClose={close} />
      </section>
    </div>
  );
}

function JobBody({ ref_: ref, onClose }: { ref_: TaskRef; onClose: () => void }) {
  const t = ref.task;
  const done = useCity((s) => (s.progress.clients?.[ref.client.id]?.done ?? []).includes(t.id));
  const [paid, setPaid] = useState<number>();
  const pass = () => {
    if (paid !== undefined) return;
    setPaid(useCity.getState().clientTaskDone(t.id));
  };
  return (
    <div className="job-body">
      <p className="job-why">
        <Plain text={t.why} />
      </p>
      {t.type === 'wire' && <WireJobView t={t} onPass={pass} districtId={serviceById(t.services[0])?.districtId} />}
      {t.type === 'run' && (
        <>
          <p>
            <Plain text={t.run.body} />
          </p>
          <PracticeTerminal step={{ cli: t.run.cli, output: t.run.output, errors: t.run.errors }} onPass={pass} label={`Practice terminal for ${t.title}`} />
        </>
      )}
      {t.type === 'choose' && <ChooseJobView id={t.id} job={t.choose} onPass={pass} />}
      {t.type === 'click' && <ClickJobView id={t.id} job={t.click} />}
      {t.type === 'fix' && <FixJobView job={t.fix} onPass={pass} />}
      {t.type === 'explain' && <ExplainJobView title={t.title} job={t.explain} serviceId={t.services[0]} onPass={pass} />}
      {t.type === 'station' && <StationRunner panel={t.panel} title={t.title} onPass={pass} />}
      {(done || paid !== undefined) && <JobDone ref_={ref} paid={paid} onClose={onClose} />}
    </div>
  );
}

/** The job's done line: its stars (this time, or that it paid before), the business's count and what grew. */
function JobDone({ ref_: ref, paid, onClose }: { ref_: TaskRef; paid?: number; onClose: () => void }) {
  const progress = useCity((s) => s.progress);
  const lv = ref.client.levels.find((l) => l.level === ref.level.level)!;
  const c = levelCount(progress, ref.client, lv);
  const pay = taskPay(ref.task);
  return (
    <div className="job-done" role="status">
      <p>
        <b>✓ Job done!</b>{' '}
        {paid ? (
          <>
            +{paid} ⭐ to {Object.keys(pay).map((s) => placeFor(s)?.place ?? s).join(', ')} · +{COIN_PAY.job} <Coin size={12} label="City Coins" />.
          </>
        ) : (
          'Its stars were paid the first time.'
        )}
      </p>
      <JobsBar done={c.done} of={c.of} label={`Level ${lv.level} jobs done`} />
      <GrowLine serviceId={ref.task.services[0]} />
      <button className="btn primary wide" onClick={onClose}>
        Continue
      </button>
    </div>
  );
}

function WireJobView({ t, onPass, districtId }: { t: Extract<TaskRef['task'], { type: 'wire' }>; onPass: () => void; districtId?: string }) {
  const p = useMemo(() => puzzleForJob(t, districtId), [t, districtId]);
  return (
    <div className="arch job-wire">
      <p className="story">
        <Plain text={p.story} />
      </p>
      <ul className="reqs">
        {p.requirements.map((r) => (
          <li key={r}>
            <Plain text={r} />
          </li>
        ))}
      </ul>
      <Builder p={p} job={{ onPass }} />
    </div>
  );
}

function ChooseJobView({ id, job, onPass }: { id: string; job: ChooseJob; onPass: () => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const solved = picked.some((i) => job.options[i].correct);
  const last = picked.at(-1);
  return (
    <>
      <p className="choice-q">
        <Plain text={job.question} />
      </p>
      <div className="choice-options" role="group" aria-label="Answers">
        {choiceOrder(id, job.options.length).map((i, shown) => {
          const o = job.options[i];
          const tried = picked.includes(i);
          const state = tried ? (o.correct ? 'right' : 'wrong') : '';
          return (
            <button
              key={i}
              className={`choice-option ${state}`}
              aria-pressed={tried}
              disabled={solved || (tried && !o.correct)}
              onClick={() => {
                setPicked((p) => [...p, i]);
                if (o.correct) (feel.good(), onPass());
                else feel.bad();
              }}
            >
              <span className="choice-mark" aria-hidden="true">
                {state === 'right' ? '✓' : state === 'wrong' ? '✗' : String.fromCharCode(65 + shown)}
              </span>
              <Plain text={o.text} still />
            </button>
          );
        })}
      </div>
      {last !== undefined && (
        <p className={`choice-why ${job.options[last].correct ? 'right' : 'wrong'}`} aria-live="polite">
          <b>{job.options[last].correct ? 'Right! ' : 'Not quite. '}</b>
          <Plain text={job.options[last].why} />
        </p>
      )}
    </>
  );
}

/** "Click it": the Copilot does it in the console (the demo: the practice console, which never touches AWS). */
function ClickJobView({ id, job }: { id: string; job: ClickJob }) {
  const demo = useCity((s) => s.backendKind === 'mock');
  const running = useCity((s) => s.copilotJob?.jobId === id && s.tasks[s.copilotJob.taskId]?.status === 'running');
  const failed = useCity((s) => s.copilotJob?.jobId === id && s.tasks[s.copilotJob.taskId]?.status === 'failed');
  const name = serviceById(job.flow)?.name ?? job.flow;
  return (
    <div className="job-click">
      <p>
        <b>Goal:</b> <Plain text={job.goal} />
      </p>
      <p className="muted small">
        {demo
          ? `An agent clicks through the practice ${name} console, saying what each step does. Nothing there touches AWS.`
          : `An agent clicks through your open ${name} console tab, saying what each step does. You approve anything risky.`}
      </p>
      <div className="actions">
        <button
          className="btn primary"
          disabled={running}
          onClick={() => {
            feel.send();
            void startConsoleCopilot(job.goal, { serviceId: job.flow, onStart: (taskId) => useCity.setState({ copilotJob: { taskId, jobId: id } }) });
          }}
        >
          {running ? 'The Copilot is working…' : '🧭 Do it with the Copilot'}
        </button>
        {demo && (
          <button className="btn ghost" onClick={() => (feel.tap(), void openPractice(job.flow, { wait: false }))}>
            Open the practice console ↗
          </button>
        )}
      </div>
      {failed && <p className="muted small">That run stopped before the end. Try once more.</p>}
    </div>
  );
}

/** "Fix it": a finding-style list of settings. Switch the ones that are wrong, leave the right ones, then check. */
function FixJobView({ job, onPass }: { job: FixJob; onPass: () => void }) {
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState(false);
  const wrong = job.settings.filter((s) => pick[s.id] !== undefined && pick[s.id] !== s.switchIt);
  const all = job.settings.every((s) => pick[s.id] !== undefined);
  const ok = checked && all && wrong.length === 0;
  return (
    <div className="job-fix">
      <p className="muted small">For each setting: switch it, or leave it as it is. Some are already right.</p>
      <ul className="fix-list">
        {job.settings.map((s) => {
          const mine = pick[s.id];
          const bad = checked && mine !== undefined && mine !== s.switchIt;
          return (
            <li key={s.id} className={`fix-row ${bad ? 'wrong' : checked && mine === s.switchIt ? 'right' : ''}`}>
              <span className="fix-label">
                <Plain text={s.label} />
                <small className="muted"> · now: {s.now}</small>
              </span>
              <span className="fix-pick" role="group" aria-label={s.label}>
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    className={`btn tiny ${mine === v ? 'on' : 'ghost'}`}
                    aria-pressed={mine === v}
                    disabled={ok}
                    onClick={() => (feel.tap(), setChecked(false), setPick((p) => ({ ...p, [s.id]: v })))}
                  >
                    {v ? 'Switch it' : 'Leave it'}
                  </button>
                ))}
              </span>
              {checked && mine !== undefined && (
                <small className={`fix-why ${bad ? 'wrong' : 'right'}`}>
                  {bad ? 'Not quite: ' : '✓ '}
                  <Plain text={s.why} />
                </small>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small" aria-live="polite">
        {checked && !ok ? `${wrong.length} to change. Read why, then try again.` : ''}
      </p>
      <button
        className="btn primary"
        disabled={!all || ok}
        onClick={() => {
          setChecked(true);
          const right = job.settings.every((s) => pick[s.id] === s.switchIt);
          if (right) (feel.good(), onPass());
          else feel.bad();
        }}
      >
        {all ? 'Check my settings' : `Choose for every setting (${job.settings.filter((s) => pick[s.id] === undefined).length} left)`}
      </button>
    </div>
  );
}

/** "Explain it": the job's question in your own words; the rules check its key ideas, the building's agent replies kindly. */
function ExplainJobView({ title, job, serviceId, onPass }: { title: string; job: ExplainJob; serviceId: string; onPass: () => void }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState<{ requestId?: string; text: string }>();
  const fieldId = useId();
  const districtId = serviceById(serviceId)?.districtId ?? 'compute';
  const reply = useCity((s) => (sent?.requestId ? s.chats[districtId]?.find((m) => m.id === `a-${sent.requestId}`) : undefined));
  const check = checkKeywords(job.keywords, sent?.text ?? text, job.minWords);
  if (!sent)
    return (
      <form
        className="explain-back"
        onSubmit={(e) => {
          e.preventDefault();
          if (check.tooShort) return;
          feel.tap();
          setSent({ text, requestId: askDistrict(districtId, framedJobExplain(title, job.question, text, serviceId), text) });
          onPass();
        }}
      >
        <label htmlFor={fieldId}>
          <Plain text={job.question} />
        </label>
        <textarea id={fieldId} rows={3} maxLength={MAX_CHARS} value={text} onChange={(e) => setText(e.target.value)} placeholder="A sentence or two is plenty." />
        <button className="btn primary wide" type="submit" disabled={check.tooShort}>
          {check.tooShort ? `A few more words (${job.minWords - check.words} to go)` : 'Check my answer'}
        </button>
      </form>
    );
  return (
    <div className="explain-back" aria-live="polite">
      {check.mentioned.length > 0 && <p className="explain-got">✅ You used: {check.mentioned.slice(0, 5).join(', ')}</p>}
      {check.missed.length > 0 && <p className="muted explain-missed">💡 Ideas to add: {check.missed.join(', ')}</p>}
      {reply ? (
        <p className="explain-reply">
          <b>{agentName(reply.agentId ?? serviceId)}:</b> {reply.text}
          {reply.pending ? ' …' : ''}
        </p>
      ) : (
        sent.requestId && <p className="muted">{agentName(serviceId)} is reading your answer…</p>
      )}
    </div>
  );
}

/**
 * A business finished a level (store `clientDone`): one card, while the city grows its site (CityScene, on the
 * `clientLevelUp` bus event). Toasts wait until it closes (store `toastsHeld`).
 */
export function ClientDone() {
  const done = useCity((s) => s.clientDone);
  const box = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const b = done ? clientById(done.clientId) : undefined;
  const lv = b?.levels.find((l) => l.level === done?.level);
  const [up, setUp] = useState(false);
  // The job's own card makes way a beat after the last star floats in: one card at a time.
  useEffect(() => {
    if (!lv) return setUp(false);
    const timer = setTimeout(() => {
      useCity.getState().openClientTask(undefined);
      setUp(true);
      feel.win();
    }, 900);
    return () => clearTimeout(timer);
  }, [lv]);
  const close = () => useCity.getState().celebrateClient(undefined);
  useDialog(up && !!lv, box, close, first);
  useShieldGame(up && !!lv, scrim);
  if (!b || !lv || !up) return null;
  const next = b.levels.find((l) => l.level === lv.level + 1);
  const services = [...new Set(lv.tasks.flatMap((t) => t.services))];
  return (
    <div ref={scrim} className="finding-scrim app-modal celebrate-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <section ref={box} className="finding-card celebrate client-done" role="dialog" aria-modal="true" aria-labelledby="client-done-title">
        <div className="celebrate-burst" aria-hidden="true">
          {clientEmoji(b.id)}
        </div>
        <h3 id="client-done-title">
          {clientName(b)}: level {lv.level} done!
        </h3>
        <p className="celebrate-name">{lv.title}</p>
        <p className="celebrate-stars" aria-label={`A bonus of ${lv.bonusStars} stars and ${COIN_PAY.jobLevel} City Coins`}>
          +{lv.bonusStars} ⭐ · +{COIN_PAY.jobLevel} <Coin size={16} /> bonus
        </p>
        <p>
          <Plain text={lv.celebrate} />
        </p>
        <p className="muted small">Stars went to {services.map((s) => placeFor(s)?.place ?? s).join(', ')}.</p>
        <div className="celebrate-actions">
          <button
            ref={first}
            className="btn primary wide"
            onClick={() => {
              close();
              feel.tap();
              bus.emit('flyTo', { id: `client:${b.id}` });
            }}
          >
            See {clientName(b)} grow
          </button>
          {next && (
            <button className="btn ghost wide" onClick={() => (close(), feel.tap(), useCity.getState().openClients(b.id))}>
              Next: level {next.level}, {next.title} →
            </button>
          )}
          <button className="btn ghost wide" onClick={close}>
            Keep exploring
          </button>
        </div>
      </section>
    </div>
  );
}
