// The `npm start` panel: one calm block in the terminal, drawn in place (no full-screen takeover), under the still
// AWS City scene when the terminal has room for both (else its header carries a one-line skyline). A header line, a
// short checklist (✓ / spinner / ✗ with timings), what to do next, one status line and the keys you can press.
// It stays readable at 80×24 and simply sits in a wider terminal. `renderPanel` is pure (unit-tested);
// `createPanel` runs it. Without a terminal (a pipe, CI) it prints one plain line per change instead.
import { COLORS as C, paint, sceneLayout, sceneLines } from './banner.mjs';
import { elapsed } from './lib.mjs';

const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const GREEN = '#4ADE80';
const MAX_WIDTH = 96;
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''); // eslint-disable-line no-control-regex
const vlen = (s) => [...strip(s)].length;

/** Cuts plain text to `n` visible characters (with an ellipsis). */
export const cut = (s, n) => ([...s].length <= n ? s : n <= 0 ? '' : `${[...s].slice(0, n - 1).join('')}…`);

/** Word-wraps plain text to `n` columns (long words are cut). Continuation lines get `indent` (default: under a "1. " list number). */
export function wrap(s, n, indent = /^\d+\. /.test(s) ? '   ' : '') {
  if ([...s].length <= n) return [s];
  const out = [];
  let line = '';
  for (const word of s.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if ([...next].length <= n) line = next;
    else {
      if (line) out.push(line);
      line = `${indent}${cut(word, n - indent.length)}`;
    }
  }
  if (line) out.push(line);
  return out;
}

/** How far the run has got, 0..1: finished steps count whole, a running one its own progress (else half). */
export function stepsGrowth(steps) {
  if (!steps.length) return 1;
  let n = 0;
  for (const s of steps) {
    if (s.status === 'done' || s.status === 'skipped' || s.status === 'failed') n += 1;
    else if (s.status === 'running') n += typeof s.progress === 'number' ? Math.max(0, Math.min(1, s.progress)) : 0.5;
  }
  return Math.max(0, Math.min(1, n / steps.length));
}

// The header's little skyline: eight buildings that rise as the steps finish (the intro's city, in one line).
const HEIGHTS = [3, 5, 8, 6, 4, 7, 5, 2];
const BLOCKS = '▁▂▃▄▅▆▇█';
/** "▁▂▄▆▃▅▃▁"-style skyline for growth 0..1: every building at least a foundation, all full height at 1. */
export const miniSkyline = (growth) =>
  HEIGHTS.map((h, i) => {
    // Each building starts a little after the one before it, so the line fills left to right.
    const g = Math.max(0, Math.min(1, growth * 1.6 - i * 0.075));
    return BLOCKS[Math.max(0, Math.round(h * g) - 1)];
  }).join('');

/**
 * One screen of the panel.
 * state: { subtitle?, steps: [{ id, title, status: 'pending'|'running'|'done'|'failed'|'skipped', detail?, started?, ended?, progress? }],
 *          status?, info?: string[], infoTitle?, logs?: string[], showLogs?, logTitle?, keys?: [key, label][], note? }
 * Returns at most `rows - 1` lines, none wider than `cols - 1` (so the terminal never wraps or scrolls them).
 * Under the scene: `mini: false` drops the header's skyline (the scene is the picture). Both start at the left edge.
 */
