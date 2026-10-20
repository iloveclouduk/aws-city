import { scale, type ScalePanel } from '@/learning/stations';
import { feel } from '../../feedback';
import { Plain } from '../../Term';
import { useStation, type StationProps } from './useStation';

/** Scale: a stepper per time slot under a bar chart of demand against capacity, and the cost against the budget. */
export function ScaleStation(props: StationProps<ScalePanel>) {
  const { panel } = props;
  const { state, dispatch, over } = useStation(scale.step, () => scale.deal(panel), scale, props);
  const top = Math.max(...panel.slots.map((s) => s.demand), panel.max * panel.perUnit);
  const cost = scale.cost(state);
  const short = scale.short(state);
  const set = (slot: number, type: 'inc' | 'dec') => (feel.tap(), dispatch({ type, slot }));
  return (
    <div className="st-scale">
      <p className={`st-count ${cost > panel.budget ? 'st-bad' : 'muted'}`}>
        Cost {cost} of {panel.budget} coins · each of the {panel.unit} handles {panel.perUnit}
      </p>
      <ul className="st-list">
        {panel.slots.map((slot, i) => {
          const cap = scale.capacity(state, i);
          const units = state.units[i]!;
          return (
            <li key={slot.label} className="st-slot">
              <span className="st-slot-name">
                <Plain text={slot.label} />
              </span>
              <span className="st-bars" aria-hidden="true">
                <span className="st-demand" style={{ width: `${(slot.demand / top) * 100}%` }} />
                <span className={`st-cap ${short[i] ? 'st-bad' : ''}`} style={{ width: `${(cap / top) * 100}%` }} />
              </span>
              <span className="st-stepper">
                <button className="btn tiny" aria-label={`Fewer ${panel.unit} on ${slot.label}`} disabled={over || units <= panel.min} onClick={() => set(i, 'dec')}>
                  −
                </button>
                <span className="st-units" aria-label={`${units} ${panel.unit} on ${slot.label}: ${cap} of ${slot.demand} needed`}>
                  {units}
                </span>
                <button className="btn tiny" aria-label={`More ${panel.unit} on ${slot.label}`} disabled={over || units >= panel.max} onClick={() => set(i, 'inc')}>
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="st-legend muted" aria-hidden="true">
        <span className="st-key st-demand" /> needed <span className="st-key st-cap" /> you have
      </p>
      <p className="st-say" aria-live="polite">
        {short.some(Boolean) ? `${short.filter(Boolean).length} still short.` : cost > panel.budget ? 'Every slot is covered, but it costs too much.' : ''}
      </p>
    </div>
  );
}
