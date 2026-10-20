import { describe, expect, it } from 'vitest';
import { slotsOf, tryPlace, type Placements } from '@/learning/diagram';
import { deckFor, EMPTY_DRAFT, parseDraft, serializeDraft } from '@/learning/puzzleDraft';
import { PUZZLES } from '@/world/content';

// An unfinished drawing waits for the player, and a brand-new player starts with a gentler deck.
const p = PUZZLES.find((x) => x.diagram && x.distractors.length > 1 && x.optional.length)!;

/** Every required spot filled with its own service. */
function filled(): Placements {
  let out: Placements = {};
  for (const s of slotsOf(p).filter((x) => x.required)) {
    const r = tryPlace(p, out, s.id, s.service);
    if (r.ok) out = r.placements;
  }
  return out;
}

describe('puzzle drafts', () => {
  it('a draft round-trips, and an empty one is not stored', () => {
    const d = { placements: filled(), drops: [p.distractors[0]], misdrops: 2, revealed: ['x'] };
    expect(Object.keys(d.placements).length).toBeGreaterThan(0);
    expect(parseDraft(p, serializeDraft(d))).toEqual(d);
    expect(serializeDraft(EMPTY_DRAFT)).toBeNull();
    expect(parseDraft(p, '')).toEqual(EMPTY_DRAFT);
  });

  it('anything unreadable or no longer valid is dropped, never trusted', () => {
    expect(parseDraft(p, '{not json')).toEqual(EMPTY_DRAFT);
    expect(parseDraft(p, '42')).toEqual(EMPTY_DRAFT);
    const slot = slotsOf(p)[0];
    const raw = JSON.stringify({ placements: { [slot.id]: p.distractors[0], 'no-such-spot': p.required[0] }, drops: ['not-a-decoy', 7], misdrops: -3, revealed: 'x' });
    expect(parseDraft(p, raw)).toEqual(EMPTY_DRAFT);
  });

  it('a first puzzle deals only what the design needs plus one decoy', () => {
    const first = deckFor(p, true);
    expect(first).toEqual([...new Set([...p.required, p.distractors[0]])]);
    expect(first.filter((s) => p.distractors.includes(s))).toHaveLength(1);
    const full = deckFor(p, false);
    for (const s of [...p.required, ...p.optional, ...p.distractors]) expect(full).toContain(s);
  });
});
