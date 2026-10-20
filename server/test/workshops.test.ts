import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import workshopData from '../../shared/workshops.json' with { type: 'json' };
import { CHECKS, verifyStep } from '../src/workshops/checks.js';
import { snapshot, table } from './fixtures.js';

// Workshop steps are checked with a read-only look at the poller's snapshot: no AWS calls, no writes, no commands.
describe('workshop checks (contract v2.10)', () => {
  it('reads only the snapshot: no SDK clients or commands in checks.ts', () => {
    const src = readFileSync(new URL('../src/workshops/checks.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/@aws-sdk|Command\b|child_process|exec\(/);
  });

  it('every checked step names a known check and one of its own placeholders', () => {
    for (const w of workshopData.workshops)
      for (const s of w.steps as { id: string; cli?: string; verify: { check?: string; value?: string } }[]) {
        if (!s.verify.check) continue;
        expect(CHECKS[s.verify.check], `${w.id}/${s.id}`).toBeTruthy();
        expect(s.cli ?? '', `${w.id}/${s.id}`).toContain(`<${s.verify.value}>`);
      }
  });

  it('finds the table, waits for ACTIVE, and checks the cleanup', () => {
    const w = 'dynamodb-first-table';
    const values = { table: 'orders' };
    expect(verifyStep(snapshot([table('orders', 'CREATING')]), w, 'create', values).ok).toBe(true);
    expect(verifyStep(snapshot([table('orders', 'CREATING')]), w, 'wait', values)).toMatchObject({ ok: false, detail: expect.stringContaining('creating') });
    expect(verifyStep(snapshot([table('orders')]), w, 'wait', values).ok).toBe(true);
    expect(verifyStep(snapshot([]), w, 'create', values)).toMatchObject({ ok: false, detail: expect.stringContaining('No DynamoDB table called orders') });
    expect(verifyStep(snapshot([table('orders')]), w, 'cleanup', values).ok).toBe(false);
    expect(verifyStep(snapshot([]), w, 'cleanup', values).ok).toBe(true);
  });

  it('refuses unknown steps, manual steps, odd names and an unlinked account', () => {
    expect(verifyStep(snapshot([]), 'nope', 'create').ok).toBe(false);
    expect(verifyStep(snapshot([]), 'dynamodb-first-table', 'put', { table: 'orders' }).detail).toMatch(/checked by you/);
    expect(verifyStep(snapshot([table('orders')]), 'dynamodb-first-table', 'create', { table: '../../etc' }).ok).toBe(false);
    expect(verifyStep(undefined, 'dynamodb-first-table', 'create', { table: 'orders' }).detail).toMatch(/Connect your AWS account/);
  });

  it('says so when the role can’t read the service', () => {
    const snap = snapshot([], { services: { ec2: 'ok', dynamodb: 'locked', s3: 'ok', lambda: 'ok', rds: 'ok', apigateway: 'ok' } });
    expect(verifyStep(snap, 'dynamodb-first-table', 'create', { table: 'orders' }).detail).toMatch(/isn't allowed/);
  });
});
