// The Service Codex (contract v2.15 Progress.codex): one card per AWS service the player has put up in any city,
// collected in sets (shared/codex.json: Serverless Starter, the six Well-Architected pillars, exam sets by the districts
// each certification covers). A finished set gives its monument to place free in Decorate. Combos found
// (shared/combos.json, src/world/combos.ts) are a collection too, kept with the date each was first found.
// Pure (tests/codex.test.ts).
import data from '../../shared/codex.json' with { type: 'json' };
import type { CodexProgress, Progress } from '@/backend/contract';
import { CERTS } from '@/world/culture';
import { COMBOS } from '@/world/combos';
import { districtById, SERVICES, type DistrictId } from '@/world/taxonomy';
import { isDiscovered } from './selectors';

export interface CodexSet {
  id: string;
  name: string;
  icon: string;
  kind: 'starter' | 'pillar' | 'exam';
  /** starter and pillar sets: every one of these. */
  services?: string[];
  /** exam sets: the certification (shared/certifications.json) and how many cards from each of its districts. */
  cert?: string;
  perDistrict?: number;
  /** The monument it gives (a cosmetic id). */
  reward: string;
  source: string;
}

export const CODEX_SETS: CodexSet[] = (data as unknown as { sets: CodexSet[] }).sets;
export const SET_KIND_NAME: Record<CodexSet['kind'], string> = { starter: 'Starter set', pillar: 'Well-Architected pillar', exam: 'Exam set' };

/** Service cards collected: every service put up in any city, in the taxonomy's order. */
export const codexCards = (p: Progress) => SERVICES.filter((s) => isDiscovered(p, s.id)).map((s) => s.id);

export interface SetProgress {
  set: CodexSet;
  have: number;
  of: number;
  done: boolean;
  /** What's still missing: service ids, or "2 more from Compute Quarter" for an exam set. */
  missing: string[];
}

const districtsOf = (cert: string) => (CERTS.certifications.find((c) => c.id === cert)?.districts ?? []) as DistrictId[];

export function setProgress(p: Progress, set: CodexSet): SetProgress {
  const have = new Set(codexCards(p));
  if (set.kind === 'exam') {
    const need = set.perDistrict ?? 2;
    const ds = districtsOf(set.cert ?? '');
    let got = 0;
    const missing: string[] = [];
    for (const d of ds) {
      const n = Math.min(need, SERVICES.filter((s) => s.districtId === d && have.has(s.id)).length);
      got += n;
      if (n < need) missing.push(`${need - n} more from ${districtById(d)?.name ?? d}`);
    }
    const of = need * ds.length;
    return { set, have: got, of, done: of > 0 && got >= of, missing };
  }
  const list = set.services ?? [];
  const missing = list.filter((id) => !have.has(id));
  return { set, have: list.length - missing.length, of: list.length, done: list.length > 0 && !missing.length, missing };
}

export const allSets = (p: Progress) => CODEX_SETS.map((s) => setProgress(p, s));

/** Monuments earned by finished sets. */
export const codexCosmetics = (p: Progress) => allSets(p).flatMap((s) => (s.done ? [s.set.reward] : []));

/** Combos found, in combos.json order, with the day each was first found. */
export const combosCollected = (p: Progress) => COMBOS.filter((c) => p.codex?.combos[c.id]).map((c) => ({ combo: c, at: p.codex!.combos[c.id]! }));

/** The progress after finding combo `id` on `day` (unchanged when it's already in the Codex or isn't a combo). */
export function findCombo(p: Progress, id: string, day: string, now = new Date().toISOString()): Progress {
  if (p.codex?.combos[id] || !COMBOS.some((c) => c.id === id)) return p;
  return { ...p, codex: { combos: { ...p.codex?.combos, [id]: day } }, updatedAt: now };
}

/** Two copies: every combo found in either, the earlier day. */
export function mergeCodex(a: CodexProgress | undefined, b: CodexProgress | undefined): CodexProgress | undefined {
  if (!a || !b) return a ?? b;
  const combos: Record<string, string> = { ...a.combos };
  for (const [k, v] of Object.entries(b.combos)) combos[k] = combos[k] && combos[k] < v ? combos[k] : v;
  return { combos };
}
