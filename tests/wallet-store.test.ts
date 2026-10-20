// Where City Coins come from in the store (contract v2.14): mini-game rounds (half after the day's full rounds),
// workshop steps, side jobs; spending; the one-time decor refund on load; and the chat's daily-cap note.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Progress } from '@/backend/contract';
import { useCity } from '@/state/store';
import { COIN_PAY, coins } from '@/state/wallet';
import { countRound, FULL_ROUNDS_A_DAY } from '@/learning/gameStars';
import { WORKSHOPS } from '@/world/workshops';
import { ALL_TASKS } from '@/world/clients';

const T0 = '2026-10-19T10:00:00.000Z';
const s = () => useCity.getState();
const fresh = (extra: Partial<Progress> = {}): Progress => ({ version: 2, landmarks: {}, updatedAt: T0, ...extra });

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
  useCity.setState({ progress: fresh(), cityRegion: 'us-west-2', backendKind: 'mock', chats: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('earning and spending City Coins', () => {
  it('a scoring round pays coins, half after the day’s full rounds unless it’s a new best; a round of 0 pays none', () => {
    const paid: number[] = [];
    for (let i = 0; i < FULL_ROUNDS_A_DAY + 1; i++) {
      countRound('shield');
      paid.push(s().recordGame('shield', 10));
    }
    expect(paid).toEqual([...Array.from({ length: FULL_ROUNDS_A_DAY }, () => COIN_PAY.round), Math.ceil(COIN_PAY.round / 2)]);
    countRound('shield');
    expect(s().recordGame('shield', 50)).toBe(COIN_PAY.round); // a new best pays in full
    countRound('shield');
    expect(s().recordGame('shield', 0)).toBe(0);
    expect(coins(s().progress)).toBe(paid.reduce((a, b) => a + b, 0) + COIN_PAY.round);
  });

  it('a workshop step that pays stars pays coins once; doing it again pays nothing', () => {
    const w = WORKSHOPS[0];
    s().workshopStep(w.id, w.steps[0].id, 'practice');
    expect(coins(s().progress)).toBe(COIN_PAY.workshopStep);
    s().workshopStep(w.id, w.steps[0].id, 'practice');
    expect(coins(s().progress)).toBe(COIN_PAY.workshopStep);
  });

  it('a side job pays coins once ever, with stars', () => {
    const job = ALL_TASKS.find((t) => t.level.level === 1)!;
    // Put up the job's services so it's open.
    useCity.setState({ progress: fresh({ cities: { 'us-west-2': { landmarks: Object.fromEntries(job.task.services.map((id) => [id, { discovered: true, xp: 0 }])) } } }) });
    const stars = s().clientTaskDone(job.task.id);
    expect(stars).toBeGreaterThan(0);
    expect(coins(s().progress)).toBeGreaterThanOrEqual(COIN_PAY.job);
    const after = coins(s().progress);
    expect(s().clientTaskDone(job.task.id)).toBe(0);
    expect(coins(s().progress)).toBe(after);
  });

  it('spendCoins spends only what there is', () => {
    s().earnCoins(20, 'test');
    expect(s().spendCoins(25)).toBe(false);
    expect(s().spendCoins(15)).toBe(true);
    expect(coins(s().progress)).toBe(5);
  });

  it('loading a save with decorations bought by stars gives those stars back as coins, once', () => {
    s().loadProgress(fresh({ decor: { 'us-west-2': { updatedAt: T0, props: [], spent: 40 } } }));
    expect(coins(s().progress)).toBe(40);
    expect(s().progress.decor!['us-west-2'].spent).toBeUndefined();
    s().loadProgress(s().progress);
    expect(coins(s().progress)).toBe(40);
  });

  it('an answer notes the stars it paid, then the friendly daily-cap line', () => {
    const answer = (n: number) => s().applyServerEvent({ type: 'chat.answer', requestId: `r${n}`, districtId: 'storage', agentId: 's3', delta: 'hi', done: true });
    for (let i = 0; i < 4; i++) answer(i);
    const list = s().chats.storage;
    expect(list.slice(0, 3).every((m) => m.stars === 5)).toBe(true);
    expect(list[3].capped).toBe(true);
  });
});
