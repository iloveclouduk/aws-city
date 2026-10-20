import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProgressStore } from '../src/contract/progress.js';

describe('progress the client actually sends (contract v2 / v2.3)', () => {
  const file = () => join(mkdtempSync(join(tmpdir(), 'awscity-progress-')), 'progress.json');
  const v2 = {
    version: 2,
    landmarks: { s3: { discovered: true, xp: 12 } },
    cards: { 's3-01': { interval: 3, ease: 2.5, due: 1_760_000_000_000, reps: 2 } },
    quests: { 'storage-static-site': { status: 'active', step: 1 } },
    puzzles: { thumbnails: { best: 83 } },
    games: { fishing: { best: 4, plays: 2 } },
    citizens: { 'citizen:security': { xp: 25 } },
    fixes: { 'f-0123456789abcdef': '2026-10-10T10:00:00.000Z' },
    updatedAt: '2026-10-10T10:00:00.000Z',
  };

  it('stores and returns v2 with citizens, so the level gate sees real XP', async () => {
    const store = createProgressStore(file());
    expect(await store.put(v2)).toEqual({ ok: true });
    expect((await store.get())?.citizens?.['citizen:security']?.xp).toBe(25);
  });

  it('stores and returns v2 with the learning streak, and rejects a bad streak', async () => {
    const store = createProgressStore(file());
    const withStreak = { ...v2, streak: { days: 3, last: '2026-10-10', best: 5 } };
    expect(await store.put(withStreak)).toEqual({ ok: true });
    expect(await store.get()).toEqual(withStreak);
    expect((await store.put({ ...v2, streak: { days: 3, last: '10/10/2026', best: 5 } })).ok).toBe(false);
    expect((await store.put({ ...v2, streak: { days: 0, last: '2026-10-10', best: 5 } })).ok).toBe(false);
    expect((await store.put({ ...v2, streak: { days: 1.5, last: '2026-10-10', best: 5 } })).ok).toBe(false);
    expect((await store.put({ ...v2, streak: { days: 3, last: '2026-10-10', best: 5, extra: 1 } })).ok).toBe(false);
  });

  it('stores each Region\'s own city (v2.7), and rejects a bad Region code', async () => {
    const store = createProgressStore(file());
    const withCities = { ...v2, landmarks: { iam: { discovered: true, xp: 3 } }, cities: { 'us-west-2': { landmarks: { s3: { discovered: true, xp: 12 } } }, 'eu-central-1': { landmarks: {} } } };
    expect(await store.put(withCities)).toEqual({ ok: true });
    expect(await store.get()).toEqual(withCities);
    expect((await store.put({ ...v2, cities: { Oregon: { landmarks: {} } } })).ok).toBe(false);
    expect((await store.put({ ...v2, cities: { 'us-west-2': { landmarks: {}, extra: 1 } } })).ok).toBe(false);
  });

  it('stores the bill switch (v2.5), and only as a boolean', async () => {
    const store = createProgressStore(file());
    expect(await store.put({ ...v2, bill: true })).toEqual({ ok: true });
    expect((await store.get())?.bill).toBe(true);
    expect((await store.put({ ...v2, bill: 'on' })).ok).toBe(false);
    expect((await store.put({ ...v2, bill: { on: true } })).ok).toBe(false);
  });

  it('stores remembered cards and games\' scored rounds and weekly timed best (v2.12), and rejects bad ones', async () => {
    const store = createProgressStore(file());
    const v212 = {
      ...v2,
      cards: { 's3-01': { interval: 8, ease: 2.5, due: 1_760_000_000_000, reps: 3, remembered: true } },
      games: { fishing: { best: 6, plays: 4, scored: 3, bestTimed: 5, bestWeek: '2026-W42' }, shield: { best: 4, plays: 2 } },
    };
    expect(await store.put(v212)).toEqual({ ok: true });
    expect(await store.get()).toEqual(v212);
    expect((await store.put({ ...v2, cards: { 's3-01': { interval: 8, ease: 2.5, due: 0, reps: 3, remembered: false } } })).ok).toBe(false);
    expect((await store.put({ ...v2, games: { fishing: { best: 6, plays: 4, bestWeek: '2026-42' } } })).ok).toBe(false);
    expect((await store.put({ ...v2, games: { fishing: { best: 6, plays: 4, scored: -1 } } })).ok).toBe(false);
  });

  it('stores golden tokens found (v2.9) as local dates only', async () => {
    const store = createProgressStore(file());
    const finds = { 'us-west-2:0': '2026-10-13', 'eu-west-2:5': '2026-10-01' };
    expect(await store.put({ ...v2, finds })).toEqual({ ok: true });
    expect((await store.get())?.finds).toEqual(finds);
    expect((await store.put({ ...v2, finds: { 'us-west-2:0': 'yesterday' } })).ok).toBe(false);
    expect((await store.put({ ...v2, finds: { 'us-west-2:0': true } })).ok).toBe(false);
  });

  it('stores workshops and talks (v2.10): step modes and local dates only', async () => {
    const store = createProgressStore(file());
    const workshops = { 'dynamodb-first-table': { steps: { create: 'real' as const, put: 'practice' as const }, done: '2026-10-17' } };
    const talks = { 'multi-tenant-saas': '2026-10-17' };
    expect(await store.put({ ...v2, workshops, talks })).toEqual({ ok: true });
    expect((await store.get())?.workshops).toEqual(workshops);
    expect((await store.put({ ...v2, workshops: { w: { steps: { s: 'cheat' } } } })).ok).toBe(false);
    expect((await store.put({ ...v2, workshops: { w: { steps: {}, extra: 1 } } })).ok).toBe(false);
    expect((await store.put({ ...v2, talks: { t: 'soon' } })).ok).toBe(false);
  });

  it('stores City Clients and build mode decorations (v2.13), and rejects bad ones', async () => {
    const store = createProgressStore(file());
    const clients = { bank: { level: 1, done: ['bank-1-ledger', 'bank-2-stream'], at: { '1': '2026-10-19' } }, airport: { level: 0, done: [] } };
    const decor = { 'us-west-2': { updatedAt: '2026-10-19T10:00:00.000Z', props: [{ id: 'd1', kind: 'deco:fountain', x: 12, y: -3, at: '2026-10-19' }], spent: 30 } };
    expect(await store.put({ ...v2, clients, decor })).toEqual({ ok: true });
    expect(await store.get()).toMatchObject({ clients, decor });
    expect((await store.put({ ...v2, clients: { bank: { level: 1, done: ['Bank 1'] } } })).ok).toBe(false);
    expect((await store.put({ ...v2, clients: { bank: { level: -1, done: [] } } })).ok).toBe(false);
    expect((await store.put({ ...v2, clients: { bank: { level: 1, done: [], at: { '1': 'today' } } } })).ok).toBe(false);
    expect((await store.put({ ...v2, clients: { bank: { level: 1, done: [], extra: 1 } } })).ok).toBe(false);
    expect((await store.put({ ...v2, decor: { Oregon: { updatedAt: '2026-10-19T10:00:00.000Z', props: [] } } })).ok).toBe(false);
    expect((await store.put({ ...v2, decor: { 'us-west-2': { updatedAt: '2026-10-19T10:00:00.000Z', props: [{ id: 'd1', kind: 'tree', x: 1.5, y: 0, at: '2026-10-19' }] } } })).ok).toBe(false);
    expect((await store.put({ ...v2, decor: { 'us-west-2': { updatedAt: '2026-10-19T10:00:00.000Z', props: [], spent: -5 } } })).ok).toBe(false);
    const many = Array.from({ length: 121 }, (_, i) => ({ id: `d${i}`, kind: 'tree', x: i % 40, y: 0, at: '2026-10-19' }));
    expect((await store.put({ ...v2, decor: { 'us-west-2': { updatedAt: '2026-10-19T10:00:00.000Z', props: many } } })).ok).toBe(false);
    const three = Object.fromEntries(['us-west-2', 'us-east-1', 'eu-west-1'].map((r) => [r, { updatedAt: '2026-10-19T10:00:00.000Z', props: many.slice(0, 100) }]));
    expect((await store.put({ ...v2, decor: three })).ok).toBe(false);
  });

  it('stores the City Coins wallet (v2.14), and rejects a bad one', async () => {
    const store = createProgressStore(file());
    const wallet = { earned: 140, spent: 60, log: [{ day: '2026-10-19', coins: 45 }], refunded: 30, shift: '2026-10-19' };
    expect(await store.put({ ...v2, wallet })).toEqual({ ok: true });
    expect((await store.get())?.wallet).toEqual(wallet);
    expect(await store.put({ ...v2, wallet: { earned: 0, spent: 0 } })).toEqual({ ok: true });
    // An older client's decorations still carry the stars they cost (`spent`): still accepted.
    expect(await store.put({ ...v2, decor: { 'us-west-2': { updatedAt: '2026-10-19T10:00:00.000Z', props: [], spent: 30 } } })).toEqual({ ok: true });
    expect((await store.put({ ...v2, wallet: { earned: 10, spent: 11 } })).ok).toBe(false);
    expect((await store.put({ ...v2, wallet: { earned: -1, spent: 0 } })).ok).toBe(false);
    expect((await store.put({ ...v2, wallet: { earned: 1.5, spent: 0 } })).ok).toBe(false);
    expect((await store.put({ ...v2, wallet: { earned: 5, spent: 0, shift: 'today' } })).ok).toBe(false);
    expect((await store.put({ ...v2, wallet: { earned: 5, spent: 0, coins: 5 } })).ok).toBe(false);
    expect((await store.put({ ...v2, wallet: { earned: 5, spent: 0, log: [{ day: 'today', coins: 5 }] } })).ok).toBe(false);
    expect((await store.put({ ...v2, wallet: { earned: 5, spent: 0, log: Array.from({ length: 32 }, () => ({ day: '2026-10-19', coins: 1 })) } })).ok).toBe(false);
  });

  it('stores City Lights, season roads, supply drops and the codex (v2.15), and rejects bad ones', async () => {
    const store = createProgressStore(file());
    const lights = { days: ['2026-10-18', '2026-10-19'], total: 9, freezes: 1, usedFreezes: ['2026-10-17'] };
    const seasons = { 'harvest-streams': { points: 25, claimed: [0, 1], last: '2026-10-19' } };
    const drops = { last: '2026-10-19', owned: ['snowman', 'glow-rose'] };
    const codex = { combos: { 'edge-arch': '2026-10-19' } };
    expect(await store.put({ ...v2, lights, seasons, drops, codex })).toEqual({ ok: true });
    const got = await store.get();
    expect([got?.lights, got?.seasons, got?.drops, got?.codex]).toEqual([lights, seasons, drops, codex]);
    expect(await store.put({ ...v2, lights: { days: [], freezes: 0 }, drops: { owned: [] }, codex: { combos: {} } })).toEqual({ ok: true });
    expect((await store.put({ ...v2, lights: { days: ['today'], freezes: 0 } })).ok).toBe(false);
    expect((await store.put({ ...v2, lights: { days: [], freezes: 4 } })).ok).toBe(false);
    expect((await store.put({ ...v2, lights: { days: Array.from({ length: 61 }, () => '2026-10-19'), freezes: 0 } })).ok).toBe(false);
    expect((await store.put({ ...v2, seasons: { s: { points: 1.5, claimed: [] } } })).ok).toBe(false);
    expect((await store.put({ ...v2, seasons: { s: { points: 1, claimed: [20] } } })).ok).toBe(false);
    expect((await store.put({ ...v2, drops: { owned: ['Big Prize!'] } })).ok).toBe(false);
    expect((await store.put({ ...v2, drops: { owned: [], coins: 5 } })).ok).toBe(false);
    expect((await store.put({ ...v2, codex: { combos: { 'edge-arch': 'yesterday' } } })).ok).toBe(false);
  });

  it('stores the v2.16 freeze counters, road extras, crate overtime/purchases/spares, per-city refunds and decor tombstones, and rejects bad ones', async () => {
    const store = createProgressStore(file());
    const lights = { days: ['2026-10-19'], total: 9, freezes: 1, freezesEarned: 3, freezesUsed: 2 };
    const seasons = { 'harvest-streams': { points: 100, claimed: [0, 1, 2, 3], last: '2026-10-19', extra: ['hedge-maze'] } };
    const drops = { last: '2026-10-19', owned: ['snowman'], overtime: '2026-10-19', bought: ['pocket-park'], spares: { snowman: 2 } };
    const wallet = { earned: 50, spent: 10, refunded: 30, refundedBy: { 'us-west-2': 25, 'eu-west-1': 5 } };
    const decor = { 'us-west-2': { updatedAt: '2026-10-19T10:00:00.000Z', props: [{ id: 'd1', kind: 'season:winter:deco:oak', x: 1, y: 2, at: '2026-10-19' }], gone: ['d0'] } };
    expect(await store.put({ ...v2, lights, seasons, drops, wallet, decor })).toEqual({ ok: true });
    const got = await store.get();
    expect([got?.lights, got?.seasons, got?.drops, got?.wallet, got?.decor]).toEqual([lights, seasons, drops, wallet, decor]);
    expect((await store.put({ ...v2, lights: { ...lights, freezesUsed: -1 } })).ok).toBe(false);
    expect((await store.put({ ...v2, seasons: { s: { points: 1, claimed: [], extra: ['Big Prize!'] } } })).ok).toBe(false);
    expect((await store.put({ ...v2, drops: { owned: [], spares: { snowman: 4 } } })).ok).toBe(false);
    expect((await store.put({ ...v2, drops: { owned: [], overtime: 'today' } })).ok).toBe(false);
    expect((await store.put({ ...v2, wallet: { earned: 1, spent: 0, refundedBy: { mars: 1 } } })).ok).toBe(false);
    expect((await store.put({ ...v2, decor: { 'us-west-2': { ...decor['us-west-2'], gone: Array.from({ length: 201 }, (_, i) => `d${i}`) } } })).ok).toBe(false);
  });

  it('still accepts v1, and rejects unknown fields or out-of-range values', async () => {
    const store = createProgressStore(file());
    expect(await store.put({ version: 1, landmarks: {}, updatedAt: '2026-01-01T00:00:00.000Z' })).toEqual({ ok: true });
    expect((await store.put({ ...v2, admin: true })).ok).toBe(false);
    expect((await store.put({ ...v2, citizens: { 'citizen:security': { xp: -1 } } })).ok).toBe(false);
  });
});
