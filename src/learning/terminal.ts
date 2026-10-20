// The practice terminal behind a workshop step (pure, no AWS). The player types the step's command; we read it the way a
// shell would (quotes, `\` line breaks), then compare it with the step's expected command: the same words in the same
// order (`aws lambda create-function`), and every expected flag present in any order. A `<name>` in the expected
// command takes any value and is captured, so the simulated output can echo it back (`{{name}}`). A flag in brackets
// (`[--description <text>]`) may be left out. A known mistake (a missing flag, a wrong value) answers with the error the
// real CLI prints and a teaching note; pasting a real error runs through the same list (`explainError`).

export interface TerminalError {
  /** The error code or text the real CLI prints (`AccessDeniedException`, `ResourceConflictException`). */
  code: string;
  /** What the terminal prints when the mistake happens in practice. */
  message: string;
  /** When practice triggers it: a flag left out, or a flag given a value that matches the pattern. */
  when?: { missing?: string; flag?: string; value?: string };
  explain: string;
  fix: string;
}

export interface TerminalStep {
  /** The expected command, with `<placeholders>` and optional `[--flag value]` groups. */
  cli: string;
  /** What a successful run prints; `{{name}}` takes the value the player gave for `<name>`. */
  output: string;
  errors?: TerminalError[];
}

export type RunResult =
  | { kind: 'ok'; output: string; values: Record<string, string> }
  | { kind: 'error'; output: string; error: TerminalError }
  | { kind: 'other'; output: string }
  | { kind: 'empty' };

/** Splits a command line like a POSIX shell: quotes group, `\` escapes, a backslash-newline continues the line. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let has = false;
  let quote: '"' | "'" | null = null;
  const src = line.replace(/\\\r?\n/g, ' ');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < src.length && '"\\$`'.includes(src[i + 1])) cur += src[++i];
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < src.length) {
      cur += src[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

interface Parsed {
  words: string[];
  flags: Map<string, string | true>;
}

/** Positional words until the first flag; `--flag value`, `--flag=value` or a bare `--flag` after that. */
function parse(tokens: string[]): Parsed {
  const words: string[] = [];
  const flags = new Map<string, string | true>();
  let i = 0;
  while (i < tokens.length && !tokens[i].startsWith('-')) words.push(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i++];
    if (!t.startsWith('-')) continue; // a stray value: ignored rather than guessed at
    const eq = t.indexOf('=');
    if (eq > 0) flags.set(t.slice(0, eq), t.slice(eq + 1));
    else if (i < tokens.length && !tokens[i].startsWith('--')) flags.set(t, tokens[i++]);
    else flags.set(t, true);
  }
  return { words, flags };
}

interface Expected extends Parsed {
  optional: Set<string>;
}

/** The expected command, with `[ ... ]` groups marking optional flags. */
function expected(cli: string): Expected {
  const optional = new Set<string>();
  // `[--flag value]` is an optional group; a JSON array in a value (`'[{"Create":…}]'`) is not.
  const plain = cli.replace(/\[(--[^\]]+)\]/g, (_, inner: string) => {
    for (const t of tokenize(inner)) if (t.startsWith('--')) optional.add(t.split('=')[0]);
    return inner;
  });
  return { ...parse(tokenize(plain)), optional };
}

const PLACEHOLDER = /<([a-z0-9-]+)>/gi;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * One expected word or value against what the player typed: `<name>` parts take any non-empty text (and are captured
 * into `values`); JSON compares by meaning, not spacing; everything else exactly.
 */
function matches(want: string, got: string, values: Record<string, string>) {
  if (want === got) return true;
  const names: string[] = [];
  const re = want.split(PLACEHOLDER).map((part, i) => (i % 2 ? (names.push(part), '(.+?)') : escape(part))).join('');
  if (names.length) {
    const m = new RegExp(`^${re}$`, 's').exec(got);
    if (!m) return false;
    if (m.slice(1).some((v) => !v.trim())) return false;
    names.forEach((n, i) => (values[n] = m[i + 1]));
    return true;
  }
  try {
    return JSON.stringify(JSON.parse(want)) === JSON.stringify(JSON.parse(got));
  } catch {
    return false;
  }
}

