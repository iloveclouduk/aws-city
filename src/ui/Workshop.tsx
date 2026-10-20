import { useEffect, useMemo, useRef, useState } from 'react';
import { askDistrict, openCloudShell, openPractice, openUrl, openWorkshopSource, startConsoleCopilot, verifyWorkshopStep } from '@/app/runtime';
import type { Progress } from '@/backend/contract';
import { redact } from '@/console/risk';
import { explainError, type TerminalError } from '@/learning/terminal';
import { stepReward, workshopStatus } from '@/learning/workshopRewards';
import { bus } from '@/state/bus';
import { growthLine, growthOf } from '@/state/growth';
import { levelOf } from '@/state/mastery';
import { useCity } from '@/state/store';
import { questById } from '@/world/content';
import { placeFor } from '@/world/places';
import { serviceById } from '@/world/taxonomy';
import { isChecked, terminalStep, workshopById, WORKSHOPS, type Workshop as WorkshopDef, type WorkshopStep } from '@/world/workshops';
import { AwsIcon } from './AwsIcon';
import { feel, useCopy } from './feedback';
import { GrowLine } from './Flashcards';
import { PracticeTerminal } from './PracticeTerminal';
import { Plain } from './Term';
import { useDialog } from './useDialog';

type Mode = 'practice' | 'real';

/** The active quests whose step now is this workshop (a step done here counts for them: store.workshopStep). */
function questsWaitingOn(progress: Progress, workshopId: string): string[] {
  return Object.entries(progress.quests ?? {}).flatMap(([id, st]) => {
    const step = st.status === 'active' ? questById(id)?.steps[st.step] : undefined;
    return step?.kind === 'workshop' && step.workshopId === workshopId ? [id] : [];
  });
}
const placeholders = (cli = '') => [...new Set([...cli.matchAll(/<([a-z0-9-]+)>/gi)].map((m) => m[1]))];

/**
 * A hands-on workshop, step by step: practise each command in the simulated terminal, or run it for real in AWS
 * CloudShell and let the city check your account (read-only). Every step grows the building; finishing establishes it.
 */
export function Workshop() {
  const id = useCity((s) => s.workshopOpen);
  const close = () => useCity.getState().openWorkshop(undefined);
  const box = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const w = id ? workshopById(id) : undefined;
  useDialog(!!w, box, close, closeBtn);
  if (!w) return null;
  return (
    <div className="finding-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <section ref={box} className="finding-card workshop-card" role="dialog" aria-modal="true" aria-labelledby="workshop-title">
        <header className="finding-head">
          <AwsIcon serviceId={w.serviceId} size={28} />
          <div className="finding-who">
            <b id="workshop-title">{w.title}</b>
            <span className="muted">
              Workshop · level {w.level} · about {w.minutes} min · {placeFor(w.serviceId)?.place}
            </span>
          </div>
          <button ref={closeBtn} className="btn icon ghost" aria-label="Close" onClick={close}>
            ✕
          </button>
        </header>
        <WorkshopBody w={w} />
      </section>
    </div>
  );
}

/** The building this workshop grows: its level and how far to the next, bumping as each step pays. */
function BuildingStrip({ w, bump }: { w: WorkshopDef; bump: number }) {
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const lv = levelOf(progress, w.serviceId, region);
  return (
    <div className={`workshop-building ${bump ? 'bumped' : ''}`} key={bump}>
      <span className="workshop-building-icon" aria-hidden="true">
        <AwsIcon serviceId={w.serviceId} size={32} />
      </span>
      <span className="workshop-building-level">{lv > 0 ? `Lv ${lv}` : 'New'}</span>
      <GrowLine serviceId={w.serviceId} bump={bump} />
    </div>
  );
}

