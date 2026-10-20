// Rush hour, as the city sees it (src/world/couriers.ts isRushHour, at the scene's hour): the HUD's "🚦 Rush hour" chip
// reads it (useSyncExternalStore(subscribeRush, isRushNow)). Set by the city scene only; false until the city runs.

let on = false;
const subs = new Set<() => void>();

/** Is it rush hour in the city now? */
export const isRushNow = () => on;

/** Calls `fn` when rush hour starts or ends; returns the unsubscribe. */
export function subscribeRush(fn: () => void): () => void {
  subs.add(fn);
  return () => void subs.delete(fn);
}

/** The city scene: rush hour began (true) or ended (false). */
export function setRushHour(next: boolean) {
  if (next === on) return;
  on = next;
  for (const fn of subs) fn();
}
