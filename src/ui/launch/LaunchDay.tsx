import { Coin } from '../icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { openDocs } from '@/app/runtime';
import { reducedMotion } from '@/game/motion';
import { countRound, FULL_ROUNDS_A_DAY, roundStars } from '@/learning/gameStars';
import { ADVICE, cheapest, costOf, DAYS, PARTS, servicesOf, simulate, SLOTS, TICKS, type PartId, type Result, type SlotId, type Stack } from '@/learning/launch';
import { practitioners } from '@/world/airport';
import { isDiscovered } from '@/state/selectors';
import { useCity } from '@/state/store';
import { placeFor } from '@/world/places';
import { iconPath } from '@/world/icons';
import { feel } from '../feedback';
import { Plain } from '../Term';
import { useDialog } from '../useDialog';

const TICK_MS = 160;
const GRADE_STARS = { A: 16, B: 11, C: 7, D: 3 } as const;
const STACK_KEY = 'awscity.launch.stack';

const loadStack = (): Stack => {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(STACK_KEY) ?? 'null') as Stack | null;
    if (v && SLOTS.every((s) => s.options.includes(v[s.id]))) return v;
  } catch {
    /* storage unavailable */
  }
  return cheapest();
};

/**
 * Launch Day: pick a day, build a stack from the services you've put up (within the day's budget), then watch the
 * traffic hit it, ten seconds a tick: rushes, a viral moment, an Availability Zone going dark, a bot flood. The debrief
 * says what lost requests and which part, and which best practice, would have held.
 */
export function LaunchDay() {
  const open = useCity((s) => s.launchOpen);
  const close = () => useCity.getState().openLaunch(false);
  const box = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useDialog(open, box, close, closeBtn);
  if (!open) return null;
  return (
    <div className="finding-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <section ref={box} className="finding-card launch-card" role="dialog" aria-modal="true" aria-labelledby="launch-title">
        <header className="finding-head">
          <span className="incident-icon" aria-hidden="true">
            🚀
          </span>
          <div className="finding-who">
            <b id="launch-title">Launch Day</b>
            <span className="muted">Build a stack. Survive the traffic.</span>
          </div>
          <button ref={closeBtn} className="btn icon ghost" aria-label="Close" onClick={close}>
            ✕
          </button>
        </header>
        <LaunchBody />
      </section>
    </div>
  );
}