/** One line under the steps' picker: where the commands run, in words that fit the mode (and the demo). */
function ModeIntro({ mode, demo, names }: { mode: Mode; demo: boolean; names: Record<string, string> }) {
  const account = useCity((s) => s.account);
  const used = Object.entries(names);
  const same = used.length ? ` Use the same names: ${used.map(([k, v]) => `${k} ${v}`).join(', ')}.` : ' Use the same names you practised with.';
  if (mode === 'practice') return <p className="muted small workshop-intro">🧪 Type each command in the practice terminal. Nothing here touches AWS.</p>;
  if (demo)
    return (
      <p className="muted small workshop-intro" role="note">
        🎭 This is the demo, so there&apos;s no real AWS here: the practice account stands in for CloudShell, and steps count as practice (practice stars).
      </p>
    );
  return (
    <p className="muted small workshop-intro" role="note">
      ☁️ Run each command in AWS CloudShell, then let the city check your account (read-only).{same} Region: {account.region ?? 'the one your console shows'}.
      {!account.linked && ' Link your account in the Deploy tab first, so the city can look.'}
    </p>
  );
}

function WorkshopBody({ w }: { w: WorkshopDef }) {
  const progress = useCity((s) => s.progress.workshops?.[w.id]);
  const demo = useCity((s) => s.backendKind === 'mock');
  const memory = useCity((s) => s.prefs.workshopMemory?.[w.id]);
  const names = useMemo(() => memory?.names ?? {}, [memory]);
  const ids = w.steps.map((s) => s.id);
  const status = workshopStatus(progress, ids);
  const [mode, setMode] = useState<Mode>('practice');
  const firstOpen = w.steps.findIndex((s) => !progress?.steps[s.id]);
  const [at, setAt] = useState(Math.max(0, firstOpen));
  const [paid, setPaid] = useState<{ key: number; stepId: string; stars: number; mode: Mode }>();
  const step = w.steps[at];
  const atRef = useRef(at);
  atRef.current = at;
  // A quest's workshop step that a step here completed: the player can close the workshop and carry on.
  const [questDone, setQuestDone] = useState(false);
  const waiting = useRef<string[]>([]);
  useEffect(() => {
    waiting.current = questsWaitingOn(useCity.getState().progress, w.id);
  }, [w]);
  // Every step done, however it was done (terminal, CloudShell check, Copilot): stars float here, the building's line
  // bumps, one sound, and a second later the next open step comes up.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = bus.on('workshopStep', (e) => {
      if (e.workshopId !== w.id) return;
      const now = questsWaitingOn(useCity.getState().progress, w.id);
      if (waiting.current.some((q) => !now.includes(q))) setQuestDone(true);
      waiting.current = now;
      setPaid({ key: Date.now(), stepId: e.stepId, stars: e.stars, mode: e.mode });
      if (e.finished) feel.win();
      else if (e.stars > 0) feel.good();
      else feel.tap();
      if (e.finished || w.steps[atRef.current]?.id !== e.stepId) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const done = useCity.getState().progress.workshops?.[w.id]?.steps ?? {};
        const i = atRef.current;
        const after = w.steps.findIndex((s, j) => j > i && !done[s.id]);
        const next = after >= 0 ? after : w.steps.findIndex((s) => !done[s.id]);
        if (next >= 0 && next !== i) setAt(next);
      }, ADVANCE_MS);
    });
    return () => (off(), clearTimeout(timer));
  }, [w]);
  return (
    <>
      <BuildingStrip w={w} bump={paid?.stars ? paid.key : 0} />
      <p className="workshop-about">
        <Plain text={w.simple} /> <span className="muted small">💷 {w.costNote}</span>
      </p>
      <div className="workshop-status">
        <div className="workshop-progress" role="progressbar" aria-valuemin={0} aria-valuemax={status.of} aria-valuenow={status.done} aria-label="Workshop steps done">
          <i style={{ width: `${(status.done / status.of) * 100}%` }} />
        </div>
        <span className="muted small">
          {status.finished ? '🏅 Finished: the building is established.' : `${status.done} of ${status.of} steps`}
          {status.real > 0 && ` · ${status.real} checked in your account`}
        </span>
      </div>
      {questDone && (
        <p className="workshop-quest-done" role="status">
          ✓ Quest step done — you can close this
        </p>
      )}
      <div className="seg" role="group" aria-label="Where to run the commands">
        {(['practice', 'real'] as const).map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => (feel.tap(), setMode(m))}>
            {m === 'practice' ? '🧪 Practice terminal' : demo ? '☁️ Practice account (demo)' : '☁️ For real in CloudShell'}
          </button>
        ))}
      </div>
      <ModeIntro mode={mode} demo={demo} names={names} />
      <ol className="workshop-steps">
        {w.steps.map((s, i) => (
          <li key={s.id} className={i === at ? 'now' : ''}>
            <button className="btn ghost tiny" aria-current={i === at ? 'step' : undefined} onClick={() => setAt(i)}>
              <span aria-hidden="true">{progress?.steps[s.id] === 'real' ? '✅' : progress?.steps[s.id] ? '☑️' : s.cleanup ? '🧹' : '⬜'}</span> {s.title}
            </button>
          </li>
        ))}
      </ol>
      {step && (
        <StepView
          key={`${step.id}:${mode}`}
          w={w}
          step={step}
          mode={mode}
          demo={demo}
          names={names}
          done={progress?.steps[step.id]}
          paid={paid?.stepId === step.id ? paid : undefined}
          onNext={() => setAt((i) => Math.min(w.steps.length - 1, i + 1))}
        />
      )}
      <p className="muted small workshop-source">
        {w.imported ? 'Steps adapted from ' : 'Full workshop: '}
        <button className="btn ghost tiny" onClick={() => openWorkshopSource(w.source.url)}>
          {w.source.title} ↗
        </button>
        {w.imported && w.source.license && ` (${w.source.license}${w.source.attribution ? `, ${w.source.attribution}` : ''})`}
      </p>
    </>
  );
}

