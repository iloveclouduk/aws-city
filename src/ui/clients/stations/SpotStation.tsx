import { spot, type SpotPanel } from '@/learning/stations';
import { feel } from '../../feedback';
import { useStation, type StationProps } from './useStation';

/** Spot: a log to read. Tap the lines that need a closer look, then Done. A wrong tap shows why it's fine. */
export function SpotStation(props: StationProps<SpotPanel>) {
  const { panel } = props;
  const { state, dispatch, over } = useStation(spot.step, () => spot.deal(panel), spot, props);
  const hint = state.wrong !== undefined ? panel.lines[state.wrong]?.hint : undefined;
  return (
    <div className="st-spot">
      <p className="st-count muted">
        {state.marked.filter(Boolean).length} marked · wrong taps {state.wrongTaps}/{panel.pass.maxWrongTaps}
      </p>
      {/* A scrolling log has to be reachable by keyboard to be read (axe scrollable-region-focusable). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="st-log" role="log" aria-label="Log lines" tabIndex={0}>
        {panel.lines.map((l, i) => (
          <button
            key={i}
            className={`st-line ${state.marked[i] ? 'st-marked' : ''} ${state.wrong === i ? 'st-shake' : ''}`}
            aria-pressed={state.marked[i]}
            disabled={over}
            onClick={() => {
              if (l.flag) feel.tap();
              else feel.bad();
              dispatch({ type: 'tap', line: i });
            }}
          >
            {l.text}
          </button>
        ))}
      </div>
      <button className="btn" disabled={over} onClick={() => (feel.tap(), dispatch({ type: 'done' }))}>
        Done
      </button>
      <p className="st-say" aria-live="polite">
        {hint ? `That one’s fine: ${hint}` : state.done && spot.missed(state) ? `${spot.missed(state)} still to find.` : ''}
      </p>
    </div>
  );
}
