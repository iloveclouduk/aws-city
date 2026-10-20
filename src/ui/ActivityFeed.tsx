import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { planDeploy, submitPrompt } from '@/app/runtime';
import { bus } from '@/state/bus';
import { nextAction } from '@/state/next';
import { agentName, useCity, type FeedItem, type TaskView } from '@/state/store';
import { agentOffer, liveStep, paidLine, taskPhase, taskStory } from '@/state/watch';
import { placeFor } from '@/world/places';
import { feel } from './feedback';
import { offlineReason } from './logic';
import { agentColor, Portrait } from './Portrait';
import type { OpenTab } from './QuestLog';
import { Plain } from './Term';

const TASK_LABEL = { routing: 'Finding an agent', running: 'Working', done: '✓ Done', failed: '✗ Didn’t work' } as const;
const STEP_ICON = { pending: '·', running: '▸', done: '✓', failed: '✗', skipped: '⤼' } as const;

/** The task's steps as a bar and a list, in step with the agent in the city. */
function Steps({ task }: { task: TaskView }) {
  return (
    <>
      <div className="segs" aria-hidden="true">
        {task.steps.map((s, i) => (
          <i key={i} className={s.status === 'done' || s.status === 'skipped' ? 'done' : s.status === 'running' ? 'now' : s.status === 'failed' ? 'fail' : ''} />
        ))}
      </div>
      <ol className="steps">
        {task.steps.map((s, i) => (
          <li key={i} className={s.status}>
            <span className="ico">{STEP_ICON[s.status]}</span> <Plain text={s.text} />
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * Watch it done (src/state/watch.ts): an agent's task as a short story. Before it starts, who will do what and where,
 * with Watch (the camera follows the agent and the card folds to one live line); while it runs, its steps in step with
 * the city; after, what was built, what it teaches, what it paid and the next step, and in the demo "See it in Deploy"
 * when the task matches a practice template. The AWS API calls (and the finished steps) wait behind "Details".
 * `openTab` (Home passes it) lets "See it in Deploy" open the Deploy tab. `quiet` (Simple mode's To-do list): no "Next"
 * button and no filled one, since the list under it holds the next step.
 */
export function TaskCard({ task, openTab, quiet = false }: { task: TaskView; openTab?: OpenTab; quiet?: boolean }) {
  const story = taskStory(task);
  const who = task.agentId ?? (task.status === 'routing' ? 'concierge' : story.agentId);
  const phase = taskPhase(task);
  const finished = phase === 'result' || phase === 'failed';
  const [details, setDetails] = useState(false);
  const [watching, setWatching] = useState(false);
  const [deploy, setDeploy] = useState<'idle' | 'asked' | 'link'>('idle');
  const done = task.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const calls = task.calls ?? [];
  // Honest labels: the demo backend only pretends to call AWS.
  const demo = useCity((s) => s.backendKind === 'mock');
  const linked = useCity((s) => s.account.linked);
  const offline = useCity((s) => offlineReason(s.backendKind, s.backendStatus));
  const progress = useCity((s) => s.progress);
  const cityRegion = useCity((s) => s.cityRegion);
  const clientFocus = useCity((s) => s.clientFocus);
  // The one next step (src/state/next.ts), read once the task is done.
  const next = useMemo(() => (phase === 'result' && !quiet ? nextAction({ progress, cityRegion, clientFocus }) : undefined), [phase, quiet, progress, cityRegion, clientFocus]);
  const now = liveStep(task);
  const showSteps = task.steps.length > 0 && (finished ? details : !watching || details);
  const hasDetails = calls.length > 0 || task.steps.length > 0;
  // A capped repeat still pays a few City Coins: say so, so watching again isn't dead time.
  const paid = [paidLine(task), task.coins ? `+${task.coins} City Coins for watching` : undefined].filter(Boolean).join(' · ') || undefined;
  const watch = () => {
    feel.tap();
    setWatching(true);
    bus.emit('flyTo', { id: `agent:${story.agentId}` });
  };
  const seeInDeploy = () => {
    if (!story.templateId) return;
    feel.send();
    // Like a quest's deploy step: the practice account must be linked first (the Deploy tab does that).
    if (!linked) setDeploy('link');
    else {
      planDeploy(story.templateId, task.taskId);
      setDeploy('asked');
    }
    openTab?.('deploy');
  };
  return (
    <div className={`task ${task.status} phase-${phase} ${showSteps ? '' : 'folded'}`} aria-live="polite">
      <div className="task-head">
        <Portrait id={who} size={30} />
        <div className="task-who">
          <b>{agentName(who)}</b>
          <span className={`task-state ${task.status}`}>
            {task.status === 'routing' || task.status === 'running' ? <span className="spinner" aria-hidden="true" /> : null}
            {TASK_LABEL[task.status]}
            {task.steps.length > 0 ? ` · ${task.status === 'running' ? `${done}/` : ''}${task.steps.length} steps` : ''}
          </span>
        </div>
        {!finished && (
          <button className={`btn tiny watch-btn ${watching ? 'on' : ''}`} aria-pressed={watching} onClick={watch} title={`Follow ${story.who} in the city`}>
            👀 {watching ? 'Watching' : 'Watch'}
          </button>
        )}
        {hasDetails && (finished || watching) && (
          <button className="btn ghost tiny" aria-expanded={details} onClick={() => setDetails((o) => !o)}>
            {details ? 'Hide' : finished ? 'Details' : 'Steps'}
          </button>
        )}
      </div>
      <div className="task-prompt">“{task.prompt}”</div>
      {phase === 'framing' && (
        <p className="watch-framing">
          <Plain text={story.framing} /> {story.watch}
        </p>
      )}
      {/* While watching, the card names the step the canvas shows (the walk there too), in step with its bubble. */}
      {!finished && watching && now && !details && (
        <p className="watch-live" aria-label={`Step ${now.index + 1} of ${now.of}`}>
          <span className="watch-count">
            {now.index + 1}/{now.of}
          </span>{' '}
          <Plain text={now.text} />
        </p>
      )}
      {phase === 'result' && (
        <div className="watch-result">
          {task.result && (
            <p className="task-result">
              <b>What {story.who} built:</b> <Plain text={task.result} />
            </p>
          )}
          {story.teaches && (
            <p className="watch-teaches">
              💡 <b>What it teaches:</b> <Plain text={story.teaches} />
            </p>
          )}
          {paid && <p className={`watch-paid ${task.capped ? 'capped' : ''}`}>{paid}</p>}
          <div className="actions">
            {demo && story.templateId && (
              <button className={`btn tiny ${quiet ? '' : 'primary'}`} disabled={!!offline || deploy === 'asked'} title={offline ?? 'Plan the real thing in the practice account: you see every change and approve it'} onClick={seeInDeploy}>
                {deploy === 'asked' ? '✓ Preview on its way in Deploy' : '🏗️ See it in Deploy'}
              </button>
            )}
            {next && (
              <button className={`btn tiny ${demo && story.templateId ? '' : 'primary'}`} onClick={() => (feel.tap(), nextAction(useCity.getState()).run())}>
                Next: {next.label} →
              </button>
            )}
          </div>
          {deploy === 'link' && <p className="muted small">Link the practice account in Deploy first, then press “See it in Deploy” again.</p>}
        </div>
      )}
      {phase === 'failed' && task.result && (
        <div className="task-result">
          <Plain text={task.result} />
        </div>
      )}
      {details && calls.length > 0 && (
        <div className="calls" aria-label="AWS API calls made">
          <span className="calls-label">{demo ? 'AWS calls (simulated)' : 'Real AWS calls'}</span>
          {calls.map((c) => (
            <code key={c} className="api">
              {c}
            </code>
          ))}
        </div>
      )}
      {showSteps && <Steps task={task} />}
    </div>
  );
}

/**
 * An agent offering to do something for you, told as a little story: who they are, what they'll do and where, and that
 * you can watch. "Watch it done" sends the task; its TaskCard takes over from there.
 */
export function AgentOffer({ serviceId, ask, onSent }: { serviceId: string; ask?: string; onSent?: () => void }) {
  const offer = agentOffer(serviceId);
  const offline = useCity((s) => offlineReason(s.backendKind, s.backendStatus));
  if (!offer) return null;
  const name = placeFor(serviceId)?.agentName ?? agentName(serviceId);
  return (
    <section className="agent-offer" aria-label={`${name} can help`}>
      <Portrait id={serviceId} size={30} />
      <div className="agent-offer-text">
        <b>{name}</b>
        {ask && <span className="agent-offer-ask">“{ask}”</span>}
        <span className="muted small">{offer.story}</span>
      </div>
      <button
        className="btn tiny primary"
        disabled={!!offline}
        title={offline ?? `Ask: “${offer.prompt}”`}
        onClick={() => {
          feel.send();
          submitPrompt(offer.prompt);
          onSent?.();
        }}
      >
        Watch it done
      </button>
    </section>
  );
}

/** One feed row. A run of lines from the same speaker shows their portrait once. */
function Line({ item, prev }: { item: FeedItem; prev?: FeedItem }) {
  const who = item.from ? agentName(item.from) : '';
  const target = item.from && item.from !== 'user' ? (item.from === 'concierge' ? 'plaza' : item.from) : undefined;
  const sameSpeaker = !!item.from && prev?.from === item.from && prev.kind !== 'system' && prev.kind !== 'user';
  const tint = { '--district': item.from ? agentColor(item.from) : undefined } as CSSProperties;
  // Rows that fly the camera to their agent are real buttons (keyboard reachable).
  const row = (cls: string, body: ReactNode) => {
    const inner = (
      <>
        {item.from && !sameSpeaker ? <Portrait id={item.from} size={24} /> : <span className="portrait-gap" aria-hidden="true" />}
        <span className="line-body">{body}</span>
      </>
    );
    return target ? (
      <li className={sameSpeaker ? 'cont' : undefined}>
        <button type="button" className={`line ${cls}`} style={tint} onClick={() => bus.emit('flyTo', { id: target })} title={`Show ${who} in the city`}>
          {inner}
        </button>
      </li>
    ) : (
      <li className={`line ${cls} ${sameSpeaker ? 'cont' : ''}`} style={tint}>
        {inner}
      </li>
    );
  };
  const name = sameSpeaker ? null : <b className="who">{who}</b>;
  switch (item.kind) {
    case 'user':
      return (
        <li className="line user">
          <span className="line-body">{item.text}</span>
        </li>
      );
    case 'message': {
      const to = item.to && item.to !== 'user' ? <span className="to"> → {agentName(item.to)}</span> : null;
      return row(
        'msg',
        <>
          {name}
          {to}
          {name || to ? <br /> : null}
          <Plain text={item.text} still={!!target} />
        </>,
      );
    }
    case 'state':
      // What the agent is calling right now (the real AWS API): a quiet mono tag, not a message.
      return row(
        'state',
        <>
          {name} <code className="api">{item.text}</code>
        </>,
      );
    case 'step':
      return row(
        'step',
        <>
          {name}
          {name ? <br /> : null}▸ <Plain text={item.text} still={!!target} />
        </>,
      );
    default:
      return (
        <li className="line sys">
          <span className="line-body">
            <Plain text={item.text} />
          </span>
        </li>
      );
  }
}

/** "Around town": what the agents said and did, newest first. Ambient chatter (and API names) only with chatter on. */
export function ActivityFeed() {
  const all = useCity((s) => s.feed);
  const chatter = useCity((s) => s.prefs.chatter);
  // API calls live on their task card; the feed keeps the conversation (chatter shows everything).
  const feed = useMemo(() => (chatter ? all : all.filter((f) => !f.ambient && f.kind !== 'state')), [all, chatter]);
  const lines = useMemo(() => [...feed].reverse(), [feed]);
  return (
    <div className="feed">
      {feed.length === 0 && <p className="quiet">Nothing yet. What the agents do shows up here.</p>}
      <ul className="lines">
        {lines.map((f, i) => (
          <Line key={f.id} item={f} prev={lines[i - 1]} />
        ))}
      </ul>
    </div>
  );
}
