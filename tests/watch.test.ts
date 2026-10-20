// Watch it done (src/state/watch.ts): an agent's task as a story, before, during and after; and the demo's task flow
// (src/backend/MockBackend.ts) lists exactly the steps the city shows.
import { describe, expect, it } from 'vitest';
import { MockBackend } from '@/backend/MockBackend';
import type { ServerEvent, TaskPlanEvent } from '@/backend/contract';
import { agentOffer, liveStep, paidLine, taskPhase, taskStory } from '@/state/watch';
import type { TaskView } from '@/state/store';
import templatesJson from '../shared/templates.json' with { type: 'json' };
import { FEATURED_REQUESTS } from '@/world/taxonomy';

const task = (over: Partial<TaskView> = {}): TaskView => ({ taskId: 't1', prompt: 'Store my holiday photos cheaply', steps: [], status: 'routing', ...over });

describe('the story', () => {
  it('frames the task before the agent works: who, what, where, and a reason to watch', () => {
    const s = taskStory(task());
    expect(s.agentId).toBe('s3');
    expect(s.framing).toBe('Sally will store your holiday photos in S3 Lake.');
    expect(s.watch).toBe('Watch Sally walk there.');
    expect(s.teaches).toMatch(/storage classes/);
    // The planned agent wins over the words.
    expect(taskStory(task({ agentId: 'lambda' })).who).toBe('Lola');
  });

  it('any building has a story (its own first lesson when nothing is hand-written)', () => {
    const s = taskStory(task({ prompt: 'Something about Amazon SQS queues', agentId: 'sqs' }));
    expect(s.framing).toMatch(/will take this on at/);
    expect(s.teaches.length).toBeGreaterThan(10);
    expect(s.templateId).toBeUndefined();
  });

  it('only offers "See it in Deploy" for a real practice template that uses the agent’s service', () => {
    for (const id of ['s3', 'lambda', 'iam', 'route53', 'dynamodb', 'shield', 'bedrock', 'ec2']) {
      const s = taskStory(task({ agentId: id }));
      if (!s.templateId) continue;
      const t = templatesJson.templates.find((x) => x.id === s.templateId);
      expect(t, s.templateId).toBeTruthy();
      expect(t!.serviceIds, s.templateId).toContain(id);
    }
  });

  it('every building offer routes to its own agent (the demo picks the agent from the words, as the story does)', () => {
    // The story and the demo both read the words: a featured request names whoever they point at.
    for (const r of FEATURED_REQUESTS) expect(taskStory(task({ prompt: r.prompt })).agentId).toBeTruthy();
    for (const id of ['s3', 'lambda', 'iam', 'route53', 'dynamodb', 'shield', 'bedrock', 'ec2']) {
      const o = agentOffer(id)!;
      expect(o.story).toMatch(/you can watch every step/);
      expect(taskStory(task({ prompt: o.prompt })).agentId, o.prompt).toBe(id);
    }
    expect(agentOffer('sqs')).toBeUndefined();
  });
});

describe('the phases', () => {
  const steps = (...st: TaskView['steps'][number]['status'][]) => st.map((status, i) => ({ text: `step ${i}`, status }));
  it('framing while routing and walking, live once work starts, then the result', () => {
    expect(taskPhase(task())).toBe('framing');
    expect(taskPhase(task({ status: 'running', steps: steps('running', 'pending') }))).toBe('framing');
    const live = task({ status: 'running', steps: steps('done', 'done', 'running', 'pending') });
    expect(taskPhase(live)).toBe('live');
    expect(liveStep(live)).toEqual({ index: 2, text: 'step 2', of: 4 });
    expect(taskPhase(task({ status: 'done', steps: steps('done', 'done') }))).toBe('result');
    expect(taskPhase(task({ status: 'failed' }))).toBe('failed');
  });

  it('says what a task paid, or the friendly line when the day’s paid tasks there are used up', () => {
    expect(paidLine(task({ paid: [{ serviceId: 's3', stars: 15 }, { serviceId: 'iam', stars: 5 }] }))).toBe('+15 ⭐ S3 Lake, +5 ⭐ IAM Gatehouse');
    expect(paidLine(task({ capped: true }))).toMatch(/full stars again tomorrow/);
    expect(paidLine(task())).toBeUndefined();
  });
});

describe('the demo task mirrors the city', () => {
  it('plans every step it then runs, the helper’s visit included, and finishes them all', async () => {
    const mock = new MockBackend({ speed: 200 });
    const events: ServerEvent[] = [];
    mock.onEvent((e) => events.push(e));
    mock.send({ action: 'task.submit', taskId: 't1', prompt: 'Store my holiday photos cheaply', context: {} });
    await new Promise((r) => setTimeout(r, 700));
    const plan = events.find((e): e is TaskPlanEvent => e.type === 'task.plan')!;
    expect(plan.steps).toContain('Asking Ivy for help');
    const steps = events.filter((e) => e.type === 'task.step');
    const last = new Map<number, string>();
    for (const e of steps) if (e.type === 'task.step') last.set(e.index, e.status);
    expect([...last.keys()].sort((a, b) => a - b)).toEqual(plan.steps.map((_, i) => i));
    expect([...last.values()].every((st) => st === 'done' || st === 'skipped')).toBe(true);
    // The helper's step runs while the helper works, between the two of them talking.
    const helper = plan.steps.indexOf('Asking Ivy for help');
    const running = events.findIndex((e) => e.type === 'task.step' && e.index === helper && e.status === 'running');
    const ivy = events.findIndex((e) => e.type === 'agent.state' && e.agentId === 'iam' && e.state === 'working');
    expect(running).toBeGreaterThan(-1);
    expect(ivy).toBeGreaterThan(running);
    expect(events.some((e) => e.type === 'task.done' && e.ok)).toBe(true);
    mock.disconnect();
  });
});