/** A second after a step passes, the next open one comes up (long enough to see the stars). */
const ADVANCE_MS = 1000;

function StepView(props: {
  w: WorkshopDef;
  step: WorkshopStep;
  mode: Mode;
  demo: boolean;
  names: Record<string, string>;
  done?: 'practice' | 'real';
  paid?: { key: number; stars: number; mode: Mode };
  onNext: () => void;
}) {
  const { w, step, mode, demo, names, done, paid, onNext } = props;
  const check = useCity((s) => s.workshopChecks[`${w.id}/${step.id}`]);
  const history = useCity((s) => s.prefs.workshopMemory?.[w.id]?.history);
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const term = terminalStep(step);
  // The check reads only the name it looks for (the table, the bucket): the form asks for that one, filled in already.
  const asks = isChecked(step) ? [step.verify.value] : [];
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(asks.map((n) => [n, names[n] ?? ''])));
  const [copied, copyText] = useCopy();
  const remember = (patch: { names?: Record<string, string>; line?: string }) => useCity.getState().rememberWorkshop(w.id, patch);
  const pass = (m: Mode, typed: Record<string, string> = {}, hints = 0) => {
    remember({ names: typed });
    useCity.getState().workshopStep(w.id, step.id, m, hints);
  };
  // The demo has no real AWS: "for real" there runs in the practice terminal and pays practice (store: honestMode).
  const realHere = mode === 'real' && !demo;
  const worth = stepReward(progress.workshops?.[w.id], step.id, realHere ? 'real' : 'practice');
  const answered = check && !check.pending;
  useEffect(() => {
    if (answered && !check?.ok) feel.bad();
  }, [answered, check?.ok]);
  // Shown and copied without the optional parts (`[--region <region>]`): the command as you'd type it.
  const filled = useMemo(
    () =>
      (step.cli ?? '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/<([a-z0-9-]+)>/gi, (m, k: string) => names[k] || m)
        .replace(/\s+/g, ' ')
        .trim(),
    [step.cli, names],
  );
  // Placeholders with no name typed yet in this workshop stay as `<x>`, and the player is told to swap them.
  const unfilled = placeholders(filled);
  const g = growthOf(progress, w.serviceId, region);
  return (
    <section className="workshop-step" aria-label={step.title}>
      {paid && paid.stars > 0 && (
        <span key={paid.key} className="xp-float" aria-hidden="true">
          +{paid.stars}⭐
        </span>
      )}
      <h4>
        {step.title}
        {done && <span className="muted small"> · {done === 'real' ? 'checked in your account' : 'done in practice'}</span>}
      </h4>
      {/* Once the step is done its description folds away, so the terminal and its tools sit higher. */}
      {done ? (
        <details className="workshop-what">
          <summary>What this step does</summary>
          <p>
            <Plain text={step.body} />
          </p>
        </details>
      ) : (
        <p>
          <Plain text={step.body} />
        </p>
      )}
      {step.cli && (
        <div className="code-row">
          {/* A long command wraps and scrolls in its box; the keyboard can reach it to scroll (axe scrollable-region-focusable). */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <code className="workshop-cmd" tabIndex={0}>
            {filled}
          </code>
          <button className="btn tiny" onClick={() => copyText(filled)}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {step.cli && unfilled.length > 0 && (
        <p className="muted small">
          Replace {unfilled.map((n, i) => (
            <span key={n}>
              {i > 0 && ', '}
              <code>{`<${n}>`}</code>
            </span>
          ))}{' '}
          before running it.
        </p>
      )}
      {step.consolePath && (
        <div className="actions">
          {/* The demo opens the practice console inside the extension (nothing there touches AWS); the Copilot goes there too. */}
          <button
            className="btn tiny"
            onClick={() => (feel.tap(), demo ? void openPractice(w.serviceId, { wait: false }) : openUrl(`https://console.aws.amazon.com/${step.consolePath}`))}
          >
            {demo ? 'Open the practice console ↗' : 'Open in the console ↗'}
          </button>
          <button
            className="btn tiny"
            title={
              demo
                ? 'An agent clicks through the practice console, explaining each step (nothing there touches AWS)'
                : 'An agent clicks through your open console tab, explaining each step (you approve anything risky)'
            }
            onClick={() => {
              feel.send();
              // Linked only to the task this press starts (never one already running), before its first event.
              void startConsoleCopilot(`${w.title}, step "${step.title}": ${step.body}`, {
                serviceId: w.serviceId,
                onStart: (taskId) => useCity.setState({ copilotFor: { taskId, workshopId: w.id, stepId: step.id } }),
              });
            }}
          >
            🧭 Do it with the Copilot
          </button>
        </div>
      )}
      {!realHere && term && (
        <PracticeTerminal
          step={term}
          names={names}
          history={history}
          worth={worth}
          onLine={(line) => remember({ line })}
          onPass={(v, hints) => pass(mode, v, hints)}
          label={`Practice terminal for ${step.title}`}
        />
      )}
      {!realHere && !term && (
        <button className="btn" onClick={() => pass(mode)}>
          I did this in the console
        </button>
      )}
      {realHere && (
        <div className="workshop-real">
          <button className="btn" onClick={() => (feel.tap(), openCloudShell())}>
            Open CloudShell ↗
          </button>
          {isChecked(step) ? (
            <form
              className="workshop-check"
              onSubmit={(e) => {
                e.preventDefault();
                feel.send();
                remember({ names: form });
                verifyWorkshopStep(w.id, step.id, form);
              }}
            >
              {asks.map((n) => (
                <label key={n}>
                  <span className="label">The {n} name you used</span>
                  <input value={form[n] ?? ''} onChange={(e) => setForm((v) => ({ ...v, [n]: e.target.value }))} spellCheck={false} autoCapitalize="off" required />
                </label>
              ))}
              <button className="btn primary" disabled={check?.pending}>
                {check?.pending ? 'Checking…' : 'Check my account'}
              </button>
              {answered && <p className={check.ok ? 'ok-note' : 'muted'}>{check.ok ? `✓ ${check.detail}` : check.detail}</p>}
            </form>
          ) : (
            <button className="btn primary" onClick={() => pass('real')}>
              I ran it: done
            </button>
          )}
        </div>
      )}
      {paid && (
        <p className="workshop-paid" role="status">
          {paid.stars > 0 ? `+${paid.stars}⭐ · ${growthLine(g)}` : `Done again: ${growthLine(g)}`}
          {paid.mode === 'practice' && mode === 'real' && demo && ' (practice: this is the demo)'}
        </p>
      )}
      <ErrorHelp w={w} errors={step.errors} />
      {done && (
        <button className="btn wide" onClick={onNext}>
          Next step →
        </button>
      )}
    </section>
  );
}

/** "I got an error": a known one is explained at once (rules first); anything else goes to the building's agent. */
function ErrorHelp({ w, errors }: { w: WorkshopDef; errors?: TerminalError[] }) {
  const [text, setText] = useState('');
  const [known, setKnown] = useState<TerminalError | null>();
  const [asked, setAsked] = useState(false);
  const agent = placeFor(w.serviceId)?.agentName.split(' the ')[0] ?? 'the agent';
  const help = () => {
    const t = text.trim();
    if (!t) return;
    const k = explainError(t, errors);
    setKnown(k ?? null);
    if (k) return feel.good();
    const svc = serviceById(w.serviceId);
    if (!svc) return;
    // The pasted text is data for the agent, not instructions: quoted, trimmed and with keys and emails taken out.
    const clean = redact(t).slice(0, 1200);
    askDistrict(svc.districtId, `I'm doing the "${w.title}" workshop and got this error. What does it mean and how do I fix it?\n<error>\n${clean}\n</error>`, `I got an error in ${w.title}`);
    setAsked(true);
    feel.send();
  };
  return (
    <details className="workshop-error">
      <summary>I got an error</summary>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Paste the error here" aria-label="The error you got" />
      <button className="btn tiny" onClick={help}>
        Help me fix it
      </button>
      {known && (
        <p>
          💡 <Plain text={known.explain} /> <b>{known.fix}</b>
        </p>
      )}
      {known === null && asked && <p className="muted">I've asked {agent}. The answer comes up in the Feed.</p>}
    </details>
  );
}

/** The Workshop Studio in the Town Square: every workshop in the city, by building. */
export function WorkshopStudio() {
  const progress = useCity((s) => s.progress.workshops);
  return (
    <div className="card workshop-studio">
      <h3>🛠️ Workshop Studio</h3>
      <p className="muted">Hands-on, step by step: practise each command here, then run it for real in AWS CloudShell. Every step grows the building it's about.</p>
      <WorkshopList ids={WORKSHOPS.map((w) => w.id)} progress={progress} />
    </div>
  );
}

export function WorkshopList({ ids, progress }: { ids: string[]; progress?: Record<string, { steps: Record<string, string>; done?: string }> }) {
  return (
    <ul className="workshop-list">
      {ids.map((id) => {
        const w = workshopById(id)!;
        const st = workshopStatus(progress?.[id] as never, w.steps.map((s) => s.id));
        return (
          <li key={id}>
            <button className="btn wide workshop-pick" onClick={() => (feel.tap(), useCity.getState().openWorkshop(id))}>
              <AwsIcon serviceId={w.serviceId} size={22} />
              <span>
                <b>{w.title}</b>
                <span className="muted small">
                  {' '}
                  · {w.minutes} min · {st.finished ? '🏅 finished' : `${st.done}/${st.of} steps`}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
