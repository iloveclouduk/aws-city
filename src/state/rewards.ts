// Every cosmetic the player owns (contract v2.15): what Daily Supply Drops gave, what season roads' steps gave, the
// monuments of finished Service Codex sets and (v2.16) the crate items bought with City Coins in Decorate. Read by
// Decorate (src/state/buildmode.ts: a reward is free to place), the crates (src/state/drops.ts: never a duplicate) and
// My City. Pure (tests/codex.test.ts, tests/drops.test.ts).
import type { Progress, SupplyDrops } from '@/backend/contract';
import { codexCosmetics } from './codex';
import { cosmeticById, DEFAULT_GLOW } from './cosmetics';
import { seasonCosmetics } from './season';

export const dropsOf = (p: Progress): SupplyDrops => p.drops ?? { owned: [] };

export function ownedCosmetics(p: Progress): Set<string> {
  const d = dropsOf(p);
  return new Set([...d.owned, ...(d.bought ?? []), ...seasonCosmetics(p), ...codexCosmetics(p)]);
}

export const ownsCosmetic = (p: Progress, id: string) => ownedCosmetics(p).has(id);

/** The City Lights colour picked (prefs.glow) if owned, else the warm default. */
export const glowColor = (p: Progress, pick?: string) => (pick && ownsCosmetic(p, pick) ? (cosmeticById(pick)?.color ?? DEFAULT_GLOW) : DEFAULT_GLOW);
