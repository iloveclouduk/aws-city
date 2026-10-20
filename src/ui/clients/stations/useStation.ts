import { useEffect, useReducer, useRef } from 'react';

/** What every station panel gets from the runner. */
export interface StationProps<P> {
  panel: P;
  /** Deals the round (shuffles); a retry gets a fresh one. */
  seed: number;
  /** The clock ran out (never set under Games without a clock). */
  timeUp: boolean;
  /** The round is over: passed or failed. Called once. */
  onEnd: (passed: boolean) => void;
}

/**
 * Runs one station's pure reducer (src/learning/stations/) for a panel: the clock's end goes in as a `timeUp`
 * action, and the round's end (pass or fail) goes out once.
 */
export function useStation<S, A>(
  reducer: (s: S, a: A) => S,
  init: () => S,
  rules: { passed: (s: S) => boolean; failed: (s: S) => boolean },
  { timeUp, onEnd }: Pick<StationProps<unknown>, 'timeUp' | 'onEnd'>,
) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const ended = useRef(false);
  useEffect(() => {
    if (timeUp) dispatch({ type: 'timeUp' } as A);
  }, [timeUp]);
  const passed = rules.passed(state);
  const failed = rules.failed(state);
  useEffect(() => {
    if (ended.current || (!passed && !failed)) return;
    ended.current = true;
    onEnd(passed);
  }, [passed, failed, onEnd]);
  return { state, dispatch, over: passed || failed };
}
