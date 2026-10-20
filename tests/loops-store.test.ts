// The loops in the store (contract v2.15, round 3 step 2; v2.16): learning lights a window, a finished shift fills the
// season road, steps are claimed (a freeze with the freezes full gives a look), the crate and the overtime crate open
// once a day, a combo found goes into the Codex once and pays coins (quietly too).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Progress } from '@/backend/contract';
import { useCity } from '@/state/store';
import { bus } from '@/state/bus';
import { dayKey } from '@/state/progress';
import { seasonFor, SHIFT_POINTS } from '@/state/season';
import { COIN_PAY, coins } from '@/state/wallet';
import { COMBOS } from '@/world/combos';

const T0 = '2026-10-19T10:00:00.000Z';
const s = () => useCity.getState();
const fresh = (extra: Partial<Progress> = {}): Progress => ({ version: 2, landmarks: {}, updatedAt: T0, ...extra });

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
  useCity.setState({ progress: fresh(), cityRegion: 'us-west-2', backendKind: 'mock', toasts: [], prefs: { chatter: false, stage: 'compact', simple: false } });
});
afterEach(() => vi.unstubAllGlobals());

describe('the loops in the store', () => {
  it('the day’s first learning lights tonight’s window, once', () => {
    const lit = vi.fn();
    const off = bus.on('windowLit', lit);
    s().noteLearning('cards');
    s().noteLearning('cards');
    off();
    expect(s().progress.lights).toEqual({ days: [dayKey()], total: 1, freezes: 0, freezesEarned: 0, freezesUsed: 0 });
    expect(lit).toHaveBeenCalledTimes(1);
    expect(s().progress.streak?.days).toBe(1);
  });

  it('a save from before v2.15 keeps its streak’s days as windows, then lights today', () => {
    const y = new Date(Date.now() - 86_400_000);
    const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    useCity.setState({ progress: fresh({ streak: { days: 4, last: yesterday, best: 4 } }) });
    s().noteLearning('cards');
    expect(s().progress.lights?.total).toBe(5);
  });

  it('a finished shift fills this month’s road once a day; a reached step is claimed once', () => {
    const id = seasonFor(dayKey()).id;
    expect(s().fillSeason([])).toBe(SHIFT_POINTS);
    expect(s().fillSeason([])).toBe(0);
    expect(s().progress.seasons?.[id]?.points).toBe(SHIFT_POINTS);
    expect(s().claimSeason(0)).toEqual({ kind: 'freeze' });
    expect(s().progress.lights?.freezes).toBe(1);
    expect(s().claimSeason(0)).toBeUndefined();
    expect(s().claimSeason(1)).toBeUndefined(); // not reached
    // A picked past road fills instead.
    s().setPref('road', 'serverless-spring');
    expect(s().fillSeason([])).toBe(0); // still once a day across every road
  });

  it('opens one crate a day: a cosmetic, no coins', () => {
    const r = s().openDrop()!;
    expect(r.item).toBeTruthy();
    expect(s().progress.drops?.owned).toEqual([r.item!.id]);
    expect(coins(s().progress)).toBe(0);
    expect(s().openDrop()).toBeUndefined();
  });

  it('a combo found goes into the Codex once, with a toast and COIN_PAY.combo', () => {
    const c = COMBOS[0];
    expect(s().discoverCombo(c.id)).toBe(true);
    expect(s().discoverCombo(c.id)).toBe(false);
    expect(s().discoverCombo('nope')).toBe(false);
    expect(s().progress.codex?.combos[c.id]).toBe(dayKey());
    expect(coins(s().progress)).toBe(COIN_PAY.combo);
    expect(s().toasts.map((t) => t.text).join(' ')).toMatch(new RegExp(`Combo found: ${c.name}`));
  });

  it('a combo found while the city slept goes into the Codex quietly: no toast or coin animation, but its coins are paid', () => {
    const c = COMBOS[1];
    const fly = vi.fn();
    const off = bus.on('coins', fly);
    expect(s().discoverCombo(c.id, { quiet: true })).toBe(true);
    off();
    expect(s().progress.codex?.combos[c.id]).toBe(dayKey());
    expect(coins(s().progress)).toBe(COIN_PAY.combo);
    expect(fly).not.toHaveBeenCalled();
    expect(s().toasts).toEqual([]);
    // Once ever, quiet or not.
    expect(s().discoverCombo(c.id, { quiet: true })).toBe(false);
    expect(coins(s().progress)).toBe(COIN_PAY.combo);
    expect(s().discoverCombo(c.id)).toBe(false);
  });

  it('a freeze step claimed with the freezes full gives a crate item instead (v2.16)', () => {
    const id = seasonFor(dayKey()).id;
    useCity.setState({ progress: fresh({ seasons: { [id]: { points: 10, claimed: [] } }, lights: { days: [], freezes: 3, freezesEarned: 3, freezesUsed: 0 } }) });
    const r = s().claimSeason(0)!;
    expect(r.kind).toBe('cosmetic');
    expect(s().progress.lights?.freezes).toBe(3);
    expect(s().toasts.map((t) => t.text).join(' ')).toMatch(/Place it free in Decorate/);
  });

  it('the overtime crate opens once a day, apart from the day’s crate', () => {
    expect(s().openDrop()).toBeTruthy();
    const ot = s().openDrop({ overtime: true })!;
    expect(ot.item).toBeTruthy();
    expect(s().progress.drops?.overtime).toBe(dayKey());
    expect(s().progress.drops?.owned).toHaveLength(2);
    expect(s().openDrop({ overtime: true })).toBeUndefined();
  });
});
