// "Explain it back": after a quest, the player says what they learned in their own words. The quick check here is
// rules only (the service's own keywords, shared/world.json); the kind, grounded feedback comes from that building's
// agent through the ordinary chat.ask route (the server's landmark agent, or the demo's canned reply).
import type { Quest } from '@/world/content';
import { serviceById } from '@/world/taxonomy';

/** Shorter than this and there's nothing to check yet. */
export const MIN_WORDS = 6;
/** The answer is capped so the framed question stays well inside chat.ask's 2,000 characters. */
export const MAX_CHARS = 600;
/** The framing's first words: the demo backend recognises an explain-back by them. */
export const EXPLAIN_MARK = 'Explain it back';

/** The service a quest is mostly about: its first one. */
export const explainService = (q: Quest) => q.serviceIds[0];

export function explainQuestion(q: Quest) {
  const s = serviceById(explainService(q));
  return `In your own words: what does ${s?.name ?? 'it'} do, and why did “${q.title}” use it?`;
}

export interface ExplainCheck {
  words: number;
  tooShort: boolean;
  /** The service's key ideas the answer mentions. */
  mentioned: string[];
  /** Up to three it doesn't, to nudge with. */
  missed: string[];
}

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const has = (text: string, idea: string) => new RegExp(`(^|[^a-z0-9])${idea.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?($|[^a-z0-9])`, 'i').test(text);

/** The quick, rules-only look at an answer: which of the service's key ideas it uses (never the name itself). */
export function checkExplain(serviceId: string, text: string): ExplainCheck {
  const s = serviceById(serviceId);
  const own = new Set([serviceId, ...(s?.name.toLowerCase().split(/\s+/) ?? [])]);
  return checkKeywords((s?.keywords ?? []).filter((k) => !own.has(k.toLowerCase())), text);
}

/** The same look against a given list of key ideas (a City Clients job's own), with its own shortest answer. */
export function checkKeywords(keywords: string[], text: string, minWords = MIN_WORDS): ExplainCheck {
  const ideas = [...new Set(keywords.map((k) => k.toLowerCase()))];
  const n = words(text);
  const mentioned = ideas.filter((k) => has(text, k));
  return { words: n, tooShort: n < minWords, mentioned, missed: ideas.filter((k) => !mentioned.includes(k)).slice(0, 3) };
}

/**
 * A City Clients job's explain-back, framed for the building's agent like a quest's (the demo knows it by the mark).
 * `serviceId`: the job's own service, named in plain words and tagged `(service: <id>)` so the server routes the ask to
 * that building's agent (server/src/contract/orchestrator.ts), not whichever service the answer happens to name.
 */
export function framedJobExplain(title: string, question: string, answer: string, serviceId?: string) {
  const text = answer.trim().slice(0, MAX_CHARS);
  const svc = serviceId ? serviceById(serviceId) : undefined;
  const about = svc ? ` about ${svc.name} (service: ${svc.id})` : '';
  return (
    `${EXPLAIN_MARK} for the side job “${title}”${about}. The question: ${question} ` +
    `My answer, in my own words: “${text}” ` +
    'Please reply kindly in two or three short sentences of plain words: what I got right, then one thing to fix or add.'
  );
}

const quoted = (xs: string[]) => {
  const q = xs.map((x) => `“${x}”`);
  return q.length > 1 ? `${q.slice(0, -1).join(', ')} and ${q.at(-1)}` : (q[0] ?? '');
};

/**
 * The demo's kind reply, from the same rules-only check: the key words the player used (quoted, so "you mentioned
 * “file”" reads right, never "you talked about file"), one to add, and the building's one-line summary.
 */
export function explainFeedback(c: ExplainCheck, simple = '') {
  const used = c.mentioned.slice(0, 3);
  return (
    (used.length
      ? `Nice: you mentioned ${quoted(used)}, ${used.length > 1 ? 'which are' : 'which is'} the heart of it. `
      : 'Good start, and thanks for trying it in your own words. ') +
    (c.missed.length ? `To make it complete, say how ${quoted(c.missed.slice(0, 1))} fits in. ` : '') +
    (simple ? `In one line: ${simple}` : '')
  ).trim();
}

/** What the building's agent is asked: the question, the player's words, and how to answer (kind, short, plain). */
export function framedExplain(q: Quest, answer: string) {
  const text = answer.trim().slice(0, MAX_CHARS);
  return (
    `${EXPLAIN_MARK} for the quest “${q.title}”. The question: ${explainQuestion(q)} ` +
    `My answer, in my own words: “${text}” ` +
    'Please reply kindly in two or three short sentences of plain words: what I got right, then one thing to fix or add.'
  );
}
