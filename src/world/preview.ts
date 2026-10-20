// Next-level previews (plan round 3, Step 3): tapping a building shows a see-through ghost of its next level on the map
// and one line: "Next: Practitioner · adds “you pick the right instance family” · 2 reviews to go". Pure: it reads the
// growth (src/state/growth.ts) and the service's level texts (shared/world.json `tiers`).
import type { Progress } from '@/backend/contract';
import { growthOf } from '@/state/growth';
import { placeFor } from './places';

/** Stars a new card's review pays (src/learning/srs.ts xpFor; src/state/next.ts counts reviews the same way). */
export const REVIEW_STARS = 4;

export interface NextPreview {
  serviceId: string;
  tier: number;
  next: number;
  nextName: string;
  /** The next level's sprite (the ghost). */
  sprite: string;
  /** What the next level adds, from world.json `tiers` (lower-cased first letter), when the service says. */
  adds?: string;
  reviews: number;
  text: string;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The next level of a building put up in this city, or undefined (not put up, or fully grown: no ghost to show). */
export function nextLevelPreview(p: Progress, serviceId: string, region?: string, tierNow?: number): NextPreview | undefined {
  const g = growthOf(p, serviceId, region);
  const tier = tierNow ?? g.tier;
  if (tier < 0 || g.next === undefined || !g.nextName) return undefined;
  const next = tier + 1;
  const what = placeFor(serviceId)?.tiers[tier];
  const adds = what ? what.charAt(0).toLowerCase() + what.slice(1) : undefined;
  const reviews = Math.max(1, Math.ceil((g.next - g.xp) / REVIEW_STARS));
  const text = [`Next: ${g.nextName}`, adds && `adds “${adds}”`, `${plural(reviews, 'review')} to go`].filter(Boolean).join(' · ');
  return { serviceId, tier, next, nextName: g.nextName, sprite: `lm:${serviceId}:${next}`, adds, reviews, text };
}