const fill = (text: string, values: Record<string, string>) => text.replace(/\{\{([a-z0-9-]+)\}\}/gi, (m, k: string) => values[k] ?? m);

/** A name to suggest in place of a placeholder the player left in (`<table>` → `orders`). */
const EXAMPLES: Record<string, string> = {
  table: 'orders',
  bucket: 'my-city-bucket-2026',
  function: 'hello-city',
  name: 'city-demo',
  'queue-name': 'orders-queue',
  'dlq-name': 'orders-dlq',
  topic: 'city-alerts',
  alarm: 'city-high-cpu',
  role: 'city-app-role',
  user: 'city-dev',
  group: 'city-devs',
  'group-name': 'city-web-sg',
  rule: 'city-nightly',
  space: 'city-space',
  description: 'my-first-try',
  'oac-name': 'city-oac',
  region: 'us-east-1',
  email: 'you@example.com',
  key: 'photo.jpg',
  db: 'city-db',
  provider: 'city-provider',
};
const LITERAL = /<([a-z0-9-]+)>|\{\{([a-z0-9-]+)\}\}/i;

/** A name to try for `<name>`: the example the notes suggest, or `my-<name>`. */
export const exampleName = (name: string) => EXAMPLES[name] ?? `my-${name}`;

/** The teaching note for a placeholder typed as it was shown: a name to pick, or a value an earlier step printed. */
export function placeholderNote(name: string): string {
  const example = EXAMPLES[name];
  return example
    ? `Swap \`<${name}>\` for a name of your own, like \`${example}\`.`
    : `Swap \`<${name}>\` for the real value: an earlier step or the console shows it.`;
}

/** Runs one line of practice against a step. */
export function run(line: string, step: TerminalStep): RunResult {
  const tokens = tokenize(line.trim());
  if (!tokens.length) return { kind: 'empty' };
  // The command as shown, `<table>` and all, is not a run: the CLI would get the angle brackets as the name.
  const literal = tokens.map((t) => LITERAL.exec(t)).find(Boolean);
  if (literal) return { kind: 'other', output: placeholderNote(literal[1] ?? literal[2]) };
  const want = expected(step.cli);
  const got = parse(tokens);
  got.words = sameAsCli(want.words, got.words);
  const name = want.words.join(' ');
  const values: Record<string, string> = {};
  if (got.words.length !== want.words.length || !want.words.every((w, i) => matches(w, got.words[i], values))) {
    if (got.words[0] !== 'aws') return { kind: 'other', output: `${got.words[0] ?? tokens[0]}: this practice terminal only runs the AWS CLI. This step uses \`${name}\`.` };
    return { kind: 'other', output: `Not this step's command. This step runs \`${name}\`.` };
  }
  // A taught mistake first: it names the exact thing that went wrong.
  for (const e of step.errors ?? []) {
    const w = e.when;
    if (!w) continue;
    if (w.missing && !got.flags.has(w.missing)) return { kind: 'error', output: e.message, error: e };
    if (w.flag && w.value) {
      const v = got.flags.get(w.flag);
      if (typeof v === 'string' && new RegExp(w.value).test(v)) return { kind: 'error', output: e.message, error: e };
    }
  }
  for (const [flag, v] of want.flags) {
    const g = got.flags.get(flag);
    if (g === undefined) {
      if (want.optional.has(flag)) continue;
      return { kind: 'other', output: `aws: [ERROR]: An error occurred (ParamValidation): the following arguments are required: ${flag}` };
    }
    if (v === true) continue;
    if (g === true) return { kind: 'other', output: `aws: [ERROR]: An error occurred (ParamValidation): argument ${flag}: expected one argument` };
    if (!matches(v, g, values)) return { kind: 'other', output: `Close. This step sets ${flag} to ${v}.` };
  }
  return { kind: 'ok', output: fill(step.output, values), values };
}

