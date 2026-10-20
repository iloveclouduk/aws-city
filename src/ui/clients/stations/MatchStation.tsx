import { match, type MatchPanel } from '@/learning/stations';
import { feel } from '../../feedback';
import { Plain } from '../../Term';
import { useStation, type StationProps } from './useStation';

/** Match: pick a card on the left, then its home on the right. A right pair locks; a wrong one shakes. */
export function MatchStation(props: StationProps<MatchPanel>) {
  const { panel, seed } = props;
  const { state, dispatch, over } = useStation(match.step, () => match.deal(panel, seed), match, props);
  const used = new Set(Object.values(state.matched));
  const pickRight = (id: string) => {
    if (!state.picked) return;
    if (panel.pairs[state.picked] === id) feel.good();
    else feel.bad();
    dispatch({ type: 'right', id });
  };
  const leftText = (id: string) => panel.left.find((l) => l.id === id)?.text ?? '';
  return (
    <div className="st-match">
      <p className="st-count muted">
        {Object.keys(state.matched).length} of {panel.left.length} paired · mistakes {state.mistakes}/{panel.pass.maxMistakes}
      </p>
      <div className="st-cols">
        <div role="group" aria-label="Things">
          {panel.left.map((l) => {
            const done = !!state.matched[l.id];
            const shake = state.wrong?.left === l.id;
            return (
              <button
                key={l.id}
                className={`btn st-pick ${done ? 'st-done' : ''} ${shake ? 'st-shake' : ''}`}
                aria-pressed={state.picked === l.id}
                disabled={done || over}
                onClick={() => (feel.tap(), dispatch({ type: 'left', id: l.id }))}
              >
                {done && <span aria-hidden="true">✓ </span>}
                <Plain text={l.text} still />
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Homes">
          {state.rightOrder.map((i) => {
            const r = panel.right[i]!;
            const done = used.has(r.id);
            const shake = state.wrong?.right === r.id;
            return (
              <button key={r.id} className={`btn st-pick ${done ? 'st-done' : ''} ${shake ? 'st-shake' : ''}`} disabled={done || over || !state.picked} onClick={() => pickRight(r.id)}>
                {done && <span aria-hidden="true">✓ </span>}
                <Plain text={r.text} still />
              </button>
            );
          })}
        </div>
      </div>
      <p className="st-say" aria-live="polite">
        {state.picked ? `Now pick the home for “${leftText(state.picked)}”.` : state.wrong ? 'Those two don’t go together. Try another pair.' : 'Pick a thing on the left first.'}
      </p>
    </div>
  );
}
