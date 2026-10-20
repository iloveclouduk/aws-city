// The mini-games' question pools (shared/minigames.json): content is data, like quests and flashcards. Each item has a
// tier; a game deals from the tiers a player has reached, so regulars get the harder questions.
import json from '../../shared/minigames.json' with { type: 'json' };

export type StorageClass = 'standard' | 'ia' | 'glacier';
export interface Fish {
  name: string;
  hint: string;
  answer: StorageClass;
  why: string;
  tier: number;
}
export interface DnsQuestion {
  q: string;
  options: string[];
  answer: string;
  why: string;
  tier: number;
}
export type WafRule = 'sqli' | 'xss' | 'badinput' | 'bot' | 'rate';
export interface Attack {
  label: string;
  rule: WafRule;
  tier: number;
}

/** Red Team Range (AWS Security Agent): the flaws a penetration test looks for in your own app. */
export type Flaw = 'idor' | 'sqli' | 'xss' | 'cross-tenant' | 'no-auth' | 'secret-in-url';
export interface RedTeamRequest {
  id: string;
  /** One line of a request log, as the agent sees it. */
  line: string;
  /** The flaw it shows, or null for a request that's fine. */
  flaw: Flaw | null;
  tier: number;
}

const DATA = json as unknown as {
  fishing: Fish[];
  route53: DnsQuestion[];
  shield: { attacks: Attack[]; good: string[]; rules: Record<WafRule, { name: string; group: string }> };
  redteam?: { lesson: string; flaws: Record<Flaw, { name: string; simple: string; fix: string; source: string }>; requests: RedTeamRequest[] };
  queue: { lesson: string; source: string; messages: string[]; poison: string[] };
  iamgate: { lesson: string; source: string; waves: { role: string; policy: string[]; requests: { text: string; allow: boolean; why: string }[] }[] };
  edge: { lesson: string; source: string; files: { name: string; weight: number }[]; cities: string[] };
};
export const FISH = DATA.fishing;
export const DNS_QUESTIONS = DATA.route53;
export const SHIELD = DATA.shield;
export const QUEUE = DATA.queue;
export const IAM_GATE = DATA.iamgate;
export const EDGE = DATA.edge;
export const REDTEAM = DATA.redteam ?? { lesson: '', flaws: {} as Record<Flaw, { name: string; simple: string; fix: string; source: string }>, requests: [] };

/** The hardest tier a player has reached: 1 at first, 2 after two plays, 3 after five. */
export const tierFor = (plays: number) => (plays >= 5 ? 3 : plays >= 2 ? 2 : 1);

/**
 * `n` items for a round: shuffled from the tiers reached, with at least half from the top tier reached (so a regular
 * isn't dealt only easy ones), never repeating within the round.
 */
export function deal<T extends { tier: number }>(pool: T[], plays: number, n: number, rand: () => number = Math.random): T[] {
  const top = tierFor(plays);
  const shuffle = (xs: T[]) => xs.map((x) => ({ x, r: rand() })).sort((a, b) => a.r - b.r).map((o) => o.x);
  const hard = shuffle(pool.filter((x) => x.tier === top));
  const rest = shuffle(pool.filter((x) => x.tier < top));
  const want = top === 1 ? n : Math.ceil(n / 2);
  const picked = [...hard.slice(0, want), ...rest.slice(0, n - Math.min(want, hard.length))];
  return shuffle(picked.length < n ? [...picked, ...hard.slice(want)].slice(0, n) : picked);
}