const S3_KEYED = /^s3:\/\/[^/]+\/([^/<>{}]+)$/;
const S3_BUCKET = /^(s3:\/\/[^/]+?)\/?$/;
/**
 * Words the real CLI treats the same as the step's, rewritten to the step's form: `./seat-map.png` is `seat-map.png`,
 * and copying a file to `s3://bucket` or `s3://bucket/` keeps its name as the key (`aws s3 cp seat-map.png
 * s3://arena` uploads `s3://arena/seat-map.png`), so it stands for `s3://<bucket>/seat-map.png`.
 */
function sameAsCli(want: string[], got: string[]): string[] {
  return got.map((g, i) => {
    const w = want[i];
    if (w === undefined || w === g) return g;
    if (!w.includes('/') && g === `./${w}`) return w;
    const key = S3_KEYED.exec(w)?.[1];
    const bucket = S3_BUCKET.exec(g)?.[1];
    if (key && bucket && got.slice(0, i).some((x) => x === key || x.endsWith(`/${key}`))) return `${bucket}/${key}`;
    return g;
  });
}

/** A pasted error (from a real terminal or the console) matched against a step's known mistakes, by its code. */
export function explainError(text: string, errors: TerminalError[] = []): TerminalError | undefined {
  const t = text.toLowerCase();
  return errors.find((e) => t.includes(e.code.toLowerCase()));
}

// ── Typing help: Tab, Hint and "Fill my names" (src/ui/PracticeTerminal.tsx) ──

type Unit = { kind: 'word' | 'flag' | 'value' | 'stray'; text: string; flag?: string };

/** The step's command as the order a player would type it: words, then each required flag and its value, then extras. */
function units(cli: string): Unit[] {
  const toks = tokenize(cli.replace(/\[--[^\]]*\]/g, ' '));
  const out: Unit[] = [];
  let i = 0;
  while (i < toks.length && !toks[i].startsWith('-')) out.push({ kind: 'word', text: toks[i++] });
  while (i < toks.length) {
    const t = toks[i++];
    if (!t.startsWith('-')) {
      out.push({ kind: 'stray', text: t });
      continue;
    }
    const eq = t.indexOf('=');
    if (eq > 0) {
      out.push({ kind: 'flag', text: t.slice(0, eq) }, { kind: 'value', text: t.slice(eq + 1), flag: t.slice(0, eq) });
      continue;
    }
    out.push({ kind: 'flag', text: t });
    if (i < toks.length && !toks[i].startsWith('--')) out.push({ kind: 'value', text: toks[i++], flag: t });
  }
  return out;
}

