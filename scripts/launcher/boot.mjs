// `npm start` begins here, before any package is installed: only Node's own modules, so a fresh clone never crashes
// on a missing import. It checks Node, installs the packages when they're missing or out of date (a quiet spinner,
// the full npm output in .cache/npm-install.log), then hands over to scripts/start.mjs.
// `npm run live` comes through here too (scripts/live.mjs adds --live).
import './require-node.mjs';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const INSTALL_LOG = path.join(ROOT, '.cache/npm-install.log');
/** Packages the launcher imports itself: if any is missing, node_modules is half-installed. */
export const KEY_PACKAGES = ['@clack/prompts', 'picocolors', 'playwright', 'wxt'];
/** npm writes its hidden lockfile with package-lock.json; a lockfile newer than that (a pull, a branch) means new packages. */
const SLACK_MS = 2000;

/**
 * Should boot install packages, and how? Pure (unit-tested).
 * facts: { hasModules, missing: string[] (key packages not found), hasLock, lockMtime?, hiddenMtime? (node_modules/.package-lock.json) }
 * Returns { install: false } or { install: true, reason, args } where args are npm's.
 */
export function depsPlan({ hasModules, missing = [], hasLock, lockMtime, hiddenMtime }) {
  const args = [hasLock ? 'ci' : 'install', '--no-audit', '--no-fund', '--loglevel=error'];
  if (!hasModules) return { install: true, reason: 'missing', args };
  if (missing.length) return { install: true, reason: 'incomplete', args };
  if (hasLock && (hiddenMtime === undefined || lockMtime - hiddenMtime > SLACK_MS)) return { install: true, reason: 'changed', args };
  return { install: false };
}

/** What the spinner says while npm works. */
export const installMessage = (reason) =>
  ({
    missing: 'Installing AWS City’s packages (first time only, 1–3 min)',
    incomplete: 'Finishing AWS City’s packages (some are missing)',
    changed: 'Updating AWS City’s packages (the package list changed)',
  })[reason] ?? 'Installing AWS City’s packages';

/** Why `npm ci`/`npm install` failed, in a sentence and a next step, from its output. Pure (unit-tested). */
export function explainNpmError(output = '', code) {
  if (code === 'ENOENT') return 'npm isn’t installed (or isn’t on your PATH). It comes with Node.js: install Node 24 from https://nodejs.org, open a new terminal, then run npm start again.';
  if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|getaddrinfo|socket hang up|network/i.test(output))
    return 'Couldn’t reach the npm registry: check your internet connection (or proxy), then run npm start again.';
  if (/ENOSPC|no space left/i.test(output)) return 'The disk is full: free up about 1 GB, then run npm start again.';
  if (/EACCES|EPERM|permission denied/i.test(output)) return 'npm wasn’t allowed to write here (permission denied). Check you own this folder (no sudo), then run npm start again.';
  if (/EBADENGINE|Unsupported engine/i.test(output)) return 'A package needs a newer Node.js: install Node 24 from https://nodejs.org, then run npm start again.';
  if (/in sync|EUSAGE/i.test(output)) return 'package.json and package-lock.json disagree: run npm install once, then npm start again.';
  return 'npm couldn’t install the packages.';
}

/** The facts depsPlan needs, read from disk. */
export function readDepsFacts(root = ROOT) {
  const mtime = (p) => {
    try {
      return statSync(path.join(root, p)).mtimeMs;
    } catch {
      return undefined;
    }
  };
  return {
    hasModules: existsSync(path.join(root, 'node_modules')),
    missing: KEY_PACKAGES.filter((p) => !existsSync(path.join(root, 'node_modules', p, 'package.json'))),
    hasLock: existsSync(path.join(root, 'package-lock.json')),
    lockMtime: mtime('package-lock.json'),
    hiddenMtime: mtime('node_modules/.package-lock.json'),
  };
}

const elapsed = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};

/** Runs npm with a one-line spinner; everything npm says goes to the log file. Resolves { ok, output, code }. */
function runNpm(args, message) {
  const tty = Boolean(process.stdout.isTTY) && !process.env.CI;
  const color = tty && !process.env.NO_COLOR;
  const dim = (s) => (color ? `\x1b[2m${s}\x1b[22m` : s);
  mkdirSync(path.dirname(INSTALL_LOG), { recursive: true });
  const log = createWriteStream(INSTALL_LOG, { flags: 'w' });
  log.write(`$ npm ${args.join(' ')}\n`);
  const started = Date.now();
  const frames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  let i = 0;
  const line = () => `\r  ${color ? '\x1b[33m' : ''}${frames[i++ % frames.length]}${color ? '\x1b[39m' : ''} ${message}… ${dim(elapsed(Date.now() - started))}\x1b[K`;
  let timer;
  if (tty) {
    process.stdout.write('\x1b[?25l');
    timer = setInterval(() => process.stdout.write(line()), 100);
  } else console.log(`… ${message}`);
  return new Promise((resolve) => {
    let output = '';
    // npm is npm.cmd on Windows: only a shell can start it there.
    const child = spawn('npm', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    const read = (d) => {
      log.write(d);
      output = (output + d).slice(-20_000);
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    // Ctrl-C: npm gets it too (same process group); just put the cursor back.
    const onInt = () => {
      clearInterval(timer);
      if (tty) process.stdout.write('\r\x1b[K\x1b[?25h');
      process.exit(130);
    };
    process.once('SIGINT', onInt);
    const done = (ok, code) => {
      process.off('SIGINT', onInt);
      clearInterval(timer);
      log.end();
      const took = dim(`(${elapsed(Date.now() - started)})`);
      if (tty) process.stdout.write(`\r\x1b[K\x1b[?25h`);
      console.log(ok ? `  ${color ? '\x1b[32m✓\x1b[39m' : '✓'} Packages ready ${took}\n` : `  ${color ? '\x1b[31m✗\x1b[39m' : '✗'} ${message} failed ${took}`);
      resolve({ ok, output, code });
    };
    child.on('error', (err) => done(false, err.code));
    child.on('close', (code) => done(code === 0, code));
  });
}

/** Installs what's missing, then runs the launcher. */
export async function boot() {
  // --help and typos answer at once, before any install (lib.mjs needs no packages either).
  const { helpText, parseArgs } = await import('./lib.mjs');
  const args = parseArgs(process.argv.slice(2), process.env);
  if (args.help || args.error) {
    if (args.error) console.error(`\n✗ ${args.error}\n`);
    (args.error ? console.error : console.log)(helpText());
    process.exit(args.error ? 1 : 0);
  }
  const plan = depsPlan(readDepsFacts());
  if (plan.install) {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major === 24 && minor < 15) console.log(`  ℹ Node.js ${process.versions.node} works; 24.15+ avoids a few install warnings.`);
    let r = await runNpm(plan.args, installMessage(plan.reason));
    // A lockfile npm ci won't take (edited package.json): one plain install fixes it.
    if (!r.ok && plan.args[0] === 'ci' && /in sync|EUSAGE/i.test(r.output)) r = await runNpm(['install', ...plan.args.slice(1)], 'Installing AWS City’s packages (npm install)');
    if (!r.ok) {
      console.error(`\n  ${explainNpmError(r.output, r.code)}`);
      console.error(`  npm’s full output: ${path.relative(process.cwd(), INSTALL_LOG) || INSTALL_LOG}\n`);
      process.exit(1);
    }
  }
  await import(pathToFileURL(path.join(ROOT, 'scripts/start.mjs')).href);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await boot();
