// An architecture puzzle's unfinished design, kept per device so closing the panel never loses it, and the gentler
// deck a brand-new player starts with. Pure: the caller reads and writes the pref (src/ui/logic.ts readPref/writePref).
import type { Puzzle } from '@/world/content';
import { tryPlace, type Placements } from './diagram';

/** The pref key for one puzzle's draft. */
export const draftKey = (puzzleId: string) => `awscity.puzzleDraft.${puzzleId}`;

export interface PuzzleDraft {
  placements: Placements;
  /** Distractors already tried (they cost points, so a reload must not forget them). */
  drops: string[];
  misdrops: number;
  /** Spots whose card a hint has shown. */
  revealed: string[];
}

export const EMPTY_DRAFT: PuzzleDraft = { placements: {}, drops: [], misdrops: 0, revealed: [] };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * A stored draft, checked against the puzzle as it is now: each placement is replayed through the same rules as a drop
 * (a spot that moved or a card that no longer fits is dropped), and anything unreadable is an empty draft.
 */
export function parseDraft(p: Puzzle, raw: string | null): PuzzleDraft {
  if (!raw) return EMPTY_DRAFT;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return EMPTY_DRAFT;
  }
  if (!v || typeof v !== 'object') return EMPTY_DRAFT;
  const o = v as Record<string, unknown>;
  let placements: Placements = {};
  if (o.placements && typeof o.placements === 'object')
    for (const [slot, svc] of Object.entries(o.placements as Record<string, unknown>)) {
      if (typeof svc !== 'string') continue;
      const r = tryPlace(p, placements, slot, svc);
      if (r.ok) placements = r.placements;
    }
  const misdrops = typeof o.misdrops === 'number' && Number.isFinite(o.misdrops) ? Math.max(0, Math.floor(o.misdrops)) : 0;
  return {
    placements,
    drops: strings(o.drops).filter((s) => p.distractors.includes(s)),
    misdrops,
    revealed: strings(o.revealed),
  };
}

/** The draft to store, or null when there's nothing worth keeping (the caller removes the pref). */
export function serializeDraft(d: PuzzleDraft): string | null {
  const empty = !Object.keys(d.placements).length && !d.drops.length && !d.misdrops && !d.revealed.length;
  return empty ? null : JSON.stringify(d);
}

/**
 * The service cards dealt for a puzzle. A player who hasn't passed any puzzle yet gets a gentler first deck: only the
 * services the design needs plus one decoy (the first listed), so the first try teaches the drag, not the guessing.
 */
export function deckFor(p: Puzzle, firstPuzzle: boolean): string[] {
  const cards = firstPuzzle ? [...p.required, ...p.distractors.slice(0, 1)] : [...p.required, ...p.optional, ...p.distractors];
  return [...new Set(cards)];
}