/** Quoted the way a shell needs it (JSON, spaces), or as it is. */
const shellWord = (w: string) => (/[\s"'{}$`\\*;&|()]/.test(w) ? `'${w.replace(/'/g, `'\\''`)}'` : w);

export interface NextWord {
  kind: Unit['kind'];
  /** The word as it would be typed: names already known filled in. Empty when it starts with a placeholder still unnamed. */
  word: string;
  /** The template word, placeholders and all (`--table-name`, `<table>`), for a hint to show. */
  shown: string;
  /** A placeholder in this word with no name yet (`table`): the player picks one. */
  placeholder?: string;
  /** The word started at the end of the line (Tab finishes it). */
  partial: string;
  /** The line with the word typed in, or undefined when there's nothing to insert yet. */
  line?: string;
}

/**
 * What comes next in the step's command after what's typed (`typed`), in the command's own order: the next word, a
 * flag not given yet, or a flag's value. `values` are names the player used earlier in this workshop: a `<table>` the
 * player already named completes to that name. Undefined when nothing is left to type (or what's started fits nothing).
 */
export function nextWord(typed: string, cli: string, values: Record<string, string> = {}): NextWord | undefined {
  const want = units(cli);
  const ends = typed === '' || /\s$/.test(typed);
  const toks = tokenize(typed);
  const partial = ends ? '' : (toks.pop() ?? '');
  const base = ends ? typed : typed.slice(0, typed.search(/\S+$/));
  // What's typed so far: words up to the first flag, then the flags given and whether the last one waits for a value.
  let words = 0;
  while (words < toks.length && !toks[words].startsWith('-')) words++;
  const flags = new Set(toks.slice(words).filter((t) => t.startsWith('-')).map((t) => t.split('=')[0]));
  const last = toks[toks.length - 1];
  const wantWords = want.filter((u) => u.kind === 'word');
  // Off the command's path already (`aws s3` for a DynamoDB step): nothing to finish.
  if (toks.slice(0, Math.min(words, wantWords.length)).some((t, i) => !matches(wantWords[i].text, t, {}))) return undefined;
  let next: Unit | undefined;
  if (words < wantWords.length && flags.size === 0 && !partial.startsWith('-')) next = wantWords[words];
  else if (partial.startsWith('-')) next = want.find((u) => u.kind === 'flag' && !flags.has(u.text) && u.text.startsWith(partial));
  else {
    if (last?.startsWith('-') && !last.includes('=') && toks.length > words) next = want.find((u) => u.kind === 'value' && u.flag === last);
    next ??= want.find((u) => u.kind === 'flag' && !flags.has(u.text)) ?? want.find((u) => u.kind === 'stray' && !toks.includes(u.text));
  }
  if (!next) return undefined;
  // A known name fills its placeholder; the first unnamed one stops the word there (the player types that part).
  let placeholder: string | undefined;
  const filled = next.text.replace(PLACEHOLDER, (m, k: string) => {
    if (placeholder) return m;
    if (values[k]) return values[k];
    placeholder = k;
    return m;
  });
  const cut = placeholder ? filled.slice(0, filled.indexOf(`<${placeholder}>`)) : filled;
  const word = placeholder ? (/[\s"'{}]/.test(cut) ? '' : cut) : shellWord(filled);
  if (partial && !word.startsWith(partial) && !(placeholder && partial.startsWith(word))) return undefined;
  const line = word && word.length > partial.length ? `${base}${word}${placeholder ? '' : ' '}` : undefined;
  return { kind: next.kind, word, shown: next.text, placeholder, partial, line };
}

/**
 * Tab: finishes the word you've started (from the step's command), types the next command word, or fills a name you
 * used earlier. A flag needs its first letters (`--b` then Tab): Hint is for not knowing what comes next.
 */
export function tabComplete(typed: string, cli: string, values: Record<string, string> = {}): { line: string; note?: string } {
  const n = nextWord(typed, cli, values);
  if (!n) return { line: typed, note: tokenize(typed).length ? 'Nothing to finish here: check the command above, or press Enter to run it.' : undefined };
  if (n.kind === 'flag' && !n.partial) return { line: typed, note: 'Type the start of the next option (like --) and press Tab, or tap Hint.' };
  if (n.line) return { line: n.line, note: n.placeholder ? placeholderNote(n.placeholder) : undefined };
  return { line: typed, note: n.placeholder ? placeholderNote(n.placeholder) : undefined };
}

/**
 * Hint: the next word, like nextWord. At a placeholder it first types up to it (`s3://`) and says to pick a name; asked
 * again right there, it finishes the word with an example name (`s3://my-city-bucket-2026/seat-map.png`), so a hint is
 * never a dead end. `example` is the name it used.
 */
export function hintWord(typed: string, cli: string, values: Record<string, string> = {}): (NextWord & { example?: { name: string; value: string } }) | undefined {
  const n = nextWord(typed, cli, values);
  if (!n?.placeholder || n.line) return n;
  const value = exampleName(n.placeholder);
  const filled = nextWord(typed, cli, { ...values, [n.placeholder]: value });
  return filled?.line ? { ...filled, example: { name: n.placeholder, value } } : n;
}

/** "Fill my names": every `<name>` typed in the line swapped for the name used earlier in this workshop. */
export function fillNames(typed: string, values: Record<string, string>): string {
  return typed.replace(/<([a-z0-9-]+)>|\{\{([a-z0-9-]+)\}\}/gi, (m, a: string | undefined, b: string | undefined) => values[(a ?? b)!] ?? m);
}
