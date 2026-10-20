import { rotate, type RotatePanel } from '@/learning/stations';
import { ROTATE_CHOICES, type RotateChoice } from '@/learning/stations/rotate';
import { feel } from '../../feedback';
import { Plain } from '../../Term';
import { useStation, type StationProps } from './useStation';

const LABEL: Record<RotateChoice, string> = { rotate: 'Rotate', retire: 'Retire', leave: 'Leave' };

/** Rotate: for each key or password, Rotate, Retire or Leave. A wrong pick shows the right one. */
export function RotateStation(props: StationProps<RotatePanel>) {
  const { panel, seed } = props;
  const { state, dispatch, over } = useStation(rotate.step, () => rotate.deal(panel, seed), rotate, props);
  const answered = Object.keys(state.answers).length;
  const last = Object.entries(state.answers).at(-1);
  return (
    <div className="st-rotate">
      <p className="st-count muted">
        Limit: {panel.maxAgeDays} days · {answered} of {panel.items.length} done · mistakes {state.mistakes}/{panel.pass.maxMistakes}
      </p>
      <ul className="st-list">
        {state.order.map((i) => {
          const it = panel.items[i]!;
          const a = state.answers[it.id];
          return (
            <li key={it.id} className="st-row">
              <span className="st-row-text">
                <Plain text={it.label} />
                <small className="muted">
                  {it.ageDays} days old · {it.inUse ? 'in use' : 'not used'}
                </small>
              </span>
              <span className="st-choices" role="group" aria-label={`What to do with ${it.label}`}>
                {ROTATE_CHOICES.map((c) => {
                  const cls = a ? (c === a.right ? 'st-right' : c === a.picked ? 'st-wrong' : '') : '';
                  return (
                    <button
                      key={c}
                      className={`btn tiny ${cls}`}
                      aria-pressed={a?.picked === c}
                      disabled={!!a || over}
                      onClick={() => {
                        if (rotate.rightChoice(panel, it) === c) feel.good();
                        else feel.bad();
                        dispatch({ type: 'pick', id: it.id, choice: c });
                      }}
                    >
                      {LABEL[c]}
                    </button>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="st-say" aria-live="polite">
        {last ? (last[1].picked === last[1].right ? 'Right.' : `Not quite: that one needed ${LABEL[last[1].right]}.`) : ''}
      </p>
    </div>
  );
}
