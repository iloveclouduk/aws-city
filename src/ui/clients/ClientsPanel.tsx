import { useRef } from 'react';
import { openDocs } from '@/app/runtime';
import { bus } from '@/state/bus';
import { useCity } from '@/state/store';
import { walkToStation } from '@/state/walk';
import {
  CLIENTS,
  clientById,
  clientName,
  clientProgress,
  currentLevel,
  levelCount,
  MAX_CLIENT_LEVEL,
  missingFor,
  TASK_ICON,
  TASK_VERB,
  type Business,
} from '@/world/clients';
import { openJobs } from '@/state/next';
import { placeFor } from '@/world/places';
import { serviceById } from '@/world/taxonomy';
import { AwsIcon } from '../AwsIcon';
import { feel } from '../feedback';
import { Plain } from '../Term';
import { useDialog, useShieldGame } from '../useDialog';

const EMOJI: Record<string, string> = {
  airport: '✈️', bank: '🏦', stadium: '🏟️', hospital: '🏥', shop: '🛍️', school: '🏫',
  studio: '🎬', games: '🎮', news: '📰', port: '⚓', energy: '⚡', factory: '🏭', farm: '🌾', carmaker: '🚗', telecom: '📡', council: '🏛️', hotel: '🏨', charity: '💝',
};
export const clientEmoji = (id: string) => EMOJI[id] ?? '🏢';

/** "3 of 5" with a bar, for a level's jobs. */
export function JobsBar({ done, of, label }: { done: number; of: number; label: string }) {
  return (
    <div className="jobs-bar">
      <div className="jobs-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={of} aria-valuenow={done} aria-valuetext={`${done} of ${of}`}>
        <span style={{ width: `${of ? (done / of) * 100 : 0}%` }} />
      </div>
      <span className="jobs-count">
        {done} of {of}
      </span>
    </div>
  );
}

/**
 * City Clients: the businesses in your city and their side jobs (store `clientsOpen`: a business id, or '' for the
 * list). A business shows its story, its level and the current level's jobs as a task list (Among Us style): each with
 * its station, ✓ when done, "Go" to walk Kai there (the job opens when he arrives), or "Put up <service> first".
 */
export function ClientsPanel() {
  const open = useCity((s) => s.clientsOpen);
  const box = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = () => useCity.getState().openClients(undefined);
  const shown = open !== undefined;
  useDialog(shown, box, close, closeBtn);
  useShieldGame(shown, scrim);
  if (!shown) return null;
  const b = open ? clientById(open) : undefined;
  return (
    <div ref={scrim} className="finding-scrim app-modal" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <section ref={box} className="finding-card clients-card" role="dialog" aria-modal="true" aria-labelledby="clients-title">
        <header className="finding-head">
          <span className="clients-emoji" aria-hidden="true">
            {b ? clientEmoji(b.id) : '🏢'}
          </span>
          <div className="finding-who">
            <b id="clients-title">{b ? clientName(b) : 'City clients'}</b>
            <span className="muted">{b ? `${b.domain} · side jobs` : 'Businesses in your city need help with AWS'}</span>
          </div>
          <button ref={closeBtn} className="btn icon ghost" aria-label="Close" onClick={close}>
            ✕
          </button>
        </header>
        {b ? <BusinessView b={b} /> : <BusinessList />}
      </section>
    </div>
  );
}

/**
 * The Jobs tab (App.tsx): the order board (jobs you can do now), then every business; a business picked (store
 * `openClients(id)`, which App routes here as `at`) shows its story and its level's jobs.
 */
export function ClientsBoard({ at }: { at: string }) {
  const b = at ? clientById(at) : undefined;
  if (b)
    return (
      <section className="clients-tab" aria-labelledby="clients-tab-title">
        <header className="clients-tab-head">
          <span className="clients-emoji" aria-hidden="true">
            {clientEmoji(b.id)}
          </span>
          <div>
            <h3 id="clients-tab-title">{clientName(b)}</h3>
            <span className="muted small">{b.domain} · jobs</span>
          </div>
        </header>
        <BusinessView b={b} />
      </section>
    );
  return (
    <div className="clients-tab">
      <OrderBoard max={5} title="Open jobs" />
      <h4 className="label">Every business</h4>
      <BusinessList />
    </div>
  );
}

/**
 * The order board: open jobs from the businesses (the one you're helping first), each with "Go → <station>" that walks
 * Kai to its station (the job opens when he's there). Home shows three; the Jobs tab a few more.
 */
