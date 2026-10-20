// A Well-Architected review of the account, from the citizens' checks (shared/wa-rules.json, server/src/agents/
// findings.ts): one row per pillar, each check either flagging something open or not finding an issue. "No issue
// found" is all it can say: a setting the server couldn't read never raises a finding, so a pass isn't a guarantee.
// Pure; src/ui/WaReview.tsx renders it.
import type { CityFinding, PillarKey } from '@/backend/contract';
import { WA_RULES, type WaRule } from '@/world/citizens';
import { HEALTH_COST } from './selectors';

export const PILLAR_ORDER: PillarKey[] = ['operational', 'security', 'reliability', 'performance', 'cost', 'sustainability'];

export interface PillarReview {
  pillar: PillarKey;
  /** 0–100: 100 less each open finding's weight (high 15, medium 8, low 3), never below 0. */
  score: number;
  checks: { rule: WaRule; open: CityFinding[] }[];
}

export function waReview(findings: CityFinding[]): PillarReview[] {
  const open = findings.filter((f) => f.status === 'open');
  return PILLAR_ORDER.map((pillar) => {
    const checks = WA_RULES.filter((r) => r.pillar === pillar).map((rule) => ({ rule, open: open.filter((f) => f.ruleId === rule.id) }));
    const cost = checks.flatMap((c) => c.open).reduce((n, f) => n + HEALTH_COST[f.severity], 0);
    return { pillar, score: Math.max(0, 100 - cost), checks };
  });
}
