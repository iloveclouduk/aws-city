import type { CSSProperties } from 'react';
import type { PuzzleScore } from '@/learning/scoring';
import { PILLARS, templateForPuzzle, type Puzzle } from '@/world/content';
import { TemplateView } from '../TemplateView';
import { serviceById } from '@/world/taxonomy';
import { placeFor } from '@/world/places';
import { passHint, type PuzzleReward } from '@/learning/puzzleRewards';
import { ForLearners, Plain } from '../Term';
import { openDocs } from '@/app/runtime';

const name = (id: string) => serviceById(id)?.name.replace(/^(Amazon|AWS) /, '') ?? id;

/** The score, (on a pass) why the design works in simple words, tips, then the pillar meters and best-practice ids for learners. */
export function ResultPanel({ puzzle, result, earned }: { puzzle: Puzzle; result: PuzzleScore; earned?: PuzzleReward }) {
  const hint = passHint(result, name);
  const grew = Object.entries(earned?.xp ?? {});
  const total = grew.reduce((n, [, x]) => n + x, 0);
  const tips = result.tips.slice(0, 3).map((tip) => ({ tip, bp: puzzle.pillarBonus[tip.pillar as keyof typeof puzzle.pillarBonus]?.bp }));
  return (
    <div className={`result ${result.passed ? 'pass' : 'fail'}`} role="status">
      <div className="result-head">
        <span className="px">{result.passed ? 'Well-Architected!' : 'Not yet'}</span>
        <span className="score">{result.score}</span>
      </div>
      {/* The rule, said out loud: a 50 isn't a broken board, it's a design that's missing a piece. */}
      {hint && <div className="result-rule">{hint}</div>}
      {grew.length > 0 && (
        <div className="result-grew">
          +{total} ⭐ {earned?.kind === 'try' ? 'for the pieces already right' : earned?.kind === 'first' ? 'first pass!' : 'a better design'} ·{' '}
          {grew.map(([id, x]) => `${placeFor(id)?.place ?? name(id)} +${x}`).join(' · ')}
        </div>
      )}
      {result.passed && (
        // A pass leads with why it works, in simple words; the full explanation is one tap away.
        <>
          <p>
            <Plain text={puzzle.simpleWhy ?? puzzle.why} />
          </p>
          {puzzle.simpleWhy && (
            <details className="tell-more">
              <summary>Tell me more</summary>
              <p className="tell-more-text">
                <Plain text={puzzle.why} />
              </p>
            </details>
          )}
        </>
      )}
      {result.missing.length > 0 && <div>Missing: {result.missing.map((s) => serviceById(s)?.name).join(', ')}</div>}
      {result.wrong.length > 0 && <div>Doesn’t fit: {result.wrong.map((s) => serviceById(s)?.name).join(', ')}</div>}
      {tips.map(({ tip }) => (
        <div key={tip.pillar} className="muted">
          💡 <Plain text={tip.tip} />
        </div>
      ))}
      {/* The framework's own words (pillar meters, best-practice ids like SEC08-BP04) are for whoever wants them. */}
      <ForLearners>
        <div className="pillars">
          {PILLARS.map((pl, i) => (
            <div key={pl.id} className="pillar" title={pl.summary} style={{ '--i': i } as CSSProperties}>
              <span>{pl.name}</span>
              <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={result.pillars[pl.id] ?? 0} aria-label={pl.name}>
                <i style={{ width: `${Math.max(4, result.pillars[pl.id] ?? 0)}%` }} />
              </div>
            </div>
          ))}
        </div>
        {tips.some((t) => t.bp) && (
          <p className="muted small">
            Well-Architected best practices:{' '}
            {tips.map(({ tip, bp }) =>
              bp ? (
                <button key={tip.pillar} className="chip-link" onClick={() => openDocs(bp.url)} title={`Well-Architected best practice ${bp.id}: ${bp.title}`}>
                  {bp.id} ↗
                </button>
              ) : null,
            )}
          </p>
        )}
      </ForLearners>
      {result.passed && (
        <>
          {puzzle.reference && (
            <p className="muted small">
              📚 Based on AWS's own guidance:{' '}
              <button className="chip-link" onClick={() => openDocs(puzzle.reference!.url)}>
                {puzzle.reference.title} ↗
              </button>
            </p>
          )}
          {/* What this design becomes when it's built: the quest's CloudFormation, to read or save. */}
          {templateForPuzzle(puzzle.id) && <TemplateView templateId={templateForPuzzle(puzzle.id)!.id} title={templateForPuzzle(puzzle.id)!.title} />}
        </>
      )}
    </div>
  );
}