export function OrderBoard({ max = 3, title = 'Order board', skip }: { max?: number; title?: string; skip?: string }) {
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const focus = useCity((s) => s.clientFocus);
  const jobs = openJobs(progress, region, focus, max + 1)
    .filter((j) => j.taskId !== skip)
    .slice(0, max);
  if (!jobs.length) return null;
  return (
    <section className="order-board" aria-label={title}>
      <h4 className="label">{title}</h4>
      <ul>
        {jobs.map((j) => (
          <li key={j.taskId} className="order">
            <span className="clients-emoji" aria-hidden="true">
              {clientEmoji(j.clientId)}
            </span>
            <span className="order-text">
              <b>{j.title}</b>
              <small className="muted">{j.client}</small>
            </span>
            <button className="btn tiny" onClick={() => (feel.tap(), walkToStation(j.taskId))}>
              Go → {j.station}
              <span className="sr-only"> for “{j.title}”</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BusinessList() {
  const progress = useCity((s) => s.progress);
  return (
    <ul className="clients-list">
      {CLIENTS.map((b) => {
        const lv = currentLevel(progress, b);
        const c = levelCount(progress, b, lv);
        const done = clientProgress(progress, b.id).level;
        return (
          <li key={b.id}>
            <button className="clients-row" onClick={() => (feel.tap(), useCity.getState().openClients(b.id))}>
              <span className="clients-emoji" aria-hidden="true">
                {clientEmoji(b.id)}
              </span>
              <span className="clients-row-text">
                <b>{clientName(b)}</b>
                <small className="muted">
                  {b.domain} · {lv ? `level ${lv.level}: ${lv.title}` : 'every job done'}
                </small>
                {lv && <JobsBar done={c.done} of={c.of} label={`${clientName(b)}: jobs done`} />}
              </span>
              <span className="lv" title={`${done} of ${MAX_CLIENT_LEVEL} levels`}>
                Lv {done}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** "How do I put up S3 Lake?": one line on how, since the button only flies there. */
export function putUpHow(serviceId: string) {
  const p = placeFor(serviceId);
  const place = p?.place ?? serviceById(serviceId)?.name ?? serviceId;
  return `How? Tap Show me to visit ${place}, then learn one of ${p?.agentName ? `${p.agentName}'s` : 'its'} cards: that puts it up.`;
}

function PutUpHow({ serviceId }: { serviceId: string }) {
  return <span className="job-how">{putUpHow(serviceId)}</span>;
}

function BusinessView({ b }: { b: Business }) {
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const lv = currentLevel(progress, b);
  const cp = clientProgress(progress, b.id);
  const done = new Set(cp.done);
  const c = levelCount(progress, b, lv);
  const go = (taskId: string) => {
    feel.tap();
    useCity.getState().openClients(undefined);
    walkToStation(taskId);
  };
  const putUp = (serviceId: string) => {
    feel.tap();
    useCity.getState().openClients(undefined);
    useCity.getState().select(serviceId);
    bus.emit('flyTo', { id: serviceId });
    bus.emit('select', { id: serviceId });
  };
  return (
    <div className="clients-body">
      <p className="clients-story">
        <Plain text={b.story} />
      </p>
      <div className="clients-level" aria-label={`Level ${cp.level} of ${MAX_CLIENT_LEVEL}`}>
        {b.levels.map((l) => (
          <span key={l.level} className={`clients-pip ${l.level <= cp.level ? 'on' : ''} ${l.level === lv?.level ? 'now' : ''}`} title={l.title} aria-hidden="true" />
        ))}
        <span className="muted small">
          Level {cp.level} of {MAX_CLIENT_LEVEL}
        </span>
      </div>
      {lv ? (
        <>
          <h4 className="clients-goal">
            Level {lv.level}: {lv.title}
          </h4>
          <p className="muted small">
            <Plain text={lv.goal} />
          </p>
          <JobsBar done={c.done} of={c.of} label={`Level ${lv.level} jobs done`} />
          <ul className="jobs" aria-label="Jobs">
            {lv.tasks.map((t) => {
              const ok = done.has(t.id);
              const missing = ok ? [] : missingFor(progress, t, region);
              return (
                <li key={t.id} className={`job ${ok ? 'done' : ''}`}>
                  <span className="job-mark" aria-hidden="true">
                    {ok ? '✓' : TASK_ICON[t.type]}
                  </span>
                  <span className="job-text">
                    <b>{t.title}</b>
                    <small className="muted">
                      📍 {t.station} · {TASK_VERB[t.type]} · +{t.stars} ⭐{ok ? ' · done' : ''}
                    </small>
                    {missing.length > 0 && (
                      <small className="job-need">
                        Put up {missing.map((s) => placeFor(s)?.place ?? serviceById(s)?.name ?? s).join(' and ')} first. <PutUpHow serviceId={missing[0]} />
                      </small>
                    )}
                    {t.starter && !ok && <small className="job-starter">⭐ Starter job: open from day one</small>}
                  </span>
                  {!ok &&
                    (missing.length ? (
                      <button className="btn tiny ghost" onClick={() => putUp(missing[0])} aria-label={`How do I put up ${placeFor(missing[0])?.place ?? missing[0]}? Show me`}>
                        <AwsIcon serviceId={missing[0]} size={14} /> Show me
                      </button>
                    ) : (
                      <button className="btn tiny" onClick={() => go(t.id)} aria-label={`Go to the ${t.station} for “${t.title}”`}>
                        Go →
                      </button>
                    ))}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="clients-all-done">🎉 Every job done. {clientName(b)} is thriving thanks to you.</p>
      )}
      <details className="clients-sources">
        <summary className="muted small">Where these jobs come from</summary>
        <ul>
          {b.sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                onClick={(e) => {
                  e.preventDefault();
                  openDocs(s.url);
                }}
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </details>
      <button className="btn ghost tiny" onClick={() => (feel.tap(), useCity.getState().openClients(''))}>
        ← All businesses
      </button>
    </div>
  );
}
