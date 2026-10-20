// The Service Codex (contract v2.15, src/state/codex.ts), the cosmetics owned (src/state/rewards.ts) and City Hall
// (src/state/cityhall.ts).
import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { allSets, CODEX_SETS, codexCards, codexCosmetics, combosCollected, findCombo, mergeCodex, setProgress } from '@/state/codex';
import { cosmeticById } from '@/state/cosmetics';
import { glowColor, ownedCosmetics, ownsCosmetic } from '@/state/rewards';
import { hallLevel, hallNext, HALL_LEVELS } from '@/state/cityhall';
import { CATALOGUE, forSale, lockedBecause, MARKET_PRICE, priceFor } from '@/state/buildmode';
import { RANKS } from '@/state/rank';
import { CERTS } from '@/world/culture';
import { COMBOS } from '@/world/combos';
import { serviceById } from '@/world/taxonomy';

const T = '2026-10-20T10:00:00.000Z';
const lm = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { discovered: true, xp: 0 }]));
const base = (extra: Partial<Progress> = {}): Progress => ({ version: 2, landmarks: {}, updatedAt: T, ...extra });

describe('the Service Codex', () => {
  it('its sets name real services, certifications and monuments, each with a source', () => {
    expect(new Set(CODEX_SETS.map((s) => s.id)).size).toBe(CODEX_SETS.length);
    expect(CODEX_SETS.filter((s) => s.kind === 'pillar')).toHaveLength(6);
    for (const s of CODEX_SETS) {
      expect(cosmeticById(s.reward)?.id.startsWith('mon-'), s.id).toBe(true);
      expect(s.source).toMatch(/^https:\/\/(docs\.)?aws\.amazon\.com\//);
      for (const id of s.services ?? []) expect(serviceById(id), `${s.id}: ${id}`).toBeTruthy();
      if (s.kind === 'exam') expect(CERTS.certifications.some((c) => c.id === s.cert), s.id).toBe(true);
    }
    for (const c of COMBOS) for (const id of c.services) expect(serviceById(id), `${c.id}: ${id}`).toBeTruthy();
  });

  it('collects a card per service put up anywhere, and finishes a set when every card is in', () => {
    const starter = CODEX_SETS.find((s) => s.id === 'serverless-starter')!;
    const some = base({ landmarks: lm('lambda', 's3') });
    expect(codexCards(some)).toEqual(expect.arrayContaining(['lambda', 's3']));
    const sp = setProgress(some, starter);
    expect(sp).toMatchObject({ have: 2, of: starter.services!.length, done: false });
    expect(sp.missing).toContain('dynamodb');
    // A card from another city counts too.
    const all = base({ landmarks: lm('lambda'), cities: { 'eu-west-1': { landmarks: lm(...starter.services!.filter((id) => id !== 'lambda')) } } });
    expect(setProgress(all, starter).done).toBe(true);
    expect(codexCosmetics(all)).toContain(starter.reward);
    expect(ownsCosmetic(all, starter.reward)).toBe(true);
  });

  it('an exam set needs cards from each district its certification covers', () => {
    const set = CODEX_SETS.find((s) => s.kind === 'exam')!;
    const sp = setProgress(base(), set);
    expect(sp.done).toBe(false);
    expect(sp.of).toBeGreaterThan(0);
    expect(sp.missing[0]).toMatch(/more from /);
    expect(allSets(base())).toHaveLength(CODEX_SETS.length);
  });

  it('keeps combos found with the first day, once', () => {
    const id = COMBOS[0].id;
    const p = findCombo(base(), id, '2026-10-20', T);
    expect(p.codex).toEqual({ combos: { [id]: '2026-10-20' } });
    expect(findCombo(p, id, '2026-10-21')).toBe(p);
    expect(findCombo(p, 'not-a-combo', '2026-10-21')).toBe(p);
    expect(combosCollected(p)).toEqual([{ combo: COMBOS[0], at: '2026-10-20' }]);
    expect(mergeCodex({ combos: { a: '2026-10-05', b: '2026-10-01' } }, { combos: { a: '2026-10-02', c: '2026-10-09' } })).toEqual({ combos: { a: '2026-10-02', b: '2026-10-01', c: '2026-10-09' } });
  });
});

describe('rewards owned', () => {
  it('gathers drops, claimed season steps and finished sets; a reward is free to place in Decorate once owned', () => {
    const p = base({ drops: { owned: ['snowman', 'glow-rose'] }, seasons: { 'serverless-spring': { points: 30, claimed: [1] } } });
    expect([...ownedCosmetics(p)].sort()).toEqual(['blossom', 'glow-rose', 'snowman']);
    const snow = CATALOGUE.find((it) => it.id === 'reward-snowman')!;
    expect(snow.price).toBe(0);
    // v2.16: a crate item not won yet can be bought in Decorate (a monument can't: it's won on a road or a Codex set).
    expect(lockedBecause(base(), 'us-east-1', snow)).toBeUndefined();
    expect(forSale(base(), snow)).toBe('snowman');
    expect(priceFor(base(), 'us-east-1', snow)).toEqual({ place: 0, buy: MARKET_PRICE.common, total: MARKET_PRICE.common });
    const mon = CATALOGUE.find((it) => it.id === 'reward-mon-bridge')!;
    expect(lockedBecause(base(), 'us-east-1', mon)).toMatch(/season road/);
    expect(lockedBecause(p, 'us-east-1', snow)).toBeUndefined();
    expect(forSale(p, snow)).toBeUndefined();
    expect(priceFor(p, 'us-east-1', snow).total).toBe(0);
    // The window colour picked counts only when owned.
    expect(glowColor(p, 'glow-rose')).toBe(cosmeticById('glow-rose')!.color);
    expect(glowColor(p, 'glow-mint')).not.toBe(cosmeticById('glow-mint')!.color);
  });
});

describe('City Hall', () => {
  it('levels with the rank, one per rank, and opens decorations and past seasons, never learning', () => {
    expect(HALL_LEVELS).toHaveLength(RANKS.length);
    expect(HALL_LEVELS.map((l) => l.seasons)).toEqual(RANKS.map((_, i) => i));
    expect(hallLevel(base(), 'us-east-1')).toBe(1);
    expect(hallNext(base(), 'us-east-1')).toMatch(/City Hall reaches level 2/);
    // Every rank-gated Decorate item is opened by some hall level.
    const opened = new Set(HALL_LEVELS.flatMap((l) => l.items.map((i) => i.id)));
    for (const it of CATALOGUE.filter((x) => x.unlock?.rank)) expect(opened.has(it.id), it.id).toBe(true);
  });
});
