// @vitest-environment jsdom
// Decorate's drawer (build mode, src/ui/BuildDrawer.tsx), rendered for real: the palette, coin prices, locks, the tools and the keys.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';

const { useCity } = await import('@/state/store');
const { bus } = await import('@/state/bus');
const { BuildDrawer, BuildToggle } = await import('@/ui/BuildDrawer');
const { groundFor } = await import('@/state/buildmode');
const { legacyPlan } = await import('@/world/plan');

// 500 stars (never spent) and 40 City Coins (what decorations cost, contract v2.14).
const progress = (coins: number): Progress => ({ version: 2, landmarks: { s3: { discovered: true, xp: 500 } }, wallet: { earned: coins, spent: 0 }, updatedAt: '2026-10-19T10:00:00.000Z' }) as Progress;

beforeEach(() => useCity.setState({ cityRegion: 'us-west-2', progress: progress(40), build: undefined, view: { name: 'city' } }));
afterEach(() => cleanup());

describe('the build drawer', () => {
  it('is closed until Decorate is switched on, from the HUD button', () => {
    const { container } = render(
      <>
        <BuildToggle />
        <BuildDrawer />
      </>,
    );
    expect(container.querySelector('.build-drawer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Decorate/ }));
    expect(screen.getByRole('region', { name: 'Decorate' })).toBeTruthy();
    expect(screen.getByText('0/120')).toBeTruthy();
  });

  it('lists a category with prices, shows what unlocks a locked one, and picks an item', () => {
    useCity.getState().setBuild(true);
    render(<BuildDrawer />);
    expect(screen.getByRole('button', { name: /Oak tree.*5 City Coins/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Landmarks and play/ }));
    const statue = screen.getByRole('button', { name: /Statue/ }) as HTMLButtonElement;
    expect(statue.disabled).toBe(true);
    expect(statue.textContent).toMatch(/Locked\. Earn the .*First Crown/);
    fireEvent.click(screen.getByRole('button', { name: /Trees and flowers/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cherry blossom/ }));
    expect(useCity.getState().build?.kind).toBe('deco:cherry');
    expect(screen.getByRole('status').textContent).toMatch(/Tap a green tile to build cherry blossom/);
  });

  it('builds, counts, spends, undoes and leaves', () => {
    useCity.getState().setBuild(true);
    render(<BuildDrawer />);
    fireEvent.click(screen.getByRole('button', { name: /Oak tree/ }));
    const plan = legacyPlan();
    const ground = groundFor(plan, { districtOpen: () => true, taken: () => false });
    let spot = { x: 0, y: 0 };
    for (let y = 0; y < plan.size && !spot.x; y++) for (let x = 0; x < plan.size; x++) if (!ground(x, y)) (spot = { x, y }), (y = plan.size);
    let out: unknown;
    act(() => void (out = useCity.getState().buildAt(spot.x, spot.y, ground)));
    expect(out).toEqual({ ok: true, action: 'placed' });
    expect(useCity.getState().progress.decor?.['us-west-2']?.props).toHaveLength(1);
    expect(screen.getByText('1/120')).toBeTruthy();
    expect(screen.getByText('35')).toBeTruthy(); // 40 coins − 5
    expect(useCity.getState().progress.wallet).toMatchObject({ earned: 40, spent: 5 });
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(useCity.getState().progress.decor?.['us-west-2']?.props).toHaveLength(0);
    expect(screen.getByText('40')).toBeTruthy(); // the price comes back
    expect(screen.getByRole('status').textContent).toMatch(/Undone: Built: Oak tree/);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(useCity.getState().build).toBeUndefined();
  });

  it('passes its keys to the city: arrows move the ghost, R turns, Esc leaves', () => {
    useCity.getState().setBuild(true);
    useCity.getState().buildPick('deco:bench');
    render(<BuildDrawer />);
    const keys: string[] = [];
    const off = bus.on('buildKey', ({ key }) => keys.push(key));
    const drawer = screen.getByRole('region', { name: 'Decorate' });
    fireEvent.keyDown(screen.getByRole('button', { name: /Bench/ }), { key: 'ArrowLeft' });
    fireEvent.keyDown(drawer, { key: 'r' });
    fireEvent.click(screen.getByRole('button', { name: /Here/ }));
    expect(keys).toEqual(['left', 'turn', 'place']);
    useCity.getState().buildTurn();
    expect(useCity.getState().build?.kind).toBe('deco:bench-r');
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(useCity.getState().build).toBeUndefined();
    off();
  });

  it('a decoration needs coins, never stars', () => {
    useCity.setState({ progress: { ...progress(3), landmarks: { s3: { discovered: true, xp: 5000 } } } });
    useCity.getState().setBuild(true);
    render(<BuildDrawer />);
    expect(screen.getByRole('button', { name: /Oak tree/ }).getAttribute('title')).toMatch(/Needs 5 coins \(you have 3\)/);
  });

  it('build mode ends when the city is left', () => {
    useCity.getState().setBuild(true);
    useCity.getState().setView({ name: 'world' } as never);
    expect(useCity.getState().build).toBeUndefined();
  });
});
