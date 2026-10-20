import { useState } from 'react';
import { openDocs } from '@/app/runtime';
import { useCity } from '@/state/store';
import { EVENT, TALK_PASS, TALK_XP, TALKS, type Talk } from '@/world/conference';
import { placeFor } from '@/world/places';
import { AwsIcon } from './AwsIcon';
import { feel } from './feedback';
import { Plain } from './Term';
import { WorkshopList } from './Workshop';

const THEME_ICON: Record<Talk['theme'], string> = { agents: '🤖', careers: '🧭', saas: '🏢', delivery: '🚀', serverless: '⚡' };

/**
 * AWS North Hall: one stage per talk from the AWS North conference, summarised in our own words (speakers aren't
 * named; the transcripts were rough). Read a talk, answer its three questions, and the buildings it's about grow.
 */
export function NorthHall() {
  const talks = useCity((s) => s.progress.talks);
  const [open, setOpen] = useState<string>();
  const passed = TALKS.filter((t) => talks?.[t.id]).length;
  const talk = TALKS.find((t) => t.id === open);
  return (
    <div className="card culture north-hall">
      <h3>🎤 {EVENT} Hall</h3>
      <p className="muted">
        Talks from the {EVENT} conference, one stage each. Read a talk, answer three questions, and its buildings grow. {passed}/{TALKS.length} talks passed.
      </p>
      {talk ? (
        <TalkStage talk={talk} done={!!talks?.[talk.id]} onBack={() => setOpen(undefined)} />
      ) : (
        <ul className="workshop-list">
          {TALKS.map((t) => (
            <li key={t.id}>
              <button className="btn wide workshop-pick" onClick={() => (feel.tap(), setOpen(t.id))}>
                <span aria-hidden="true">{THEME_ICON[t.theme]}</span>
                <span>
                  <b>{t.title}</b>
                  <span className="muted small"> · {talks?.[t.id] ? '✓ passed' : `${t.check.length} questions`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TalkStage({ talk, done, onBack }: { talk: Talk; done: boolean; onBack: () => void }) {
  const [answers, setAnswers] = useState<(number | undefined)[]>(() => talk.check.map(() => undefined));
  const [result, setResult] = useState<string>();
  const right = talk.check.filter((c, i) => answers[i] === c.answer).length;
  const all = answers.every((a) => a !== undefined);
  const check = () => {
    if (right >= TALK_PASS) {
      const paid = useCity.getState().passTalk(talk.id);
      feel.win();
      setResult(paid ? `Passed: ${right}/3. ${talk.serviceIds.map((id) => placeFor(id)?.place ?? id).join(', ')} grew ${TALK_XP} ⭐ each.` : `Passed again: ${right}/3.`);
    } else {
      feel.bad();
      setResult(`${right}/3. Read the key ideas again, then try once more.`);
    }
  };
  return (
    <section className="talk-stage" aria-label={talk.title}>
      <button className="btn ghost tiny back-link" onClick={onBack}>
        ← All talks
      </button>
      <h4>{talk.title}</h4>
      <p>
        <Plain text={talk.simple} />
      </p>
      <p className="muted small">{talk.summary}</p>
      <ul className="talk-ideas">
        {talk.keyIdeas.map((k) => (
          <li key={k}>
            <Plain text={k} />
          </li>
        ))}
      </ul>
      <div className="talk-services">
        {talk.serviceIds.map((id) => (
          <button key={id} className="btn tiny" title={placeFor(id)?.place} onClick={() => (feel.tap(), useCity.getState().select(id))}>
            <AwsIcon serviceId={id} size={16} /> {placeFor(id)?.place ?? id}
          </button>
        ))}
      </div>
      <ol className="talk-check">
        {talk.check.map((c, i) => (
          <li key={c.q}>
            <p>{c.q}</p>
            <div className="chips" role="group" aria-label={c.q}>
              {c.options.map((o, k) => {
                const shown = result !== undefined;
                const cls = shown ? (k === c.answer ? 'good' : answers[i] === k ? 'bad' : '') : answers[i] === k ? 'primary' : '';
                return (
                  <button
                    key={o}
                    className={`btn tiny ${cls}`}
                    aria-pressed={answers[i] === k}
                    disabled={shown}
                    onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
            {result !== undefined && <p className="muted small">{c.why}</p>}
          </li>
        ))}
      </ol>
      {result === undefined ? (
        <button className="btn primary wide" disabled={!all} onClick={check}>
          {done ? 'Check again' : 'Check my answers'}
        </button>
      ) : (
        <>
          <p className={right >= TALK_PASS ? 'ok-note' : 'muted'}>{result}</p>
          <button className="btn wide" onClick={() => (setAnswers(talk.check.map(() => undefined)), setResult(undefined))}>
            Try the questions again
          </button>
        </>
      )}
      {talk.workshopIds.length > 0 && (
        <>
          <h4 className="label">Try it hands-on</h4>
          <WorkshopList ids={talk.workshopIds} progress={useCity.getState().progress.workshops} />
        </>
      )}
      <p className="muted small">
        Read more:{' '}
        {talk.sources.map((u, i) => (
          <button key={u} className="btn ghost tiny" onClick={() => openDocs(u)}>
            AWS docs {i + 1} ↗
          </button>
        ))}
      </p>
    </section>
  );
}
