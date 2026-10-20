// Every finding rule (shared/wa-rules.json) and every puzzle's pillar tip (shared/puzzles.json) cites one AWS
// Well-Architected Framework best practice from the pillar it belongs to, and every puzzle links one AWS reference
// (an architecture, guide, whitepaper or lens). Each URL was read through the AWS Knowledge MCP before it was added.
import { describe, expect, it } from 'vitest';
import rulesJson from '../shared/wa-rules.json' with { type: 'json' };
import puzzlesJson from '../shared/puzzles.json' with { type: 'json' };

interface Bp { id: string; title: string; url: string }
interface Ref { title: string; url: string }
interface Rule { id: string; pillar: string; bp?: Bp }
interface Puzzle { id: string; reference?: Ref; pillarBonus: Record<string, { tip: string; bp?: Bp }> }

const RULES = rulesJson.rules as Rule[];
const PUZZLES = puzzlesJson.puzzles as unknown as Puzzle[];
const PILLARS = puzzlesJson.pillars.map((p) => p.id);

const PREFIX: Record<string, string> = {
  operational: 'OPS',
  security: 'SEC',
  reliability: 'REL',
  performance: 'PERF',
  cost: 'COST',
  sustainability: 'SUS',
};
const ID = /^(OPS|SEC|REL|PERF|COST|SUS)\d{2}-BP\d{2}$/;

function checkBp(bp: Bp | undefined, pillar: string, where: string) {
  expect(bp, where).toBeDefined();
  if (!bp) return;
  expect(bp.id, where).toMatch(ID);
  expect(bp.id.split(/\d/)[0], `${where} ${bp.id} belongs to ${pillar}`).toBe(PREFIX[pillar]);
  expect(bp.title.trim(), where).not.toBe('');
  expect(bp.title, where).not.toContain('—');
  const u = new URL(bp.url);
  expect(u.protocol, where).toBe('https:');
  expect(u.hostname, where).toBe('docs.aws.amazon.com');
  expect(u.pathname.startsWith('/wellarchitected/'), `${where} ${bp.url}`).toBe(true);
}

describe('Well-Architected best practices', () => {
  it('knows a prefix for every pillar', () => {
    for (const p of PILLARS) expect(PREFIX[p], p).toBeDefined();
  });

  it('every finding rule cites a best practice from its own pillar', () => {
    expect(RULES.length).toBeGreaterThan(0);
    for (const r of RULES) checkBp(r.bp, r.pillar, r.id);
  });

  it('every pillar tip in every puzzle cites a best practice from that pillar', () => {
    expect(PUZZLES.length).toBeGreaterThan(0);
    for (const z of PUZZLES) {
      expect(Object.keys(z.pillarBonus).sort(), z.id).toEqual([...PILLARS].sort());
      for (const [pillar, b] of Object.entries(z.pillarBonus)) checkBp(b.bp, pillar, `${z.id}.${pillar}`);
    }
  });

  it('every puzzle links an AWS reference', () => {
    for (const z of PUZZLES) {
      expect(z.reference, z.id).toBeDefined();
      if (!z.reference) continue;
      expect(z.reference.title.trim(), z.id).not.toBe('');
      expect(z.reference.title, z.id).not.toContain('—');
      const u = new URL(z.reference.url);
      expect(u.protocol, z.id).toBe('https:');
      expect(['docs.aws.amazon.com', 'aws.amazon.com'], `${z.id} ${z.reference.url}`).toContain(u.hostname);
    }
  });
});
