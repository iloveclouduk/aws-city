// @vitest-environment jsdom
// The loops on screen (round 3 step 2): the Daily Supply Drop on Home after a finished shift, claiming a season step,
// the window colour picker, the opt-in return note, and coins flying to the HUD's counter.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Progress } from '@/backend/contract';

const { useCity } = await import('@/state/store');
const { SupplyDrop, SeasonRoad, CityLights, ReturnNote, CRATE_SHAKE_MS } = await import('@/ui/Loops');
const { dayKey } = await import('@/state/progress');
const { seasonFor } = await import('@/state/season');

const T0 = '2026-10-19T10:00:00.000Z';
const base = (extra: Partial<Progress> = {}): Progress => ({ version: 2, landmarks: { s3: { discovered: true, xp: 0 } }, updatedAt: T0, ...extra });

beforeEach(() => {
  localStorage.clear();
  useCity.setState({ cityRegion: 'us-west-2', progress: base(), toasts: [], prefs: { chatter: false, stage: 'compact', simple: false } });
});
afterEach(() => cleanup());

describe('the loops on screen', () => {
  it('the crate waits for the shift, says it is free with the real chances, shakes a second, then opens once', () => {
    vi.useFakeTimers();
    const { rerender } = render(<SupplyDrop shiftDone={false} />);
    expect(screen.queryByText('Daily Supply Drop')).toBeNull();
    rerender(<SupplyDrop shiftDone />);
    expect(screen.getByText(/Free, nothing to buy/)).toBeTruthy();
    expect(screen.getByText(/What could be inside: Common 70% · Rare 25% · Epic 5%/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open the crate' }));
    // A second of shaking (nothing shown yet), then it pops open in its rarity's colour.
    expect(screen.getByLabelText('Daily Supply Drop').className).toMatch(/shaking/);
    act(() => void vi.advanceTimersByTime(CRATE_SHAKE_MS));
    vi.useRealTimers();
    const opened = screen.getByRole('status', { name: 'Daily Supply Drop' });
    expect(opened.textContent).toMatch(/Common|Rare|Epic/);
    expect(opened.className).toMatch(/rarity-(common|rare|epic)/);
    expect(useCity.getState().progress.drops?.last).toBe(dayKey());
    cleanup();
    render(<SupplyDrop shiftDone />);
    expect(screen.queryByRole('button', { name: 'Open the crate' })).toBeNull();
  });

  it('under reduced motion the crate opens at once (no shake)', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<SupplyDrop shiftDone />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the crate' }));
    expect(screen.getByRole('status', { name: 'Daily Supply Drop' }).className).not.toMatch(/shaking/);
    vi.unstubAllGlobals();
  });

  it('claims a reached season step', () => {
    const id = seasonFor(dayKey()).id;
    useCity.setState({ progress: base({ seasons: { [id]: { points: 20, claimed: [] } } }) });
    render(<SeasonRoad />);
    const claims = screen.getAllByRole('button', { name: 'Claim' });
    expect(claims).toHaveLength(2);
    act(() => fireEvent.click(claims[1]));
    expect(useCity.getState().progress.seasons?.[id]?.claimed).toEqual([1]);
    expect(screen.getAllByRole('button', { name: 'Claim' })).toHaveLength(1);
  });

  it('offers the window colours the player owns', () => {
    useCity.setState({ progress: base({ drops: { owned: ['glow-rose'] }, lights: { days: [dayKey()], total: 1, freezes: 0 } }) });
    render(<CityLights />);
    fireEvent.click(screen.getByRole('button', { name: /Rose windows/ }));
    expect(useCity.getState().prefs.glow).toBe('glow-rose');
    expect(screen.queryByRole('button', { name: /Mint windows/ })).toBeNull();
  });

  it('the return note is opt-in and shows once a day', () => {
    const p = base({ cards: { 's3-1': { ease: 2.5, interval: 1, reps: 1, due: Date.now() - 1000 } }, lights: { days: ['2020-01-01'], freezes: 0 } });
    useCity.setState({ progress: p });
    render(<ReturnNote jobs={false} />);
    expect(screen.queryByText(/Welcome back/)).toBeNull();
    cleanup();
    act(() => useCity.getState().setPref('returnNote', true));
    render(<ReturnNote jobs={false} />);
    expect(screen.getByText(/Welcome back! 1 card is ready/)).toBeTruthy();
    cleanup();
    render(<ReturnNote jobs={false} />);
    expect(screen.queryByText(/Welcome back/)).toBeNull();
  });
});
