import { describe, expect, it } from 'vitest';
import type { CityFinding } from '@/backend/contract';
import { PILLAR_ORDER, waReview } from '@/state/review';
import { WA_RULES } from '@/world/citizens';

const finding = (ruleId: string, severity: CityFinding['severity'], status: CityFinding['status'] = 'open') =>
  ({ id: `${ruleId}-x`, ruleId, severity, status, pillar: WA_RULES.find((r) => r.id === ruleId)!.pillar }) as CityFinding;

describe('Well-Architected review', () => {
  it('has every pillar, every rule once, and scores open findings by severity', () => {
    const r = waReview([finding('s3-public-access', 'high'), finding('ebs-default-encryption', 'medium', 'resolved')]);
    expect(r.map((p) => p.pillar)).toEqual(PILLAR_ORDER);
    expect(r.flatMap((p) => p.checks.map((c) => c.rule.id)).sort()).toEqual(WA_RULES.map((x) => x.id).sort());
    const sec = r.find((p) => p.pillar === 'security')!;
    expect(sec.score).toBe(85);
    expect(sec.checks.find((c) => c.rule.id === 'ebs-default-encryption')!.open).toEqual([]);
    expect(r.find((p) => p.pillar === 'cost')!.score).toBe(100);
  });
});
