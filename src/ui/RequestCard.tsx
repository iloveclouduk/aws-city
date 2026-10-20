import { useEffect, useRef, useState } from 'react';
import { bus } from '@/state/bus';
import { growthLine, growthOf } from '@/state/growth';
import { dayKey } from '@/state/progress';
import { countRequest, REQUEST_LOG_KEY, THANKS_STARS, type CitizenRequest, type RequestLog } from '@/state/requests';
import { useCity } from '@/state/store';
import { feel } from './feedback';
import { readPref, writePref } from './logic';
import { ForLearners, Plain } from './Term';
import { useDialog, useShieldGame } from './useDialog';

/**
 * A citizen's question (src/state/requests.ts, raised by src/game/Requests.ts when Kai walks up): three answers in
 * simple words. Answering is a flashcard review for that building (right = good, wrong = again), and a right answer
 * adds a small thank-you. The card then says which building grew.
 */
/** Only an answered question uses up one of the day's five (closed unanswered, the citizen keeps their "?"). */
function countAnswer() {
  try {
    const v = JSON.parse(readPref(REQUEST_LOG_KEY) ?? 'null') as RequestLog | null;
    const log = v && typeof v.day === 'string' && typeof v.n === 'number' ? v : undefined;
    writePref(REQUEST_LOG_KEY, JSON.stringify(countRequest(log, dayKey())));
  } catch {
    /* storage unavailable */
  }
}

export function RequestCard() {
  const [ask, setAsk] = useState<{ request: CitizenRequest; name: string }>();
  const [picked, setPicked] = useState<number>();
  const box = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      bus.on('citizenRequest', (r) => {
        feel.tap();
        setPicked(undefined);
        setAsk(r);
      }),
    [],
  );
  // ✕, Esc and "Back to the city" close it; a tap on the scrim doesn't (one stray tap lost the question).
  const answeredRef = useRef(false);
  answeredRef.current = picked !== undefined;
  const close = () => {
    bus.emit('citizenRequestDone', { answered: answeredRef.current });
    setAsk(undefined);
  };
  useDialog(!!ask, box, close);
  // The backdrop is modal for the city too: a tap on it never selects a building, pans or walks Kai away.
  useShieldGame(!!ask, scrim);
  if (!ask) return null;
  const { request: r, name } = ask;
  const answered = picked !== undefined;
  const right = picked === r.right;
  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    countAnswer();
    const s = useCity.getState();
    s.reviewCard(r.cardId, i === r.right ? 'good' : 'again');
    if (i === r.right) {
      s.addXp(r.serviceId, THANKS_STARS);
      feel.good();
    } else feel.bad();
    bus.emit('answer', { serviceId: r.serviceId, ok: i === r.right });
  };
  const st = useCity.getState();
  return (
    <div ref={scrim} className="finding-scrim" role="presentation">
      <section ref={box} className="finding-card request-card" role="dialog" aria-modal="true" aria-labelledby="request-title">
        <header className="finding-head">
          <span className="incident-icon" aria-hidden="true">
            🙋
          </span>
          <div className="finding-who">
            <b id="request-title">{name} has a question</b>
            <span className="muted">Help out and the city grows</span>
          </div>
          <button className="btn icon ghost" aria-label="Close" onClick={close}>
            ✕
          </button>
        </header>
        <p className="request-q">
          <Plain text={r.question} />
        </p>
        <div className={`request-options ${answered && !right ? 'juice-wobble' : ''}`} role="group" aria-label="Answers">
          {r.options.map((o, i) => (
            <button
              key={i}
              className={`btn request-option ${answered && i === r.right ? 'right' : ''} ${answered && i === picked && !right ? 'wrong' : ''}`}
              disabled={answered && i !== picked && i !== r.right}
              aria-pressed={picked === i}
              onClick={() => choose(i)}
            >
              <Plain text={o} still />
            </button>
          ))}
        </div>
        {answered && (
          <div className="request-result" role="status">
            <p>
              <b>{right ? `Thanks! +${THANKS_STARS} ⭐` : 'Not quite, but now you both know.'}</b>
            </p>
            {!right && (
              <p>
                The answer: <Plain text={r.options[r.right]} />
              </p>
            )}
            <p className="muted">🏗️ {growthLine(growthOf(st.progress, r.serviceId, st.cityRegion))}</p>
            <ForLearners>
              <p>
                <Plain text={r.answer} />
              </p>
            </ForLearners>
            <button className="btn primary" onClick={close}>
              Back to the city
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
