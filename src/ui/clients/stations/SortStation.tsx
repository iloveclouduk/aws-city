import { sort, type SortPanel } from '@/learning/stations';
import { feel } from '../../feedback';
import { Plain } from '../../Term';
import { useStation, type StationProps } from './useStation';

/** Sort: one card at a time; tap (or press) the bin it belongs in. A wrong bin bounces it back with a hint. */
export function SortStation(props: StationProps<SortPanel>) {
  const { panel, seed } = props;
  const { state, dispatch, over } = useStation(sort.step, () => sort.deal(panel, seed), sort, props);
  const card = sort.current(state);
  const drop = (bin: string) => {
    if (!card) return;
    if (card.bin === bin) feel.good();
    else feel.bad();
    dispatch({ type: 'drop', bin });
  };
  return (
    <div className="st-sort">
      <p className="st-count muted">
        Card {Math.min(state.at + 1, state.order.length)} of {state.order.length} · mistakes {state.mistakes}/{panel.pass.maxMistakes}
      </p>
      {card && !over && (
        <div className={`st-card ${state.last && !state.last.right ? 'st-shake' : ''}`} key={`${state.at}-${state.mistakes}`}>
          <Plain text={card.text} />
        </div>
      )}
      <div className="st-bins" role="group" aria-label="Bins">
        {panel.bins.map((b) => (
          <button key={b.id} className="btn st-bin" disabled={!card || over} onClick={() => drop(b.id)}>
            <Plain text={b.label} still />
            <span className="st-bin-n">{state.order.slice(0, state.at).filter((i) => panel.items[i]!.bin === b.id).length}</span>
          </button>
        ))}
      </div>
      <p className="st-say" aria-live="polite">
        {state.hint ? `Not that one. ${state.hint}` : state.last?.right ? 'Right!' : ''}
      </p>
    </div>
  );
}
