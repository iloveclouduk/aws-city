// Lambda Food Stall rules (pure: no Phaser, no store), so tests can play a Space-masher against an honest player.
// An order is invoked on a free chef: a warm one (provisioned, or still warm from its last order) serves fast, a cold
// one needs a cold start first. With every chef busy the call is throttled (max concurrency), and that costs.

export const STALL = {
  maxConcurrency: 4,
  /** A new order every this many ms. */
  spawnMs: 1100,
  timeoutMs: 9000,
  warmMs: 6000,
  /** How often an idle provisioned chef costs a coin (provisioned concurrency is billed while it waits). */
  idleBillMs: 8000,
  coldMs: 1800,
  runMs: 1200,
} as const;

export interface ChefState {
  busyUntil: number;
  warmUntil: number;
  provisioned: boolean;
}

export const newChef = (): ChefState => ({ busyUntil: 0, warmUntil: 0, provisioned: false });

/**
 * Invokes one order at `now`: the first free warm chef, else the first free one (a cold start); undefined when every
 * chef is busy (throttled). The chef is busy for the run (plus the cold start) and stays warm a while after.
 */
export function invokeChef<C extends ChefState>(chefs: C[], now: number): { chef: C; cold: boolean; ms: number } | undefined {
  const free = chefs.filter((c) => c.busyUntil <= now);
  if (!free.length) return undefined;
  const warm = free.find((c) => c.provisioned || c.warmUntil > now);
  const chef = warm ?? free[0];
  const ms = STALL.runMs + (warm ? 0 : STALL.coldMs);
  chef.busyUntil = now + ms;
  chef.warmUntil = now + ms + STALL.warmMs;
  return { chef, cold: !warm, ms };
}
