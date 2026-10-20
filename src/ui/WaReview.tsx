import { useState } from 'react';
import { openDocs } from '@/app/runtime';
import { waReview } from '@/state/review';
import { useCity } from '@/state/store';
import { PILLAR_LABEL } from '@/world/citizens';
import { feel } from './feedback';
import { Plain } from './Term';

/**
 * The Well-Architected review of your account: the six pillars, every check the citizens run, which one is flagging
 * something (tap it for the finding) and the official best practice behind each. Folded until asked for.
 */
export function WaReview() {
  const findings = useCity((s) => s.findings);
  const openFinding = useCity((s) => s.openFinding);
  const [shown, setShown] = useState(false);
  const pillars = waReview(Object.values(findings));
  return (
    <details className="wa-review" open={shown} onToggle={(e) => setShown((e.target as HTMLDetailsElement).open)}>
      <summary>Well-Architected review of your account</summary>
      <p className="muted small">
        <Plain text="Each pillar of the AWS Well-Architected Framework, and every check the citizens run on your account. 'No issue found' means the check didn't flag anything it could read." />
      </p>
      {pillars.map((p) => (
        <section key={p.pillar} className="wa-pillar" aria-label={PILLAR_LABEL[p.pillar]}>
          <div className="wa-pillar-head">
            <b>{PILLAR_LABEL[p.pillar]}</b>
            <span className="muted">{p.score}/100</span>
          </div>
          <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.score} aria-label={`${PILLAR_LABEL[p.pillar]} score`}>
            <i style={{ width: `${Math.max(4, p.score)}%` }} />
          </div>
          <ul className="wa-checks">
            {p.checks.map(({ rule, open }) => (
              <li key={rule.id} className={open.length ? 'flagged' : 'ok'}>
                <span aria-hidden="true">{open.length ? '⚠️' : '✅'}</span>
                {open.length ? (
                  <button className="btn ghost tiny" onClick={() => (feel.tap(), openFinding(open[0].id))}>
                    {rule.title} ({open.length})
                  </button>
                ) : (
                  <span>
                    {rule.title} <span className="muted">· no issue found</span>
                  </span>
                )}
                {rule.bp && (
                  <button className="chip-link" onClick={() => openDocs(rule.bp!.url)} title={rule.bp.title}>
                    {rule.bp.id} ↗
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </details>
  );
}
