// @vitest-environment jsdom
// City Clients' station panels in React: the rules on top, the clock (gone under Games without a clock), a pass by
// buttons alone (keyboard players press the same buttons), onPass once, and Try again after a fail.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoutePanel, SortPanel } from '@/learning/stations';

const { useCity } = await import('@/state/store');
const { StationRunner } = await import('@/ui/clients/stations/StationRunner');

const SORT: SortPanel = {
  kind: 'sort',
  rules: 'Put each card in its bin. 30 seconds.',
  timed: 30,
  bins: [
    { id: 'a', label: 'Files' },
    { id: 'b', label: 'Rows' },
  ],
  items: [
    { text: 'A photo', bin: 'a', hint: 'Photos are files.' },
    { text: 'A balance', bin: 'b', hint: 'Balances are rows.' },
  ],
  pass: { maxMistakes: 0 },
};
const ROUTE: RoutePanel = {
  kind: 'route',
  rules: 'Move the flow off the dark zone.',
  timed: 20,
  targets: [
    { id: 'x', label: 'Zone X', healthy: false, capacity: 2 },
    { id: 'y', label: 'Zone Y', healthy: true, capacity: 2 },
  ],
  flows: [{ id: 'f', label: 'Orders', load: 1, start: 'x' }],
  pass: { noUnhealthy: true, noOverCapacity: true },
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useCity.setState({ prefs: { ...useCity.getState().prefs, relaxed: false } });
});

const card = () => screen.getByText(/^A (photo|balance)$/).textContent!;

describe('StationRunner', () => {
  it('shows the rules and a clock, passes with buttons alone, and pays once', () => {
    const onPass = vi.fn();
    render(<StationRunner panel={SORT} title="Sort it" onPass={onPass} />);
    expect(screen.getByText(/Put each card/)).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole('button', { name: card() === 'A photo' ? /Files/ : /Rows/ }));
    expect(screen.getByRole('status').textContent).toMatch(/Task done/);
    expect(onPass).toHaveBeenCalledTimes(1);
  });

  it('drops the clock under Games without a clock', () => {
    useCity.setState({ prefs: { ...useCity.getState().prefs, relaxed: true } });
    render(<StationRunner panel={SORT} title="Sort it" onPass={() => {}} />);
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('fails when the clock runs out, and Try again deals a fresh round', () => {
    vi.useFakeTimers();
    const onPass = vi.fn();
    render(<StationRunner panel={ROUTE} title="Reroute" onPass={onPass} />);
    act(() => vi.advanceTimersByTime(21_000));
    expect(screen.getByRole('status').textContent).toMatch(/Out of time/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Orders/ }));
    fireEvent.click(screen.getByRole('button', { name: /Zone Y/ }));
    expect(screen.getByRole('status').textContent).toMatch(/Task done/);
    expect(onPass).toHaveBeenCalledTimes(1);
  });
});
