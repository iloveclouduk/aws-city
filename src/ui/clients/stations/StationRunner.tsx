import { useCallback, useEffect, useRef, useState } from 'react';
import { stationSummary, type StationPanel } from '@/learning/stations';
import { useCity } from '@/state/store';
import { feel } from '../../feedback';
import { Plain } from '../../Term';
import { MatchStation } from './MatchStation';
import { OrderStation } from './OrderStation';
import { RotateStation } from './RotateStation';
import { RouteStation } from './RouteStation';
import { ScaleStation } from './ScaleStation';
import { SortStation } from './SortStation';
import { SpotStation } from './SpotStation';

/**
 * One City Clients station task (Among-Us style): its rules on top, a clock when the panel has one (Games without a
 * clock drops it, nothing else changes), the panel, and the result. A failed round can be tried again at once with a
 * fresh deal; `onPass` is called once, on the first pass (the caller pays the stars).
 */
export function StationRunner(props: { panel: StationPanel; title: string; onPass: () => void; onExit?: () => void }) {
  const { panel, title, onPass, onExit } = props;
  const relaxed = useCity((s) => !!s.prefs.relaxed);
  const clock = panel.timed && !relaxed ? panel.timed : 0;
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [result, setResult] = useState<'playing' | 'pass' | 'fail'>('playing');
  const [left, setLeft] = useState(clock);
  const paid = useRef(false);
  const pass = useRef(onPass);
  pass.current = onPass;

  useEffect(() => {
    if (!clock || result !== 'playing') return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [clock, result, seed]);

  const onEnd = useCallback((passed: boolean) => {
    setResult(passed ? 'pass' : 'fail');
    if (!passed) return void feel.bad();
    feel.win();
    if (!paid.current) {
      paid.current = true;
      pass.current();
    }
  }, []);

  const retry = () => {
    feel.tap();
    setSeed((s) => s + 1);
    setResult('playing');
    setLeft(clock);
  };

  const common = { seed, timeUp: !!clock && left <= 0, onEnd };
  return (
    <section className={`station station-${panel.kind}`} aria-label={`${stationSummary(panel.kind)}: ${title}`}>
      <div className="st-head">
        <p className="st-rules">
          <Plain text={panel.rules} />
        </p>
        {clock > 0 && (
          <span className={`st-clock ${left <= 10 ? 'st-low' : ''}`} role="timer" aria-label={`${left} seconds left`}>
            ⏱ {left}s
          </span>
        )}
      </div>
      {panel.kind === 'sort' && <SortStation key={seed} panel={panel} {...common} />}
      {panel.kind === 'match' && <MatchStation key={seed} panel={panel} {...common} />}
      {panel.kind === 'route' && <RouteStation key={seed} panel={panel} {...common} />}
      {panel.kind === 'rotate' && <RotateStation key={seed} panel={panel} {...common} />}
      {panel.kind === 'scale' && <ScaleStation key={seed} panel={panel} {...common} />}
      {panel.kind === 'spot' && <SpotStation key={seed} panel={panel} {...common} />}
      {panel.kind === 'order' && <OrderStation key={seed} panel={panel} {...common} />}
      {result !== 'playing' && (
        <div className={`st-result ${result === 'pass' ? 'st-pass' : 'st-fail'}`} role="status">
          <b>{result === 'pass' ? '✓ Task done!' : clock && left <= 0 ? 'Out of time.' : 'Not this time.'}</b>
          <span className="st-result-actions">
            {result === 'fail' && (
              <button className="btn primary tiny" onClick={retry}>
                Try again
              </button>
            )}
            {onExit && (
              <button className={`btn tiny ${result === 'pass' ? 'primary' : 'ghost'}`} onClick={onExit}>
                {result === 'pass' ? 'Continue' : 'Later'}
              </button>
            )}
          </span>
        </div>
      )}
    </section>
  );
}