export function renderPanel(state, t, cols, rows, { color = true, now = Date.now(), mini = true } = {}) {
  const w = Math.max(30, Math.min(cols - 1, MAX_WIDTH));
  const c = (s, hex, o) => (color && hex ? paint(s, hex, o) : s);
  const dim = (s) => c(s, C.dim);

  const sky = miniSkyline(stepsGrowth(state.steps));
  const header = `  ${mini ? `${c(sky, C.orange)}  ` : ''}${c('AWS City', C.orange, { bold: true })}${state.subtitle ? `   ${dim(cut(state.subtitle, w - 24))}` : ''}`;

  const titleW = Math.min(26, Math.max(...state.steps.map((s) => [...s.title].length), 10) + 2);
  const steps = state.steps.map((s) => {
    const icon = { done: ['✓', GREEN], failed: ['✗', C.beacon], skipped: ['–', C.dim], running: [SPIN[Math.floor(t * 10) % SPIN.length], C.amber], pending: ['·', C.dim] }[s.status];
    const time = s.started !== undefined && s.status !== 'pending' ? elapsed((s.ended ?? now) - s.started) : '';
    const bar = s.status === 'running' && s.progress !== undefined ? `${'▰'.repeat(Math.round(s.progress * 8))}${'▱'.repeat(8 - Math.round(s.progress * 8))} ` : '';
    const room = w - 2 - 2 - titleW - 9;
    const detail = room > 6 ? cut(`${bar}${s.detail ?? ''}`, room) : '';
    const title = cut(s.title, titleW - 1).padEnd(titleW);
    const titleCol = s.status === 'pending' ? dim(title) : s.status === 'running' ? c(title, C.text, { bold: true }) : title;
    const detailCol = s.status === 'failed' ? c(detail.padEnd(Math.max(0, room)), C.beacon) : dim(detail.padEnd(Math.max(0, room)));
    return `  ${c(icon[0], icon[1], { bold: true })} ${titleCol}${room > 6 ? detailCol : ''}${dim(time.padStart(9))}`.replace(/\s+$/, '');
  });

  const info = (state.info ?? []).flatMap((l) => wrap(l, w - 4)).map((l) => `    ${l}`);
  const infoBlock = info.length ? [`  ${c(state.infoTitle ?? 'Next', C.text, { bold: true })}`, ...info] : [];
  const logs = state.showLogs ? [`  ${c(state.logTitle ?? 'Log', C.text, { bold: true })}`, ...(state.logs?.length ? state.logs.slice(-6) : ['(nothing yet)']).map((l) => dim(`    ${cut(l, w - 4)}`))] : [];
  const status = state.status ? [`  ${c('›', C.orange, { bold: true })} ${cut(state.status, w - 4)}`] : [];
  // Keys: "c city · p practice console · q quit", wrapped rather than losing "q quit" at 80 columns.
  const keyRows = [];
  for (const [k, label] of state.keys ?? []) {
    const plainPiece = `${k} ${label}`;
    const piece = `${c(k, C.amber, { bold: true })} ${dim(label)}`;
    const last = keyRows.at(-1);
    if (last && last.n + 3 + [...plainPiece].length <= w - 2) {
      last.text += dim(' · ') + piece;
      last.n += 3 + [...plainPiece].length;
    } else keyRows.push({ text: piece, n: [...plainPiece].length });
  }
  const keys = keyRows.map((r) => `  ${r.text}`);
  const note = state.note ? [`  ${dim(cut(state.note, w - 2))}`] : [];

  // Fit the height: logs go first, then the "next" lines are cut down, never the steps, status or keys.
  const budget = Math.max(4, rows - 1);
  const fixed = 1 + 1 + steps.length + 1 + status.length + keys.length + note.length;
  let infoFit = infoBlock;
  let logFit = logs;
  if (fixed + infoFit.length + (infoFit.length ? 1 : 0) + logFit.length + (logFit.length ? 1 : 0) > budget) logFit = [];
  const spare = budget - fixed - (infoFit.length ? 1 : 0);
  if (infoFit.length > spare) infoFit = spare >= 2 ? [...infoFit.slice(0, spare - 1), `    ${dim('…')}`] : [];

  const lines = [header, '', ...steps, ''];
  if (infoFit.length) lines.push(...infoFit, '');
  if (logFit.length) lines.push(...logFit, '');
  lines.push(...status, ...keys, ...note);
  while (lines.at(-1) === '') lines.pop();
  return lines.slice(0, budget).map((l) => (vlen(l) > cols - 1 ? cut(strip(l), cols - 1) : l));
}

// Live drawing needs a terminal on both ends; NO_COLOR only turns the colours off (the keys still work).
export const isInteractive = () => Boolean(process.stdout.isTTY && process.stdin.isTTY && !process.env.CI);

/**
 * Runs the panel: redrawn in place about ten times a second while something moves, nothing otherwise.
 * Returns controls: set(id, patch), status(text), log(line), info(lines, title), waitKey(items), close(summary).
 * Ctrl-C replaces the panel with `onInterrupt()`'s lines and exits (130); the exit handlers stop the children
 * (scripts/launcher/cleanup.mjs).
 */
/** Rows the panel needs under the scene: header, the steps, one "next" line, the status and two rows of keys. */
export const panelReserve = (stepCount) => stepCount + 8;

/**
 * `scene`: the layout of the still scene printed right above (`printScene`), null when it didn't fit, undefined for
 * no scene at all. With it the panel lines up under the scene and keeps clear of it; a resize clears the screen and
 * prints the scene again if it fits now (else the header's one-line skyline stands in).
 */
