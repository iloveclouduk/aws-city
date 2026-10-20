import { route, type RoutePanel } from '@/learning/stations';
import { feel } from '../../feedback';
import { Plain } from '../../Term';
import { useStation, type StationProps } from './useStation';

/**
 * Reroute: each zone is an island with a load bar (dark when it's down); each flow is an arrow pointing at its zone.
 * Pick a flow, then a zone, to move it there.
 */
export function RouteStation(props: StationProps<RoutePanel>) {
  const { panel } = props;
  const { state, dispatch, over } = useStation(route.step, () => route.deal(panel), route, props);
  const loads = route.loads(state);
  const { dark, over: full } = route.problems(state);
  const pickedLabel = panel.flows.find((f) => f.id === state.picked)?.label;
  return (
    <div className="st-route">
      <div role="group" aria-label="Flows">
        {panel.flows.map((f) => {
          const at = panel.targets.find((t) => t.id === state.at[f.id]);
          return (
            <button
              key={f.id}
              className={`btn st-flow ${dark.includes(f.id) ? 'st-bad' : ''}`}
              aria-pressed={state.picked === f.id}
              disabled={over}
              onClick={() => (feel.tap(), dispatch({ type: 'flow', id: f.id }))}
            >
              <Plain text={f.label} still /> <span className="muted">(load {f.load})</span> <span aria-hidden="true">→</span> {at?.label}
              {dark.includes(f.id) && <span className="sr-only"> (that zone is down)</span>}
            </button>
          );
        })}
      </div>
      <div className="st-zones" role="group" aria-label="Zones">
        {panel.targets.map((t) => {
          const load = loads[t.id] ?? 0;
          const pct = Math.min(100, (load / Math.max(1, t.capacity)) * 100);
          return (
            <button
              key={t.id}
              className={`st-zone ${t.healthy ? '' : 'st-dark'} ${full.includes(t.id) ? 'st-bad' : ''}`}
              disabled={over || !state.picked}
              aria-label={`${t.label}: ${t.healthy ? 'healthy' : 'down'}, load ${load} of ${t.capacity}`}
              onClick={() => {
                if (!t.healthy) feel.bad();
                else feel.tap();
                dispatch({ type: 'target', id: t.id });
              }}
            >
              <b>{t.label}</b>
              <span className="muted">{t.healthy ? `${load} of ${t.capacity}` : 'down'}</span>
              <span className="st-meter" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      <p className="st-say" aria-live="polite">
        {pickedLabel
          ? `Where should “${pickedLabel}” go? Pick a zone.`
          : dark.length
            ? `${dark.length} ${dark.length === 1 ? 'flow points' : 'flows point'} at a zone that’s down.`
            : full.length
              ? 'A zone is carrying more than it can hold.'
              : 'Pick a flow to move it.'}
      </p>
    </div>
  );
}
