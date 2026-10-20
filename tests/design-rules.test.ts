import { describe, expect, it } from 'vitest';
import type { SavedDesign } from '@/backend/contract';
import { backwardArrows, designPasses, passGaps, reviewDesign } from '@/learning/designRules';

// The sandbox's Well-Architected review: rules on what's drawn and how it's wired, each citing a verified best practice.
type D = Pick<SavedDesign, 'nodes' | 'edges'>;
const n = (id: string, kind: string, x = 0, y = 0, w?: number, h?: number) => ({ id, kind, x, y, ...(w ? { w, h } : {}) });
const ids = (d: D) => reviewDesign(d).map((f) => f.id);

describe('sandbox design review', () => {
  it('reviews nothing on an empty board', () => {
    expect(reviewDesign({ nodes: [], edges: [] })).toEqual([]);
  });

  it('flags a single AZ and an internet-facing database, most severe first, each with a best practice', () => {
    const d: D = { nodes: [n('u', 'actor:users'), n('db', 'rds', 2, 2), n('pub', 'group:public', 1, 1, 3, 3), n('w', 'ec2', 3, 3)], edges: [{ from: 'u', to: 'db' }] };
    const f = reviewDesign(d);
    expect(f.slice(0, 2).map((x) => x.id).sort()).toEqual(['public-database', 'single-az']);
    for (const x of f) expect(x.bp.id).toMatch(/^(OPS|SEC|REL|PERF|COST|SUS)\d{2}-BP\d{2}$/);
  });

  it('reads the wiring: a DLQ arrow, users into API Gateway, and a firewall', () => {
    const base: D = { nodes: [n('u', 'actor:users'), n('api', 'apigateway'), n('q', 'sqs'), n('fn', 'lambda'), n('cw', 'cloudwatch')], edges: [{ from: 'u', to: 'api' }, { from: 'api', to: 'q' }, { from: 'q', to: 'fn' }] };
    expect(ids(base)).toEqual(expect.arrayContaining(['queue-no-dlq', 'no-waf', 'no-auth']));
    const better: D = {
      nodes: [...base.nodes, n('dlq', 'sqs'), n('waf', 'shield'), n('auth', 'cognito')],
      edges: [...base.edges, { from: 'q', to: 'dlq' }],
    };
    expect(ids(better)).not.toEqual(expect.arrayContaining(['queue-no-dlq']));
    expect(ids(better)).not.toContain('no-waf');
    expect(ids(better)).not.toContain('no-auth');
    expect(designPasses(better)).toBe(true);
  });

  it('two AZs clear the single-AZ finding', () => {
    const d: D = { nodes: [n('a', 'group:az', 0, 0, 2, 2), n('b', 'group:az', 3, 0, 2, 2), n('w', 'ec2', 0, 0), n('w2', 'ec2', 3, 0), n('cw', 'cloudwatch', 6, 0)], edges: [] };
    expect(ids(d)).not.toContain('single-az');
  });

  it('an arrow against every flow that wires those services is backwards, and fails the pass (shared/flows.json)', () => {
    const right: D = {
      nodes: [n('api', 'apigateway'), n('fn', 'lambda', 1), n('db', 'dynamodb', 2), n('cw', 'cloudwatch', 3), n('waf', 'shield', 4), n('auth', 'cognito', 5)],
      edges: [{ from: 'api', to: 'fn' }, { from: 'fn', to: 'db' }],
    };
    expect(backwardArrows(right)).toEqual([]);
    expect(designPasses(right)).toBe(true);
    const wrong: D = { ...right, edges: [{ from: 'db', to: 'fn' }, { from: 'fn', to: 'api' }] };
    expect(backwardArrows(wrong).map((b) => `${b.from}>${b.to}`)).toEqual(['dynamodb>lambda', 'lambda>apigateway']);
    expect(designPasses(wrong)).toBe(false);
    expect(passGaps(wrong).join(' ')).toMatch(/wrong way/);
  });

  it('queues and event buses go both ways, so their arrows are never called backwards', () => {
    const d: D = { nodes: [n('q', 'sqs'), n('fn', 'lambda', 1), n('eb', 'eventbridge', 2)], edges: [{ from: 'q', to: 'fn' }, { from: 'fn', to: 'q' }, { from: 'eb', to: 'fn' }] };
    expect(backwardArrows(d)).toEqual([]);
  });

  it('three services must be wired, not just placed', () => {
    const d: D = { nodes: [n('a', 'lambda'), n('b', 'dynamodb', 1), n('c', 'cloudwatch', 2), n('u', 'actor:users', 3)], edges: [{ from: 'u', to: 'a' }, { from: 'a', to: 'b' }] };
    expect(designPasses(d)).toBe(false);
    expect(passGaps(d)[0]).toMatch(/3 services/);
  });
});