export function createPanel(steps, { subtitle, onInterrupt = () => [], scene } = {}) {
  const withScene = scene !== undefined;
  const state = { subtitle, steps: steps.map((s) => ({ status: 'pending', ...s })), logs: [] };
  const live = isInteractive();
  const color = !process.env.NO_COLOR;
  const out = process.stdout;
  const started = Date.now();
  let drawn = 0;
  let lastText = '';
  let lastCols = out.columns;
  let timer;
  let onKey;
  let open = live;

  const paintLines = (lines) => {
    // Back to the first line drawn last time, then overwrite (and clear whatever is left below).
    const up = drawn > 1 ? `\x1b[${drawn - 1}A` : '';
    out.write(`${up}\r${lines.map((l) => `${l}\x1b[K`).join('\n')}\x1b[J`);
    drawn = lines.length;
  };
  const draw = () => {
    if (!open) return;
    const rows = (out.rows ?? 24) - (scene?.rows ?? 0);
    const lines = renderPanel(state, (Date.now() - started) / 1000, out.columns ?? 80, rows, { color, mini: !scene });
    const text = lines.join('\n');
    if (text === lastText) return;
    lastText = text;
    paintLines(lines);
  };
  const onResize = () => {
    // A narrower terminal re-wraps what's on screen, so the cursor maths would be off: start the panel afresh.
    // Under the scene, any resize starts afresh: the scene may grow, shrink or no longer fit.
    if (withScene || (out.columns ?? 80) < (lastCols ?? 80)) {
      out.write('\x1b[2J\x1b[H');
      drawn = 0;
    }
    if (withScene) {
      const cols = out.columns ?? 80;
      scene = sceneLayout(cols, out.rows ?? 24, panelReserve(state.steps.length));
      if (scene) out.write(`\n${sceneLines(cols, scene, { color }).join('\n')}\n\n`);
    }
    lastCols = out.columns;
    lastText = '';
    draw();
  };
  const onData = (buf) => {
    const k = buf.toString().toLowerCase();
    if (k.includes('\u0003')) {
      finish(onInterrupt());
      process.exit(130);
    }
    onKey?.(k === '\r' || k === '\n' ? 'enter' : k);
  };
  const finish = (summary) => {
    if (!open) {
      if (summary.length && !live) console.log(`\n${summary.join('\n')}\n`);
      return;
    }
    draw();
    open = false;
    clearInterval(timer);
    out.off('resize', onResize);
    process.stdin.off('data', onData);
    const room = (out.columns ?? 80) - 1;
    if (summary.length) paintLines(summary.map((l) => (vlen(l) > room ? cut(strip(l), room) : l)));
    try {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      out.write('\n\x1b[?25h');
    } catch {
      // the terminal closed
    }
  };

  if (live) {
    out.write('\x1b[?25l');
    timer = setInterval(draw, 100);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
    process.once('exit', () => finish([]));
    out.on('resize', onResize);
    draw();
  } else console.log(`AWS City${subtitle ? ` · ${subtitle}` : ''}`);

  const plain = (msg) => !live && console.log(msg);
  return {
    state,
    set(id, patch) {
      const s = state.steps.find((x) => x.id === id);
      if (!s) return;
      if (patch.status === 'running' && s.status !== 'running') {
        s.started = Date.now();
        s.ended = undefined;
        s.progress = undefined;
      }
      if ((patch.status === 'done' || patch.status === 'failed' || patch.status === 'skipped') && !s.ended) s.ended = Date.now();
      Object.assign(s, patch);
      if (patch.status && patch.status !== 'running') plain(`${{ done: '✓', failed: '✗', skipped: '–', pending: '·' }[patch.status]} ${s.title}${s.detail ? ` — ${s.detail}` : ''}`);
      draw();
    },
    status(text) {
      state.status = text;
      draw();
    },
    log(line) {
      state.logs.push(line);
      if (state.logs.length > 200) state.logs.shift();
    },
    toggleLogs(show = !state.showLogs) {
      state.showLogs = show;
      draw();
    },
    logTitle(title) {
      state.logTitle = title;
    },
    info(lines, title) {
      state.info = lines;
      state.infoTitle = title;
      if (lines?.length) plain(`\n${title ?? 'Next'}\n${lines.map((l) => `  ${l}`).join('\n')}`);
      draw();
    },
    /** Waits for one of the item keys; without a terminal it returns 'q' (scripts never hang). */
    waitKey(items) {
      state.keys = items;
      draw();
      if (!live) return Promise.resolve('q');
      const keys = new Set(items.map(([k]) => k));
      return new Promise((resolve) => {
        onKey = (k) => {
          if (!keys.has(k)) return;
          onKey = undefined;
          state.keys = [];
          resolve(k);
        };
      });
    },
    /** Replaces the panel with `summary` (what stays in the terminal) and gives the terminal back. */
    close(summary = []) {
      finish(summary);
    },
  };
}
