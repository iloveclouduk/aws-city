import { useRef } from 'react';
import { order, type OrderPanel } from '@/learning/stations';
import { feel } from '../../feedback';
import { Plain } from '../../Term';
import { useStation, type StationProps } from './useStation';

/** Order: move the steps into the order they happen (↑ ↓ or drag), then Check. It says how many are in place. */
export function OrderStation(props: StationProps<OrderPanel>) {
  const { panel, seed } = props;
  const { state, dispatch, over } = useStation(order.step, () => order.deal(panel, seed), order, props);
  const dragFrom = useRef<number>(undefined);
  const move = (from: number, to: number) => (feel.tap(), dispatch({ type: 'move', from, to }));
  const n = panel.steps.length;
  return (
    <div className="st-order">
      <p className="st-count muted">
        Checks used {state.checks} of {panel.pass.maxChecks}
      </p>
      <ol className="st-list">
        {state.order.map((stepIdx, pos) => (
          <li
            key={stepIdx}
            className="st-row st-step"
            draggable={!over}
            onDragStart={() => (dragFrom.current = pos)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom.current !== undefined) move(dragFrom.current, pos);
              dragFrom.current = undefined;
            }}
          >
            <span className="st-pos" aria-hidden="true">
              {pos + 1}
            </span>
            <span className="st-row-text">
              <Plain text={panel.steps[stepIdx]!} />
            </span>
            <span className="st-choices">
              <button className="btn tiny" aria-label={`Move “${panel.steps[stepIdx]}” up`} disabled={over || pos === 0} onClick={() => move(pos, pos - 1)}>
                ↑
              </button>
              <button className="btn tiny" aria-label={`Move “${panel.steps[stepIdx]}” down`} disabled={over || pos === n - 1} onClick={() => move(pos, pos + 1)}>
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      <button
        className="btn"
        disabled={over || state.checked === state.order.join(',')}
        onClick={() => {
          if (order.rightPlaces(state) === n) feel.good();
          else feel.bad();
          dispatch({ type: 'check' });
        }}
      >
        Check
      </button>
      <p className="st-say" aria-live="polite">
        {state.lastRight !== undefined ? `${state.lastRight} of ${n} in the right place.` : ''}
      </p>
    </div>
  );
}
