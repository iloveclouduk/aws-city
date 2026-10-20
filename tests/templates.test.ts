import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUZZLES, QUESTS, templateForPuzzle, TEMPLATES } from '@/world/content';

// Drawing → stack: every deploy template has real CloudFormation (shared/templates/<id>.yaml, checked with cfn-lint
// when it changes), and its resources and outputs are exactly the ones the card lists.
const yaml = (id: string) => fs.readFileSync(path.resolve(__dirname, `../shared/templates/${id}.yaml`), 'utf8');
const section = (body: string, name: string) => {
  const start = body.indexOf(`\n${name}:\n`);
  if (start < 0) return [];
  const rest = body.slice(start + name.length + 3);
  const end = rest.search(/\n\S/);
  return [...(end < 0 ? rest : rest.slice(0, end)).matchAll(/^ {2}([A-Za-z0-9]+):\s*$/gm)].map((m) => m[1]);
};

describe('deploy templates', () => {
  it('each has YAML whose resources and outputs match its card', () => {
    for (const t of TEMPLATES) {
      const body = yaml(t.id);
      expect(body, t.id).toMatch(/^AWSTemplateFormatVersion: '2010-09-09'/);
      expect(section(body, 'Resources').sort(), t.id).toEqual(t.resources.map((r) => r.logicalId).sort());
      for (const r of t.resources) expect(body, `${t.id}: ${r.logicalId}`).toContain(`  ${r.logicalId}:\n    Type: ${r.type}\n`);
      expect(section(body, 'Outputs').sort(), t.id).toEqual([...t.outputs].sort());
    }
  });

  it('keeps buckets private and roles least-privilege: no public access, no wildcard actions', () => {
    for (const t of TEMPLATES) {
      const body = yaml(t.id);
      expect(body, t.id).not.toMatch(/Action:\s*['"]?\*|PublicRead|AccessControl:/);
    }
  });

  it('encrypts what it stores and tags everything it can for AWS City', () => {
    for (const t of TEMPLATES) {
      const body = yaml(t.id);
      expect(body, t.id).toContain('Value: aws-city');
      // Every bucket blocks public access and names its encryption.
      const buckets = body.split(/\n {2}(?=[A-Za-z0-9]+:\n {4}Type: )/).filter((r) => /^\w+:\n {4}Type: AWS::S3::Bucket\n/.test(r));
      for (const b of buckets) {
        for (const k of ['BlockPublicAcls', 'BlockPublicPolicy', 'IgnorePublicAcls', 'RestrictPublicBuckets']) expect(b, `${t.id}: ${k}`).toContain(`${k}: true`);
        expect(b, t.id).toContain('BucketEncryption:');
      }
    }
  });

  it('a quest drawing leads to the template its quest builds', () => {
    expect(templateForPuzzle('static-site')?.id).toBe('static-site');
    expect(templateForPuzzle('order-queue')?.id).toBe('queue-worker');
  });

  it('every drawing becomes a template: its quest deploy, or its own templateId', () => {
    const ids = new Set(TEMPLATES.map((t) => t.id));
    for (const p of PUZZLES) {
      if (p.templateId) expect(ids.has(p.templateId), `${p.id}: ${p.templateId}`).toBe(true);
      expect(templateForPuzzle(p.id), `${p.id} has no template`).toBeDefined();
    }
    // A drawing a quest already deploys doesn't name a second template.
    for (const p of PUZZLES.filter((x) => x.templateId)) expect(templateForPuzzle(p.id)?.id, p.id).toBe(p.templateId);
    // And no template is left over: each is a quest's deploy step or a drawing's own.
    const used = new Set([
      ...QUESTS.flatMap((q) => q.steps.flatMap((s) => (s.kind === 'deploy' ? [s.templateId] : []))),
      ...PUZZLES.flatMap((p) => (p.templateId ? [p.templateId] : [])),
    ]);
    expect([...ids].filter((id) => !used.has(id))).toEqual([]);
  });
});