function LaunchBody() {
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const level = practitioners(progress, region);
  const [dayId, setDayId] = useState(DAYS[0].id);
  const day = DAYS.find((d) => d.id === dayId)!;
  const [stack, setStack] = useState<Stack>(loadStack);
  const [info, setInfo] = useState<PartId>();
  const [result, setResult] = useState<Result>();
  const [at, setAt] = useState(0);
  const [paid, setPaid] = useState<{ each: number; coins: number; halved: boolean }>();
  const cost = costOf(stack);
  const has = (p: PartId) => !PARTS[p].serviceId || isDiscovered(progress, PARTS[p].serviceId!);
  const playing = !!result && at < TICKS;

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STACK_KEY, JSON.stringify(stack));
    } catch {
      /* storage unavailable */
    }
  }, [stack]);
  useEffect(() => {
    if (!result || at >= TICKS) return;
    const id = setTimeout(() => setAt((n) => n + 1), TICK_MS);
    return () => clearTimeout(id);
  }, [result, at]);
  // The day is over: grow the buildings that held it up (stars by grade, the usual daily rule), once.
  useEffect(() => {
    if (!result || at < TICKS || paid !== undefined) return;
    const s = useCity.getState();
    const best = s.progress.games?.launch?.best ?? 0;
    const services = servicesOf(stack);
    const roundsBefore = countRound('launch');
    const stars = roundStars(GRADE_STARS[result.grade], roundsBefore, result.score > best);
    const each = Math.max(1, Math.round(stars / Math.max(1, services.length)) + 1);
    for (const id of services) s.addXp(id, each);
    // A day that scored pays City Coins too (store.recordGame, contract v2.14).
    const coins = s.recordGame('launch', result.score);
    s.noteLearning('games');
    setPaid({ each, coins, halved: result.score <= best && roundsBefore >= FULL_ROUNDS_A_DAY });
    if (result.grade === 'A') feel.win();
    else feel.good();
  }, [result, at, paid, stack]);

  const launch = () => {
    feel.send();
    const r = simulate(stack, day);
    setPaid(undefined);
    setResult(r);
    setAt(reducedMotion() ? TICKS : 0);
  };
  const pick = (slot: SlotId, part: PartId) => {
    feel.tap();
    setInfo(part);
    setResult(undefined);
    setStack((s) => ({ ...s, [slot]: part }));
  };

  return (
    <>
      <div className="seg" role="group" aria-label="Day">
        {DAYS.map((d) => {
          const locked = level < d.unlock;
          return (
            <button key={d.id} aria-pressed={d.id === dayId} disabled={locked} onClick={() => (setDayId(d.id), setResult(undefined))} title={locked ? `${d.unlock} buildings at Practitioner open it` : d.simple}>
              {locked ? '🔒 ' : ''}
              {d.name}
            </button>
          );
        })}
      </div>
      <p>
        <Plain text={day.simple} />
      </p>
      <div className="launch-budget" role="meter" aria-valuemin={0} aria-valuemax={day.budget} aria-valuenow={cost} aria-label="Budget used">
        <span>
          Budget: <b>{cost}</b>/{day.budget}
        </span>
        <span className="workshop-progress">
          <i style={{ width: `${Math.min(100, (cost / day.budget) * 100)}%` }} />
        </span>
      </div>
      <ol className="launch-slots">
        {SLOTS.map((slot) => (
          <li key={slot.id}>
            <span className="label">{slot.label}</span>
            <div className="chips" role="group" aria-label={slot.label}>
              {slot.options.map((o) => {
                const p = PARTS[o];
                const over = cost - PARTS[stack[slot.id]].cost + p.cost > day.budget;
                const locked = !has(o);
                return (
                  <button
                    key={o}
                    className={`sb-piece ${stack[slot.id] === o ? 'on' : ''}`}
                    aria-pressed={stack[slot.id] === o}
                    disabled={locked || over || playing}
                    title={locked ? `Put up ${placeFor(p.serviceId!)?.place ?? p.name} in your city first` : over ? 'Over budget' : p.rule}
                    onClick={() => pick(slot.id, o)}
                  >
                    {p.serviceId && iconPath(p.serviceId) && <img src={iconPath(p.serviceId)} alt="" width={14} height={14} />}
                    {locked ? '🔒 ' : ''}
                    {p.name} {p.cost ? <span className="muted">· {p.cost}</span> : null}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {info && (
        <p className="muted small launch-info">
          <b>{PARTS[info].name}:</b> <Plain text={PARTS[info].rule} />{' '}
          <button className="chip-link" onClick={() => openDocs(PARTS[info].source)}>
            AWS docs ↗
          </button>
        </p>
      )}
      <button className="btn primary wide" disabled={playing} onClick={launch}>
        {result ? '↻ Launch again' : '🚀 Launch!'}
      </button>
      {result && <Timeline result={result} at={at} />}
      {result && at >= TICKS && <Debrief result={result} paid={paid} stack={stack} />}
    </>
  );
}

function Timeline({ result, at }: { result: Result; at: number }) {
  const shown = result.ticks.slice(0, at);
  const max = useMemo(() => Math.max(...result.ticks.map((t) => t.real), 1), [result]);
  const now = shown.at(-1);
  const W = 300;
  const H = 70;
  const bw = W / TICKS;
  return (
    <figure className="launch-timeline" aria-label="The day, ten seconds a bar">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Served ${result.availability}% of requests`}>
        {result.ticks.map((t) => t.blip && <rect key={`b${t.t}`} x={t.t * bw} y={0} width={bw} height={H} fill="#e5676b22" />)}
        {result.ticks.map((t) => t.bots > 0 && <rect key={`x${t.t}`} x={t.t * bw} y={0} width={bw} height={4} fill="#e8c15a" />)}
        {shown.map((t) => {
          const hs = (t.served / max) * (H - 8);
          const hf = (t.failed / max) * (H - 8);
          return (
            <g key={t.t}>
              <rect x={t.t * bw + 0.5} y={H - hs} width={bw - 1} height={hs} fill="#5db39e" />
              <rect x={t.t * bw + 0.5} y={H - hs - hf} width={bw - 1} height={hf} fill="#e5676b" />
            </g>
          );
        })}
      </svg>
      <figcaption className="muted small">
        {now ? `${Math.round((now.t + 1) * 10)} s · ${now.served} served${now.failed ? `, ${now.failed} lost` : ''}${now.queue ? `, ${now.queue} waiting in the queue` : ''}${now.blip ? ' · a zone is dark' : ''}${now.bots ? ' · bot flood' : ''}` : 'Here comes the traffic…'}
      </figcaption>
    </figure>
  );
}

function Debrief({ result, paid, stack }: { result: Result; paid?: { each: number; coins: number; halved: boolean }; stack: Stack }) {
  return (
    <section className="launch-debrief" role="status" aria-label="How the day went">
      <p className="launch-grade">
        <span className={`grade grade-${result.grade}`}>{result.grade}</span> {result.availability}% of requests served · score {result.score}
      </p>
      {paid !== undefined && (
        <p className="muted small">
          {servicesOf(stack)
            .map((id) => placeFor(id)?.place ?? id)
            .join(', ')}{' '}
          grew {paid.each} ⭐ each
          {paid.coins ? (
            <>
              , and you earned {paid.coins} <Coin size={12} label="City Coins" />
            </>
          ) : null}
          .
          {paid.halved && ` Half stars after ${FULL_ROUNDS_A_DAY} launches a day: full stars again tomorrow, or beat your best!`}
        </p>
      )}
      {result.botsServed > 0 && <p className="muted small">Your stack served {result.botsServed.toLocaleString()} bot requests, and every one of those is billed.</p>}
      {result.reasons.length === 0 ? (
        <p className="ok-note">Not a single request lost. That's a Well-Architected launch.</p>
      ) : (
        <ul className="wa-checks">
          {result.reasons.map(({ reason, lost }) => {
            const a = ADVICE[reason];
            return (
              <li key={reason} className="flagged">
                <span aria-hidden="true">⚠️</span>
                <span>
                  <b>{lost.toLocaleString()} lost.</b> <Plain text={a.text} />
                </span>
                <button className="chip-link" onClick={() => openDocs(a.bp().url)} title={a.bp().title}>
                  {a.bp().id} ↗
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
