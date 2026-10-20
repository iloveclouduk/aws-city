import { describe, expect, it } from 'vitest';
import { ADVICE, cheapest, costOf, DAYS, PARTS, SLOTS, simulate, type Stack } from '@/learning/launch';
import { isSafeDocsUrl } from '@/app/runtime';

// Launch Day: every part's behaviour is cited, and the simulation rewards the right architecture for the right reason.
const day = (id: string) => DAYS.find((d) => d.id === id)!;
const stack = (over: Partial<Stack>): Stack => ({ ...cheapest(), ...over });
const lostTotal = (r: ReturnType<typeof simulate>) => r.reasons.reduce((n, x) => n + x.lost, 0);
const AWS_HOST = (u: string) => isSafeDocsUrl(u);

describe('Launch Day', () => {
  it('cites a real AWS page for every part, and every slot option exists', () => {
    for (const p of Object.values(PARTS)) expect(AWS_HOST(p.source), p.source).toBe(true);
    for (const s of SLOTS) for (const o of s.options) expect(PARTS[o], o).toBeTruthy();
    for (const a of Object.values(ADVICE)) expect(a.bp().id).toMatch(/^(OPS|SEC|REL|PERF|COST|SUS)\d{2}-BP\d{2}$/);
  });

  it('is deterministic and keeps its books: served plus lost is everything that came in', () => {
    const s = stack({});
    expect(simulate(s, day('viral'))).toEqual(simulate(s, day('viral')));
    const r = simulate(s, day('launch'));
    expect(Math.abs(r.served + lostTotal(r) - r.real)).toBeLessThan(r.real * 0.01);
  });

  it('one zone going dark takes a single-AZ stack down; two zones or Lambda + Multi-AZ keep it up', () => {
    const single = simulate(stack({}), day('viral'));
    expect(single.reasons.map((x) => x.reason)).toContain('compute-blip');
    // With compute that survives, a single-AZ database is what goes dark.
    expect(simulate(stack({ compute: 'lambda', data: 'rds-1az' }), day('viral')).reasons.map((x) => x.reason)).toContain('data-blip');
    const ha = simulate(stack({ edge: 'cloudfront', compute: 'lambda', cache: 'elasticache', data: 'rds-multiaz', buffer: 'sqs' }), day('viral'));
    expect(ha.availability).toBeGreaterThan(single.availability);
    expect(ha.reasons.find((x) => x.reason === 'compute-blip')).toBeUndefined();
  });

  it('a queue turns lost writes into late writes; a firewall stops a bot flood', () => {
    const noQueue = simulate(stack({ compute: 'ec2-2az' }), day('launch'));
    const queued = simulate(stack({ compute: 'ec2-2az', buffer: 'sqs' }), day('launch'));
    expect(queued.availability).toBeGreaterThanOrEqual(noQueue.availability);
    const open = simulate(stack({ edge: 'cloudfront', compute: 'lambda', data: 'dynamodb' }), day('attack'));
    const guarded = simulate(stack({ edge: 'cloudfront', guard: 'shield', compute: 'lambda', data: 'dynamodb' }), day('attack'));
    // Lambda and DynamoDB absorb the flood, but every bot request is billed: the firewall saves the money.
    expect(guarded.botsServed).toBeLessThan(open.botsServed / 10);
    expect(guarded.score).toBeGreaterThan(open.score);
  });

  it('a well-built stack fits each day\'s budget and earns an A', () => {
    const best = stack({ edge: 'cloudfront', guard: 'shield', compute: 'lambda', buffer: 'sqs', data: 'dynamodb' });
    for (const d of DAYS) {
      expect(costOf(best), d.id).toBeLessThanOrEqual(d.budget);
      expect(simulate(best, d).grade, d.id).toBe('A');
    }
  });
});
