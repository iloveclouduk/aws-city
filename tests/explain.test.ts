// "Explain it back": a rules-only first look at the player's words, and a framed question for the building's agent.
import { describe, expect, it } from 'vitest';
import { checkExplain, EXPLAIN_MARK, explainFeedback, explainQuestion, explainService, framedExplain, MAX_CHARS } from '@/state/explain';
import { QUESTS } from '@/world/content';

describe('explain it back', () => {
  it('every quest asks about a real service', () => {
    for (const q of QUESTS) expect(explainQuestion(q), q.id).not.toContain(' it do');
  });

  it('finds the key ideas used, never counting the name', () => {
    const c = checkExplain('s3', 'S3 keeps every file as an object in a bucket, so I can store a backup.');
    expect(c.tooShort).toBe(false);
    expect(c.mentioned).toEqual(expect.arrayContaining(['bucket', 'object', 'file', 'backup', 'store']));
    expect(c.mentioned).not.toContain('s3');
    expect(checkExplain('s3', 'It stores stuff').tooShort).toBe(true);
    expect(checkExplain('s3', 'nothing relevant at all here really, sorry about that').missed.length).toBe(3);
  });

  it('the demo\'s feedback reads right: key words quoted, never "you talked about file"', () => {
    const one = explainFeedback({ words: 8, tooShort: false, mentioned: ['file'], missed: ['bucket'] }, 'S3 keeps files.');
    expect(one).toBe('Nice: you mentioned “file”, which is the heart of it. To make it complete, say how “bucket” fits in. In one line: S3 keeps files.');
    const many = explainFeedback({ words: 8, tooShort: false, mentioned: ['file', 'object', 'bucket', 'backup'], missed: [] });
    expect(many).toBe('Nice: you mentioned “file”, “object” and “bucket”, which are the heart of it.');
    expect(explainFeedback({ words: 8, tooShort: false, mentioned: [], missed: [] })).toBe('Good start, and thanks for trying it in your own words.');
    expect(one).not.toMatch(/talked about/);
  });

  it('frames the answer for the agent, capped and marked', () => {
    const q = QUESTS[0];
    const f = framedExplain(q, 'x'.repeat(5000));
    expect(f.startsWith(EXPLAIN_MARK)).toBe(true);
    expect(f.length).toBeLessThan(2000);
    expect(f).toContain('x'.repeat(MAX_CHARS));
    expect(f).not.toContain('x'.repeat(MAX_CHARS + 1));
    expect(explainService(q)).toBe(q.serviceIds[0]);
  });
});

describe('a side job’s explain-back in the demo', () => {
  it('is answered by the job’s own building, against the job’s own key ideas (not the district’s first agent)', async () => {
    const { MockBackend } = await import('@/backend/MockBackend');
    const { framedJobExplain: framed } = await import('@/state/explain');
    const { taskById } = await import('@/world/clients');
    const ref = taskById('arena-2-explain-wait')!;
    if (ref.task.type !== 'explain') throw new Error('not an explain job');
    const job = ref.task.explain;
    const mock = new MockBackend({ speed: 200 });
    const events: { type: string; agentId?: string; delta?: string }[] = [];
    mock.onEvent((e) => events.push(e as never));
    const answer = `A ${job.keywords[0]} keeps fans in line so the site never falls over at noon.`;
    // CloudFront lives in the networking district, whose first agent is VPC's.
    mock.send({ action: 'chat.ask', requestId: 'j1', districtId: 'networking', question: framed(ref.task.title, job.question, answer), context: {} });
    await new Promise((r) => setTimeout(r, 400));
    const chunks = events.filter((e) => e.type === 'chat.answer');
    expect(chunks.at(-1)?.agentId).toBe('cloudfront');
    expect(chunks.map((c) => c.delta).join('')).toContain(`“${job.keywords[0].toLowerCase()}”`);
  });
});
