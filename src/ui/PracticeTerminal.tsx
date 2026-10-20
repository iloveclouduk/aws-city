import { useEffect, useRef, useState } from 'react';
import { fillNames, hintWord, nextWord, placeholderNote, run, tabComplete, type TerminalStep } from '@/learning/terminal';
import { feel } from './feedback';

interface Line {
  kind: 'in' | 'out' | 'err' | 'ok';
  text: string;
}

/**
 * The practice terminal: type the step's command (nothing reaches AWS). A right command prints what the real CLI would
 * and passes the step with the names you typed; a known mistake prints the real error and what to change.
 * Help, like a real shell's: Tab finishes the word you've started, ↑ brings back lines from this whole workshop, Hint
 * types the next word for a star, and "Fill my names" swaps `<table>` for the name you used earlier in the workshop.
 */
export function PracticeTerminal(props: {
  step: TerminalStep;
  onPass: (values: Record<string, string>, hints: number) => void;
  label: string;
  /** Names used earlier in this workshop (`table` → `orders`). */
  names?: Record<string, string>;
  /** This workshop's lines so far (oldest first), and where a new one goes. */
  history?: string[];
  onLine?: (line: string) => void;
  /** Stars the step pays now: hints cost one each, down to one (0: nothing left to pay, so hints are free). */
  worth?: number;
}) {
  const { step, onPass, label, names = {}, history = [], onLine, worth = 0 } = props;
  const paid = worth <= 0;
  const [lines, setLines] = useState<Line[]>([]);
  const [cmd, setCmd] = useState('');
  const [at, setAt] = useState<number>();
  const [note, setNote] = useState<string>();
  const [hints, setHints] = useState(0);
  const [passed, setPassed] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = screen.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const type = (line: string) => {
    setCmd(line);
    // The caret goes to the end, where the next word is typed.
    requestAnimationFrame(() => {
      const el = input.current;
      if (el) el.selectionStart = el.selectionEnd = el.value.length;
    });
  };

  const submit = () => {
    const line = cmd.trim();
    if (!line) return;
    onLine?.(line);
    setAt(undefined);
    setCmd('');
    setNote(undefined);
    if (line === 'clear') return setLines([]);
    const r = run(line, step);
    const echo: Line = { kind: 'in', text: line };
    if (r.kind === 'empty') return;
    if (r.kind === 'ok') {
      // The pass sound and stars come from the workshop (one sound per outcome, whichever way the step was done).
      setPassed(true);
      setLines((l) => [...l, echo, ...(r.output ? [{ kind: 'out' as const, text: r.output }] : []), { kind: 'ok', text: '✓ That worked. Step done.' }]);
      onPass(r.values, hints);
    } else if (r.kind === 'error') {
      feel.bad();
      setLines((l) => [...l, echo, { kind: 'err', text: r.output }, { kind: 'ok', text: `💡 ${r.error.explain} ${r.error.fix}` }]);
    } else {
      // A placeholder typed as shown is a teaching note, not a mistake; anything else is a miss.
      if (/^Swap `/.test(r.output)) feel.tap();
      else feel.bad();
      setLines((l) => [...l, echo, { kind: 'err', text: r.output }]);
    }
  };

  const recall = (dir: -1 | 1) => {
    if (!history.length) return;
    const i = Math.max(0, Math.min(history.length - 1, (at ?? history.length) + dir));
    setAt(i);
    type(history[i]);
  };

  const tab = () => {
    const r = tabComplete(cmd, step.cli, names);
    if (r.line !== cmd) (feel.tap(), type(r.line));
    setNote(r.note);
  };

  const hint = () => {
    const n = hintWord(cmd, step.cli, names);
    feel.tap();
    if (!n) return setNote('That’s the whole command: press Enter to run it.');
    // Each hint costs a star on this step (a free one once the step pays nothing more).
    if (!paid) setHints((h) => h + 1);
    if (n.line) type(n.line);
    if (n.example) setNote(`Typed an example name for \`<${n.example.name}>\`: \`${n.example.value}\`. Any name of your own works too.`);
    else if (n.placeholder) setNote(`Next: ${n.word ? `\`${n.word}\` then ` : ''}a name of your own for \`<${n.placeholder}>\`. ${placeholderNote(n.placeholder)}`);
    else setNote(`Next: \`${n.word}\`${n.kind === 'flag' ? ' (an option)' : ''}.`);
    input.current?.focus();
  };

  const known = Object.keys(names).length > 0;
  const fill = () => {
    feel.tap();
    const filled = fillNames(cmd, names);
    if (filled !== cmd) return void (type(filled), setNote(undefined));
    const n = nextWord(cmd, step.cli, names);
    if (n?.line && n.shown.includes('<')) return void (type(n.line), setNote(undefined));
    setNote('No names to fill just now. They go in where the command has a `<name>`.');
  };

  return (
    <div className="terminal">
      {/* A scrolling log has to be reachable by keyboard to be read (WCAG 2.1.1; axe scrollable-region-focusable). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div ref={screen} className="terminal-screen" role="log" aria-live="polite" aria-label={`${label}: output`} tabIndex={0}>
        {lines.length === 0 && <div className="terminal-hint">Nothing here touches AWS. Type the command and press Enter. Tab finishes a word, ↑ brings back an earlier line.</div>}
        {lines.map((l, i) => (
          <pre key={i} className={`terminal-line ${l.kind}`}>
            {l.kind === 'in' ? `$ ${l.text}` : l.text}
          </pre>
        ))}
      </div>
      {/* The input and its tools stay in sight at the bottom of the dialog while the terminal is on screen (sticky). */}
      <div className="terminal-dock">
        <form
          className="terminal-input"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <span aria-hidden="true">$</span>
          <textarea
            ref={input}
            value={cmd}
            rows={1}
            onChange={(e) => (setCmd(e.target.value), setNote(undefined))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), submit());
              else if (e.key === 'Tab' && !e.shiftKey && cmd.length > 0) (e.preventDefault(), tab());
              else if (e.key === 'ArrowUp' && !cmd.includes('\n')) (e.preventDefault(), recall(-1));
              else if (e.key === 'ArrowDown' && !cmd.includes('\n')) (e.preventDefault(), recall(1));
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-label={label}
            aria-describedby={note ? 'terminal-note' : undefined}
            placeholder="aws …"
          />
        </form>
        <div className="terminal-tools">
          <button type="button" className="btn tiny ghost" onClick={hint} disabled={passed} title="Types the next word of the command for you">
            💡 Hint{worth > 1 && ' (−1⭐)'}
          </button>
          {known && (
            <button type="button" className="btn tiny ghost" onClick={fill} disabled={passed} title={`Your names: ${Object.entries(names).map(([k, v]) => `${k} = ${v}`).join(', ')}`}>
              Fill my names
            </button>
          )}
          <button type="button" className="btn tiny ghost" onClick={tab} disabled={passed || !cmd} title="Finishes the word you’ve started (the Tab key does too)">
            Tab ⇥
          </button>
          {hints > 0 && worth > 1 && (
            <span className="muted small">
              {hints} hint{hints > 1 ? 's' : ''} · −{Math.min(hints, Math.max(0, worth - 1))}⭐
            </span>
          )}
        </div>
        {note && (
          <p id="terminal-note" className="terminal-note" role="status">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
