// AWS North talks (shared/conference.json): our own short summaries, a three-question check each, real services and
// workshops, and AWS sources only.
import { describe, expect, it } from 'vitest';
import { SERVICES } from '@/world/taxonomy';
import conference from '../shared/conference.json' with { type: 'json' };
import workshops from '../shared/workshops.json' with { type: 'json' };

interface Check {
  q: string;
  options: string[];
  answer: number;
  why: string;
}
interface Talk {
  id: string;
  title: string;
  theme: string;
  simple: string;
  summary: string;
  keyIdeas: string[];
  serviceIds: string[];
  check: Check[];
  workshopIds: string[];
  sources: string[];
}

const TALKS = conference.talks as Talk[];
const services = new Set(SERVICES.map((s) => s.id));
const workshopIds = new Set((workshops.workshops as { id: string }[]).map((w) => w.id));
const THEMES = ['agents', 'careers', 'saas', 'delivery', 'serverless'];
const KEYS = ['id', 'title', 'theme', 'simple', 'summary', 'keyIdeas', 'serviceIds', 'check', 'workshopIds', 'sources'];

describe('conference talks', () => {
  it('say when they were checked and which event they come from', () => {
    expect(conference.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.parse(conference.asOf) <= Date.now() + 86_400_000).toBe(true);
    expect(conference.event).toBe('AWS North');
    expect(TALKS.length).toBeGreaterThan(0);
    expect(new Set(TALKS.map((t) => t.id)).size).toBe(TALKS.length);
  });

  it.each(TALKS.map((t) => [t.id, t] as const))('%s is well-formed, short and sourced', (_id, t) => {
    expect(Object.keys(t).sort()).toEqual([...KEYS].sort());
    expect(t.id).toMatch(/^[a-z0-9-]+$/);
    expect(t.title.trim().length).toBeGreaterThan(0);
    expect(THEMES).toContain(t.theme);
    expect(t.simple.length).toBeGreaterThan(10);
    expect(t.simple.length).toBeLessThanOrEqual(110);
    expect(t.summary.length).toBeLessThanOrEqual(600);
    expect(t.summary.length).toBeGreaterThan(t.simple.length);
    expect(t.keyIdeas.length).toBeGreaterThanOrEqual(3);
    expect(t.keyIdeas.length).toBeLessThanOrEqual(5);
    for (const k of t.keyIdeas) expect(k.length, k).toBeLessThanOrEqual(140);

    expect(t.serviceIds.length).toBeGreaterThanOrEqual(1);
    expect(t.serviceIds.length).toBeLessThanOrEqual(4);
    for (const s of t.serviceIds) expect(services.has(s), s).toBe(true);
    for (const w of t.workshopIds) expect(workshopIds.has(w), w).toBe(true);

    expect(t.check).toHaveLength(3);
    for (const c of t.check) {
      expect(c.q.length, c.q).toBeLessThanOrEqual(140);
      expect(c.options.length, c.q).toBeGreaterThanOrEqual(3);
      expect(c.options.length, c.q).toBeLessThanOrEqual(4);
      expect(new Set(c.options).size, c.q).toBe(c.options.length);
      expect(Number.isInteger(c.answer) && c.answer >= 0 && c.answer < c.options.length, c.q).toBe(true);
      expect(c.why.length, c.q).toBeGreaterThan(10);
      expect(c.why.length, c.q).toBeLessThanOrEqual(160);
    }

    expect(t.sources.length).toBeGreaterThanOrEqual(1);
    expect(t.sources.length).toBeLessThanOrEqual(4);
    for (const s of t.sources) {
      const u = new URL(s);
      expect(u.protocol, s).toBe('https:');
      expect(['docs.aws.amazon.com', 'aws.amazon.com'], s).toContain(u.hostname);
    }
  });

  it('never use an em dash', () => {
    expect(JSON.stringify(conference)).not.toMatch(/—/);
  });

  it('every workshop that follows a talk names a real talk', () => {
    const talks = new Set(TALKS.map((t) => t.id));
    for (const w of workshops.workshops as { id: string; talk?: string }[]) if (w.talk) expect(talks.has(w.talk), `${w.id}: ${w.talk}`).toBe(true);
  });
});
