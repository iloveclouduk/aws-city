// @vitest-environment jsdom
// The practice console (src/console/practicePage.ts) and the offline Copilot's scripted flows (src/backend/consoleMock.ts):
// every flow runs end to end on the practice page's own markup, through the same act/safety code the real agent uses,
// never presses a risky control, and leaves the resource "created" on the page. Plus the practice URL helpers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findExact, findTarget, isCustomSelect, matchOption, openListbox, optionsIn, press, typeInto } from '@/console/act';
import { mayAct, mayChoose } from '@/console/safety';
import { takeSnapshot } from '@/console/snapshot';
import { isPracticeUrl, practiceRoute, practiceServiceOf, practiceUrl, PRACTICE_SERVICES } from '@/console/practice';
import { mountPractice, PRACTICE_NOTE } from '@/console/practicePage';
import { ConsoleMock, flowFor, isFlow } from '@/backend/consoleMock';
import type { ConsoleStepEvent, ServerEvent } from '@/backend/contract';
import { matchText, serviceById } from '@/world/taxonomy';

const snap = () => takeSnapshot(document, { requireLayout: false });

afterEach(() => {
  document.body.innerHTML = '';
  delete document.body.dataset.created;
  delete document.body.dataset.risky;
  vi.useRealTimers();
});

const BASE = 'chrome-extension://abcdefghijklmnop/practice.html';

describe('practice console URLs', () => {
  it('knows its own page and the service each route shows', () => {
    expect(isPracticeUrl(`${BASE}#/s3`, BASE)).toBe(true);
    expect(isPracticeUrl(BASE, BASE)).toBe(true);
    expect(isPracticeUrl('chrome-extension://otherextension/practice.html#/s3', BASE)).toBe(false);
    expect(isPracticeUrl('https://abcdefghijklmnop/practice.html', BASE)).toBe(false);
    expect(isPracticeUrl('chrome-extension://abcdefghijklmnop/city.html', BASE)).toBe(false);
    expect(isPracticeUrl(undefined, BASE)).toBe(false);
    expect(practiceRoute(`${BASE}#/rds/create`)).toEqual({ service: 'rds', page: 'create' });
    expect(practiceRoute(`${BASE}#/iam`)).toEqual({ service: 'iam', page: 'list' });
    expect(practiceRoute(`${BASE}#/nope`)).toEqual({ page: 'home' });
    expect(practiceRoute(BASE)).toEqual({ page: 'home' });
    expect(practiceServiceOf(`${BASE}#/sqs/create`)).toBe('sqs');
    expect(practiceUrl(BASE, 'cloudfront')).toBe(`${BASE}#/cloudfront`);
    expect(practiceUrl(BASE, 'kinesis')).toBe(BASE);
  });

  it('every practice service is a real service with a scripted flow', () => {
    for (const id of PRACTICE_SERVICES) {
      expect(serviceById(id), id).toBeDefined();
      expect(isFlow(id), id).toBe(true);
    }
  });
});

describe('the practice console page', () => {
  it('says plainly that nothing touches AWS, and lists every service', () => {
    window.history.replaceState(null, '', '#/');
    mountPractice(document, { delay: 0, selectDelay: 0 });
    expect(document.body.textContent).toContain(PRACTICE_NOTE.replace(/^Practice console: /, ''));
    expect(document.querySelector('[role=note]')?.textContent).toMatch(/Practice console/);
    const nav = [...document.querySelectorAll('.sidenav a')].map((a) => a.getAttribute('href'));
    expect(nav).toEqual(PRACTICE_SERVICES.map((id) => `#/${id}`));
  });

  it('shows typed names as text, never markup', async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '#/sqs/create');
    mountPractice(document, { delay: 0, selectDelay: 0 });
    typeInto(document.getElementById('qn')!, '<b>no</b>');
    // an invalid name is refused with a message
    press(document.getElementById('submit')!);
    expect(document.querySelector('.form-error')?.textContent).toMatch(/letters, numbers/);
    typeInto(document.getElementById('qn')!, 'ok_queue');
    press(document.getElementById('submit')!);
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.dataset.created).toBe('ok_queue (Standard)');
    expect(document.querySelector('.awsui_flash_xd')?.textContent).toMatch(/ok_queue created/);
    expect(document.querySelector('h1')?.textContent).toBe('Queues (1)');
    // EC2 takes any name: it lands in the list as text
    window.history.replaceState(null, '', '#/ec2/create');
    mountPractice(document, { delay: 0, selectDelay: 0 });
    typeInto(document.getElementById('nm')!, '<img src=x id=boom>');
    press(document.getElementById('submit')!);
    await vi.advanceTimersByTimeAsync(10);
    expect(document.getElementById('boom')).toBeNull();
    expect(document.querySelector('.awsui_table_xk td')?.textContent).toBe('<img src=x id=boom>');
  });
});

