// SM-2 lite spaced repetition: cards you miss come back soon, cards you know drift out to weeks.
import type { CardState, Progress } from '@/backend/contract';
import { cardsFor, questById, type Flashcard } from '@/world/content';

export type Grade = 'again' | 'good' | 'easy';
const DAY = 86_400_000;

export function review(prev: CardState | undefined, grade: Grade, now = Date.now()): CardState {
  const s = prev ?? { interval: 0, ease: 2.5, due: now, reps: 0 };
  if (grade === 'again') return { interval: 0, ease: Math.max(1.3, s.ease - 0.2), due: now + 60_000, reps: 0 };
  const ease = Math.min(3, Math.max(1.3, s.ease + (grade === 'easy' ? 0.15 : 0)));
  const interval = s.reps === 0 ? (grade === 'easy' ? 3 : 1) : s.reps === 1 ? (grade === 'easy' ? 7 : 3) : Math.round(s.interval * ease * (grade === 'easy' ? 1.3 : 1));
  return { interval, ease, due: now + interval * DAY, reps: s.reps + 1 };
}

export const isDue = (s: CardState | undefined, now = Date.now()) => !s || s.due <= now;

/**
 * Stars for a review: learning something new is worth more than re-confirming it. "New" means never reviewed before, not
 * reps = 0: Again resets reps, and rating a card Again then Good used to pay the new-card stars over and over. Again pays
 * nothing (it still counts as a review: the quest step and Today tick), so tapping "Didn't know" isn't a star farm.
 */
export const xpFor = (prev: CardState | undefined, grade: Grade) => (grade === 'again' ? 0 : prev ? 2 : 4);

/** When a card comes back, in words: "in a minute", "tomorrow", "in 3 days". */
export function backIn(s: CardState, now = Date.now()) {
  const days = Math.round((s.due - now) / DAY);
  if (days < 1) return 'in a minute';
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/** What the active quests' cards steps for this service still need (the most any one of them needs). */
export function questCardsNeeded(p: Progress, serviceId: string) {
  let need = 0;
  for (const [id, st] of Object.entries(p.quests ?? {})) {
    const step = st.status === 'active' ? questById(id)?.steps[st.step] : undefined;
    if (step?.kind === 'cards' && step.serviceId === serviceId) need = Math.max(need, step.count - (st.count ?? 0));
  }
  return need;
}

/**
 * Practice cards for a quest: when an open cards step for this service needs more cards than are due (or new), the deck
 * is topped up with cards already reviewed and not due yet, soonest first. Practice counts for the quest and pays the
 * reviewed-card stars, but leaves the card's schedule alone. `skip` holds cards already practised this sitting (they
 * go last, so the same card doesn't come round again while others wait).
 */
export function questPracticeDeck(p: Progress, serviceId: string, dueCount: number, skip: ReadonlySet<string> = new Set(), now = Date.now()): Flashcard[] {
  const short = questCardsNeeded(p, serviceId) - dueCount;
  if (short <= 0) return [];
  const waiting = cardsFor(serviceId)
    .filter((c) => p.cards?.[c.id] && !isDue(p.cards[c.id], now))
    .sort((a, b) => p.cards![a.id]!.due - p.cards![b.id]!.due);
  return [...waiting.filter((c) => !skip.has(c.id)), ...waiting.filter((c) => skip.has(c.id))].slice(0, short);
}