/** Plays one Copilot task: the mock plans each step from a snapshot, this applies it the way the page's agent does. */
async function play(service: (typeof PRACTICE_SERVICES)[number], goal: string) {
  vi.useFakeTimers();
  window.history.replaceState(null, '', `#/${service}`);
  mountPractice(document, { delay: 0, selectDelay: 0 });
  const events: ServerEvent[] = [];
  const m = new ConsoleMock((e) => events.push(e));
  m.start('t', goal, snap(), service);
  const said: string[] = [];
  const handedBack: string[] = [];
  let seen = 0;
  for (let n = 0; n < 40; n++) {
    const steps = events.filter((e): e is ConsoleStepEvent => e.type === 'console.step');
    const step = steps[seen];
    if (!step) break;
    seen++;
    said.push(`${step.action} ${step.target?.name ?? ''}`.trim());
    if (step.action === 'done') break;
    let ok = true;
    if (step.action === 'point') {
      ok = !!findTarget(document, step.target!);
    } else {
      const el = findExact(document, step.target!);
      const item = snap().items.find((i) => i.id === step.target?.id);
      const verdict = mayAct(item, step.action, el, step.value);
      // A step the agent may take itself is never refused; one that needs the player's OK is still a safe control.
      expect(verdict, `${service}: ${step.say}`).toEqual({ ok: true });
      if (step.risk === 'confirm') handedBack.push(step.target!.name);
      if (step.action === 'click') press(el!);
      else if (step.action === 'type') typeInto(el!, step.value ?? '');
      else if (step.action === 'select') {
        expect(isCustomSelect(el!)).toBe(true);
        const open = openListbox(el!);
        await vi.advanceTimersByTimeAsync(250);
        const list = await open;
        const opt = list && matchOption(optionsIn(list), step.value ?? '');
        expect(opt, `${service}: option ${step.value}`).toBeDefined();
        expect(mayChoose(opt!, item?.name)).toEqual({ ok: true });
        press(opt!);
      }
    }
    await vi.advanceTimersByTimeAsync(50); // the page's "working on it" spinner
    m.observe('t', ok, ok ? undefined : 'not found', snap());
    await vi.advanceTimersByTimeAsync(400); // the mock thinks for 350 ms
  }
  const done = events.find((e) => e.type === 'task.done');
  return { done, said, handedBack, created: document.body.dataset.created, risky: document.body.dataset.risky };
}

describe('every scripted Copilot flow completes on the practice console', () => {
  const CASES: { service: (typeof PRACTICE_SERVICES)[number]; goal: string; created: RegExp; confirm?: string[] }[] = [
    { service: 's3', goal: 'Create an S3 bucket', created: /^city-demo-\w+ \(SSE-S3 · Block all public access on\)$/ },
    { service: 'ec2', goal: 'Launch an EC2 instance', created: /^city-web-\w+ \(t3\.micro\)$/, confirm: ['Launch instance'] },
    { service: 'dynamodb', goal: 'Create a DynamoDB table', created: /^city-demo-\w+ \(pk id\)$/ },
    { service: 'lambda', goal: 'Create a Lambda function', created: /^city-hello \(Node\.js 24\.x, from scratch\)$/ },
    { service: 'rds', goal: 'Create an RDS database', created: /^city-db-\w+ \(PostgreSQL, Free tier\)$/, confirm: ['Create database'] },
    { service: 'cloudfront', goal: 'Create a CloudFront distribution', created: /^city-site\.s3\.us-west-2\.amazonaws\.com \(OAC, redirect http to https\)$/ },
    { service: 'sqs', goal: 'Create an SQS queue', created: /^city-orders-\w+ \(Standard\)$/ },
    { service: 'iam', goal: 'Create an IAM role for Lambda', created: /^city-lambda-role-\w+ \(Lambda, AWSLambdaBasicExecutionRole\)$/, confirm: ['Create role'] },
  ];
  for (const c of CASES) {
    it(`${c.service}: ${c.goal}`, async () => {
      expect(flowFor(c.service, `${BASE}#/${c.service}`, c.goal)).toBe(c.service);
      // The demo's Copilot opens the practice page for the service a free-text goal names.
      expect(matchText(c.goal)).toBe(c.service);
      const r = await play(c.service, c.goal);
      expect(r.risky, r.said.join(' → ')).toBeUndefined();
      expect(r.created, r.said.join(' → ')).toMatch(c.created);
      expect(r.done).toMatchObject({ type: 'task.done', ok: true, xp: [{ serviceId: c.service, amount: 20 }] });
      expect(r.handedBack).toEqual(c.confirm ?? []);
      // Each flow explains as it goes: every step has a why.
      expect(r.said.length).toBeGreaterThanOrEqual(5);
    });
  }
});
