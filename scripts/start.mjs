// `npm start`, the one command (scripts/launcher/boot.mjs installs the packages first, then runs this). The first
// time it asks how you want to play and which browser; after that one "Play again?" line. It checks and fixes
// everything on the way (browser, AWS sign-in, Bedrock access), skips the build when nothing changed, opens the city
// and stays its remote control (scripts/launcher/panel.mjs). On stage: `npm start -- --demo --browser cft` asks nothing.
import './launcher/require-node.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { playIntro, printScene } from './launcher/banner.mjs';
import { installCleanup, track } from './launcher/cleanup.mjs';
import { browserById, buildAsync, buildCommand, hasChromeForTesting, installChromeForTesting, launchControlled, openIn, SAFARI_PROJECT } from './launcher/open-browser.mjs';
import { createPanel, isInteractive, miniSkyline, panelReserve, renderPanel } from './launcher/panel.mjs';
import { liveConfig, portBusy, SERVER_LOG, startServer } from './launcher/live-run.mjs';
import { sourceStamp } from './launcher/stamp.mjs';
import {
  alreadyOpenPid,
  choiceLabel,
  detectBrowsers,
  explainAwsError,
  explainDownloadError,
  extensionsPage,
  helpText,
  introPlays,
  listProfiles,
  meaningfulLines,
  parseArgs,
  parsePastedKeys,
  pickProfile,
  REGION_RE,
  startPlan,
  upsertProfile,
} from './launcher/lib.mjs';

// Options first: --help and mistakes answer at once, before any animation.
const args = parseArgs(process.argv.slice(2), process.env);
if (args.help || args.error) {
  if (args.error) console.error(`\n✗ ${args.error}\n`);
  (args.error ? console.error : console.log)(helpText());
  process.exit(args.error ? 1 : 0);
}
installCleanup();

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PREFS = path.join(ROOT, '.cache/launcher.json');
const AWS_DIR = path.join(os.homedir(), '.aws');
const PROFILE = 'aws-city';
// server/src/config.ts defaults: the main model, and the fallback/light model it drops to.
const MAIN_MODEL = 'us.anthropic.claude-opus-5-5';
const LIGHT_MODEL = 'us.anthropic.claude-sonnet-5-5';
const interactive = isInteractive();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── small helpers ────────────────────────────────────────────────────────────
const readPrefs = () => {
  try {
    return JSON.parse(readFileSync(PREFS, 'utf8'));
  } catch {
    return {};
  }
};
/** Merges `patch` into .cache/launcher.json (choices, the last build's fingerprint, whether the intro has played). */
const savePrefs = (patch) => {
  mkdirSync(path.dirname(PREFS), { recursive: true });
  writeFileSync(PREFS, JSON.stringify({ ...readPrefs(), ...patch }, null, 2));
};
const bye = (msg = 'See you in the city!') => {
  p.outro(msg);
  process.exit(0);
};
const ask = async (prompt) => {
  const v = await prompt;
  if (p.isCancel(v)) bye('Stopped. Nothing was changed.');
  return v;
};
const has = (cmd, args = ['--version']) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
/** Runs a command without blocking, so spinners keep turning and Ctrl-C stops it too. Resolves true on success. */
const runQuiet = (cmd, cmdArgs) =>
  new Promise((resolve) => {
    const child = track(spawn(cmd, cmdArgs, { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' }));
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });

/** The AWS SDK lives in server/node_modules (the server needs it anyway); install it the first time. */
async function awsTools() {
  if (!existsSync(path.join(ROOT, 'server/node_modules/@aws-sdk/client-sts'))) {
    sceneDirty = true;
    const s = p.spinner();
    s.start('Getting the AWS tools ready (one time, about a minute)…');
    const ok = await runQuiet('npm', ['--prefix', 'server', 'ci', '--no-audit', '--no-fund', '--loglevel=error']);
    if (!ok) {
      s.stop('Couldn’t install the server’s packages.', 1);
      bye(`Run ${pc.cyan('cd server && npm ci')} to see why, then ${pc.cyan('npm start')} again.`);
    }
    s.stop('AWS tools ready');
  }
  const req = createRequire(path.join(ROOT, 'server/package.json'));
  return { sts: req('@aws-sdk/client-sts'), providers: req('@aws-sdk/credential-providers'), bedrock: req('@anthropic-ai/bedrock-sdk') };
}

const awsFiles = () => ({
  credentials: existsSync(path.join(AWS_DIR, 'credentials')) ? readFileSync(path.join(AWS_DIR, 'credentials'), 'utf8') : '',
  config: existsSync(path.join(AWS_DIR, 'config')) ? readFileSync(path.join(AWS_DIR, 'config'), 'utf8') : '',
});

async function whoAmI(tools, profile, region) {
  const credentials = tools.providers.fromIni({ profile, ignoreCache: true });
  const out = await new tools.sts.STSClient({ region, credentials }).send(new tools.sts.GetCallerIdentityCommand({}));
  return { account: out.Account, arn: out.Arn };
}

/** AWS CLI v2 with `aws login` (2.32+); installs or upgrades it with Homebrew when allowed. */
async function ensureAwsCli() {
  const supportsLogin = () => spawnSync('aws', ['login', 'help'], { stdio: 'ignore' }).status === 0;
  if (has('aws') && supportsLogin()) return true;
  const verb = has('aws') ? 'upgrade' : 'install';
  if (!has('brew')) {
    p.log.warn(`This needs the AWS CLI (v2.32 or newer). Install it from ${pc.cyan('https://aws.amazon.com/cli/')}, then run ${pc.cyan('npm start')} again.`);
    return false;
  }
  const ok = await ask(p.confirm({ message: `${verb === 'install' ? 'Install' : 'Update'} the AWS CLI with Homebrew? (needed for browser sign-in)`, initialValue: true }));
  if (!ok) return false;
  const s = p.spinner();
  s.start(`${verb === 'install' ? 'Installing' : 'Updating'} the AWS CLI…`);
  const done = await runQuiet('brew', [verb, 'awscli']);
  s.stop(done ? 'AWS CLI ready' : 'Homebrew couldn’t install it', done ? 0 : 1);
  return done && supportsLogin();
}

function saveKeys(keys) {
  mkdirSync(AWS_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(AWS_DIR, 'credentials');
  writeFileSync(file, upsertProfile(awsFiles().credentials, PROFILE, keys), { mode: 0o600 });
  chmodSync(file, 0o600);
}

/**
 * Make sure we can reach AWS; returns { profile, account }. The first check is silent (the panel shows the account);
 * only when it fails does it explain why and offer the ways to sign in.
 */
async function connectAws(tools, region, prefs, wanted) {
  const { credentials, config } = awsFiles();
  const profiles = listProfiles(credentials, config);
  let profile = wanted ?? (prefs.profile && profiles.includes(prefs.profile) ? prefs.profile : pickProfile(profiles));
  let quiet = true;

  for (;;) {
    if (profile) {
      const s = quiet ? undefined : p.spinner();
      s?.start(`Checking your AWS sign-in (${profile})…`);
      try {
        const me = await whoAmI(tools, profile, region);
        s?.stop(`Signed in to AWS account ${pc.bold(me.account)} ${pc.dim(`(${profile})`)}`);
        return { profile, account: me.account };
      } catch (err) {
        const why = profiles.includes(profile) || process.env.AWS_CONFIG_FILE || process.env.AWS_SHARED_CREDENTIALS_FILE ? explainAwsError(err) : `There's no AWS profile called "${profile}" in ~/.aws.`;
        if (s) s.stop(why, 1);
        else p.log.warn(why);
      }
    } else if (quiet) p.log.warn('No AWS sign-in on this computer yet.');
    quiet = false;
    sceneDirty = true;
    if (!interactive) {
      console.error(`\n  Sign in once in a terminal: run ${pc.cyan('npm start')} and pick "Real AWS".\n`);
      process.exit(1);
    }

    const choice = await ask(
      p.select({
        message: 'How do you want to connect to AWS?',
        options: [
          { value: 'login', label: '🌐 Sign in with your browser', hint: 'recommended: no keys to copy' },
          { value: 'paste', label: '📋 Paste temporary keys', hint: 'from Workshop Studio or the access portal' },
          { value: 'sso', label: '🏢 AWS IAM Identity Center (SSO)', hint: 'your company’s AWS start URL' },
          ...profiles.filter((x) => x !== profile).map((x) => ({ value: `profile:${x}`, label: `Use the "${x}" profile`, hint: 'already on this Mac' })),
        ],
      }),
    );

    if (choice.startsWith('profile:')) {
      profile = choice.slice('profile:'.length);
      continue;
    }
    if (choice === 'login' || choice === 'sso') {
      if (!(await ensureAwsCli())) continue;
      p.log.info(choice === 'login' ? 'A browser tab opens: sign in to the AWS console, then come back here.' : 'Answer the questions (start URL, region, account, role); a browser tab opens to sign in.');
      const args = choice === 'login' ? ['login', '--profile', PROFILE, '--region', region] : ['configure', 'sso', '--profile', PROFILE];
      spawnSync('aws', args, { stdio: 'inherit' });
      profile = PROFILE;
      continue;
    }
    // paste: read the clipboard (macOS), else ask one by one. Keys are never printed.
    p.log.info(`In Workshop Studio: ${pc.bold('Get AWS CLI credentials')} → copy the ${pc.bold('macOS / Linux')} block (or the access portal's "Option 1").`);
    await ask(p.text({ message: 'Copied? Press Enter', defaultValue: '', placeholder: 'Enter' }));
    let keys = has('pbpaste', []) ? parsePastedKeys(spawnSync('pbpaste', [], { encoding: 'utf8' }).stdout ?? '') : undefined;
    if (!keys) {
      p.log.warn('Didn’t find keys on the clipboard, so let’s type them in.');
      const accessKeyId = (await ask(p.text({ message: 'Access key ID', validate: (v) => (/^(AKIA|ASIA)[A-Z0-9]{12,}$/.test((v ?? '').trim()) ? undefined : 'starts with AKIA or ASIA') }))).trim();
      const secretAccessKey = (await ask(p.password({ message: 'Secret access key', validate: (v) => ((v ?? '').trim().length >= 30 ? undefined : 'that looks too short') }))).trim();
      const sessionToken = accessKeyId.startsWith('ASIA') ? (await ask(p.password({ message: 'Session token (temporary keys have one)' }))).trim() : undefined;
      keys = { accessKeyId, secretAccessKey, sessionToken };
    }
    saveKeys(keys);
    p.log.success(`Saved as the "${PROFILE}" profile in ~/.aws/credentials (only you can read it).`);
    profile = PROFILE;
  }
}

/** One tiny Claude call on Bedrock, so missing model access shows up now instead of in the game. */
async function bedrockHello(tools, profile, region) {
  try {
    const client = new tools.bedrock.AnthropicBedrock({ awsRegion: region, providerChainResolver: async () => tools.providers.fromIni({ profile }) });
    const hello = (model) => client.messages.create({ model, max_tokens: 64, messages: [{ role: 'user', content: 'Reply with OK.' }] });
    await hello(LIGHT_MODEL);
    // The server falls back to Sonnet when Opus isn't enabled: fine to play, but say so instead of "ready".
    const main = await hello(MAIN_MODEL).then(
      () => true,
      () => false,
    );
    return { ok: true, detail: main ? 'Claude Opus + Sonnet are ready' : 'Claude Sonnet is ready (Opus isn’t enabled here, so the city uses Sonnet)' };
  } catch (err) {
    return {
      ok: false,
      message: explainAwsError(err),
      hint: `If Claude isn't enabled here, turn it on: https://${region}.console.aws.amazon.com/bedrock/home?region=${region}#/modelaccess`,
    };
  }
}

/** What the last failed step left to read after the launcher closes (e.g. the build's last lines). */
let lastFailure;

/** Closes the other AWS City window (it saves its profile as it goes) and waits up to 5 s for it to let go. */
async function closeOther(pid) {
  const alive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return e.code === 'EPERM';
    }
  };
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return 'That window had already closed. Trying again…';
  }
  for (let i = 0; i < 50 && alive(); i++) await sleep(100);
  return alive() ? 'It is still closing; press t in a moment.' : 'Closed the other window. Trying again…';
}

/**
 * Runs one step. On failure it shows why and offers t try again, a fix (e.g. k close the other window), c continue
 * (when allowed) and q quit. Returns false when the player quits.
 */
async function runStep(dash, id, fn, { canSkip = false } = {}) {
  for (;;) {
    dash.set(id, { status: 'running', detail: '' });
    const r = await fn();
    if (r.ok) {
      dash.set(id, { status: 'done', detail: r.detail ?? '', progress: undefined });
      dash.status('');
      lastFailure = undefined;
      return true;
    }
    dash.set(id, { status: 'failed', detail: r.message ?? 'failed', progress: undefined });
    dash.status(r.hint ?? 'Press t to try again.');
    const key = await dash.waitKey([['t', 'try again'], ...(r.fix ? [[r.fix.key, r.fix.label]] : []), ...(canSkip ? [['c', 'continue anyway']] : []), ['q', 'quit']]);
    // A failure that can fix itself (e.g. close the other window), on the player's say-so; then try again.
    if (r.fix && key === r.fix.key) {
      dash.status(await r.fix.run());
      dash.info(undefined);
      lastFailure = undefined;
      continue;
    }
    if (key === 'c') {
      dash.set(id, { status: 'skipped' });
      dash.info(undefined);
      lastFailure = undefined;
      return true;
    }
    if (key !== 't') return false;
    dash.info(undefined);
    lastFailure = undefined;
  }
}

const OUT_DIR = { chrome: 'chrome-mv3', firefox: 'firefox-mv3', safari: 'safari-mv3' };
/** Forgets (undefined) or records the fingerprint of what's in .output/<dir>. */
const rememberBuild = (dir, stamp) => {
  const builds = { ...readPrefs().builds };
  if (stamp) builds[dir] = stamp;
  else delete builds[dir];
  savePrefs({ builds });
};

/**
 * Builds with the step's bar driven by WXT's real stages, or skips it when nothing it reads has changed since the
 * last build of the same kind (`--rebuild` forces it). On failure the build's last lines stay on screen.
 */
const buildStep = (dash, browser, env = {}) => async () => {
  const kind = browserById(browser).build;
  const dir = OUT_DIR[kind];
  const stamp = sourceStamp(ROOT, kind, env);
  if (!args.rebuild && readPrefs().builds?.[dir] === stamp && existsSync(path.join(ROOT, '.output', dir, 'manifest.json'))) return { ok: true, detail: 'up to date (no changes)' };
  rememberBuild(dir, undefined); // a build stopped halfway must not count as done
  dash.status('Building the extension…');
  const r = await buildAsync(browser, env, (e) => {
    if (e.done) return;
    dash.set('build', { progress: e.step / e.of, detail: `${e.name} (${e.step}/${e.of})` });
  });
  if (r.ok) {
    rememberBuild(dir, stamp);
    return { ok: true, detail: 'built fresh' };
  }
  const tail = r.tail.split('\n').filter((l) => l.trim()).slice(-8);
  const command = buildCommand(browser);
  lastFailure = { title: 'The build’s last lines', lines: tail, next: `To see all of it, run: ${command}` };
  dash.info([...tail, '', lastFailure.next], lastFailure.title);
  const reason = tail.find((l) => /error/i.test(l)) ?? tail.at(-1) ?? 'the build failed';
  return { ok: false, message: reason.trim(), hint: 'The build failed (its last lines are above). Fix it, then press t.' };
};

/** Gets the browser ready; for the AWS City browser that's a one-time ~150 MB download, with a real progress bar. */
const prepareStep = (dash, browser, mode) => async () => {
  if (browser !== 'cft') return { ok: true, detail: `${browserById(browser).name} found` };
  if (await hasChromeForTesting()) return { ok: true, detail: 'Chrome for Testing' };
  dash.status('Downloading Chrome for Testing (about 150 MB, one time only)…');
  const r = await installChromeForTesting(({ fraction, total }) => dash.set('prepare', { progress: fraction, detail: `${Math.round(fraction * 100)}% of ${total}` }));
  if (r.ok && (await hasChromeForTesting())) return { ok: true, detail: 'downloaded Chrome for Testing' };
  const why = explainDownloadError(r.output);
  const other = detectBrowsers(existsSync).find((b) => b.id !== 'cft' && b.build === 'chrome');
  lastFailure = {
    title: 'The AWS City browser',
    lines: [why, 'It is Chrome for Testing, a one-time download of about 150 MB.'],
    next: other ? `Or use ${other.name} instead: npm start -- --${mode} --browser ${other.id}` : 'To see the whole download, run: npx playwright install chromium',
  };
  dash.info([...lastFailure.lines, lastFailure.next], lastFailure.title);
  return { ok: false, message: why.replace(/^Couldn't download Chrome for Testing: /, ''), hint: /internet/.test(why) ? 'Connect to the internet, then press t.' : 'Press t to try again.' };
};

// What to do in the city: one click for sound (browsers keep a page quiet until you click) and the game's keys.
const PLAY = 'Click once in the city for sound. Arrows walk, E talks, + and − zoom.';

/** Opens the city and stays as its remote control until the player quits. `server` is set in real-AWS mode. */
async function openAndControl(dash, browser, { env = process.env, firefoxPrefs = [], server } = {}) {
  const b = browserById(browser);
  const logKey = (has) => (has ? [['l', server ? 'server log' : 'browser log']] : []);
  const handleLog = (k) => k === 'l' && (dash.toggleLogs(), true);
  const where = server ? `Real AWS: the server runs at ${server.url} (q stops it).` : 'Demo mode: a practice account, nothing touches AWS.';

  if (browser === 'cft') {
    for (;;) {
      let win;
      const ok = await runStep(dash, 'open', async () => {
        dash.status('Starting Chrome for Testing with AWS City loaded…');
        win = launchControlled(env);
        const id = await win.ready;
        if (id) return { ok: true, detail: 'a new window: the city + a practice console' };
        const out = win.output();
        // Another AWS City window holds the browser profile (Chrome runs one per profile): say so, offer to close it.
        const holder = alreadyOpenPid(out);
        if (holder || /existing browser session|ProcessSingleton/i.test(out)) {
          lastFailure = undefined;
          dash.info(['AWS City is already open in another Chrome for Testing window (an earlier npm start or npm run open).', 'Chrome runs one window per browser profile, so a second can’t start beside it.'], 'Already open');
          return {
            ok: false,
            message: 'already open in another window',
            hint: holder ? 'Close that window and press t, or press k to close it for you.' : 'Close the other AWS City window, then press t.',
            fix: holder ? { key: 'k', label: 'close the other window', run: () => closeOther(holder) } : undefined,
          };
        }
        const missing = /Executable doesn't exist|playwright install/i.test(out);
        const said = meaningfulLines(out);
        if (said.length) {
          lastFailure = { title: 'What the browser said', lines: said, next: 'To try it on its own: node scripts/open.mjs' };
          dash.info([...said, '', lastFailure.next], lastFailure.title);
        }
        return {
          ok: false,
          message: missing ? 'Chrome for Testing is missing' : 'the browser did not start',
          hint: missing ? 'Run npx playwright install chromium, then press t.' : 'Press t to try again.',
        };
      });
      if (!ok) return;
      dash.info(["The new window's front tab is your city; the other is a safe practice console.", PLAY], "You're in");
      dash.status(where);
      let closed = false;
      const closedSignal = win.exited.then(() => '__closed');
      for (;;) {
        const items = closed ? [['r', 'reopen the browser'], ...logKey(server), ['q', 'quit']] : [['c', 'city'], ['p', 'practice console'], ['a', 'AWS console'], ...logKey(server), ['r', 'reopen'], ['q', 'quit']];
        const key = await Promise.race([dash.waitKey(items), ...(closed ? [] : [closedSignal])]);
        if (key === '__closed') {
          closed = true;
          dash.status('The browser window was closed. Press r to open it again.');
          continue;
        }
        if (handleLog(key)) continue;
        if (key === 'q') {
          dash.status('Closing the browser…');
          // Let it close the window itself (it saves the profile); the exit handlers stop it if it takes too long.
          win.send('quit');
          await Promise.race([win.exited, sleep(3000)]);
          return;
        }
        if (key === 'r') {
          win.send('quit');
          await Promise.race([win.exited, sleep(3000)]);
          win.child.kill();
          dash.info(undefined);
          break;
        }
        win.send({ c: 'city', p: 'practice', a: 'console' }[key]);
        dash.status({ c: 'Brought the city tab to the front.', p: 'Opened the practice console (nothing there touches AWS).', a: 'Opened the real AWS console (sign in there).' }[key]);
      }
    }
  }

  const guidance = [];
  let child;
  const ok = await runStep(dash, 'open', async () => {
    child = await openIn(browser, { log: (i, text) => guidance.push(`${i}. ${text}`), firefoxPrefs, env, stdio: 'pipe' });
    if (child) {
      // Firefox (web-ext) talks a lot: keep it in the log (in real-AWS mode the log is the server's, so it's drained).
      if (!server) dash.logTitle(`${b.name} log`);
      for (const stream of [child.stdout, child.stderr])
        if (server) stream?.resume();
        else stream?.on('data', (d) => String(d).split('\n').filter((l) => l.trim()).forEach((l) => dash.log(l.trim())));
      child.on('exit', (code) => dash.status(code ? `${b.name} stopped (exit ${code}). Press l for its log, or q to quit.` : `${b.name} was closed. Press q to quit.`));
    }
    return { ok: true, detail: b.auto ? 'opened with AWS City loaded' : 'finish with the steps below' };
  });
  if (!ok) return;
  const opened = guidance.length ? guidance : [`${b.name} opened with AWS City loaded: click its toolbar icon for the sidebar.`];
  dash.info([...opened, PLAY], b.auto ? "You're in" : 'Almost there: finish in the browser');
  dash.status(where);
  const logs = logKey(server || child);
  const items = b.build === 'chrome' ? [['e', 'extensions page'], ['f', 'show the folder'], ...logs, ['q', 'quit']] : b.id === 'safari' ? [['x', 'Xcode project'], ...logs, ['q', 'quit']] : [...logs, ['q', 'quit']];
  for (;;) {
    const key = await dash.waitKey(items);
    if (handleLog(key)) continue;
    if (key === 'q') {
      child?.kill();
      return;
    }
    if (key === 'e') spawnSync('open', ['-a', b.app.replace(/\.app$/, ''), extensionsPage(b.id)]);
    if (key === 'f') {
      spawnSync('pbcopy', [], { input: path.join(ROOT, '.output/chrome-mv3') });
      spawnSync('open', ['-R', path.join(ROOT, '.output/chrome-mv3/manifest.json')]);
    }
    if (key === 'x') spawnSync('open', [SAFARI_PROJECT]);
    dash.status({ e: `Opened ${extensionsPage(b.id)}.`, f: 'Showed the folder in Finder; its path is copied (⌘⇧G, then ⌘V).', x: 'Opened the Xcode project: press Run.' }[key]);
  }
}

/** What stays in the terminal when the panel closes: the checklist, why it stopped (if it failed), how to come back. */
const summary = (dash, note) => {
  const failed = dash.state.steps.some((s) => s.status === 'failed');
  const next = note ?? (failed ? 'Fix that, then run npm start again.' : 'See you in the city! npm start opens it again.');
  const why = lastFailure ? [...lastFailure.lines, lastFailure.next] : undefined;
  if (!interactive) return [...(why ? [lastFailure.title, ...why.map((l) => `  ${l}`), ''] : []), next];
  const state = { ...dash.state, keys: [], status: undefined, showLogs: false, info: why, infoTitle: lastFailure?.title, note: next };
  // Under the scene the panel's own `close` lines it up; the one-line skyline only stands in without it.
  return renderPanel(state, 0, process.stdout.columns ?? 80, 200, { color: !process.env.NO_COLOR, mini: !scene });
};

/** The panel on screen, so a crash can close it before printing. */
// The still AWS City scene sits above the panel on every run. `scene` is its layout when it's on screen (null: it
// didn't fit, undefined: no terminal for it); anything printed under it since (questions, sign-in) marks it dirty.
let scene;
let sceneDirty = false;
/** The scene for a panel of `n` steps: the one on screen if it's right above and leaves room, else printed afresh. */
function sceneForPanel(n) {
  if (scene === undefined) return undefined;
  const reserve = panelReserve(n);
  if (scene && !sceneDirty && scene.rows + reserve <= (process.stdout.rows ?? 24) - 1) return scene;
  if (scene || sceneDirty) process.stdout.write('\x1b[2J\x1b[H');
  sceneDirty = false;
  return (scene = printScene({ reserve }));
}

let current;
const panel = (steps, subtitle) =>
  (current = createPanel(steps, { subtitle, scene: sceneForPanel(steps.length), onInterrupt: () => summary(current, 'Stopped. npm start opens it again.') }));
const finish = (dash) => {
  dash.close(summary(dash));
  process.exit(dash.state.steps.some((s) => s.status === 'failed') ? 1 : 0);
};

/** "Play again? demo · Chrome for Testing", then the keys: Enter plays, c changes, q quits. */
async function playAgain(label) {
  const out = process.stdout;
  const color = !process.env.NO_COLOR;
  const k = (s) => (color ? pc.bold(pc.yellow(s)) : s);
  const dim = (s) => (color ? pc.dim(s) : s);
  // Under the scene the line lines up with it; without it, the one-line skyline stands in.
  const lead = scene ? '  ' : `  ${color ? pc.yellow(miniSkyline(1)) : miniSkyline(1)}  `;
  const title = `${lead}${k('AWS City')}   Play again? ${color ? pc.bold(label) : label}`;
  out.write(`${title}\n  ${k('Enter')} ${dim('play ·')} ${k('c')} ${dim('change ·')} ${k('q')} ${dim('quit')}\x1b[?25l`);
  const key = await new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (buf) => {
      const s = buf.toString().toLowerCase();
      const pick = s.includes('\u0003') ? 'q' : s === '\r' || s === '\n' || s === ' ' || s === 'y' ? 'play' : s === 'c' || s === 'n' ? 'change' : s === 'q' || s === '\u001b' ? 'q' : undefined;
      if (!pick) return;
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve(pick);
    };
    process.stdin.on('data', onData);
  });
  // Clear both lines: the panel (or the questions) take their place.
  out.write('\r\x1b[1A\r\x1b[J\x1b[?25h');
  if (key === 'q') {
    console.log(`  ${dim('See you in the city!')}\n`);
    process.exit(0);
  }
  return key === 'change';
}

/** The two first-run questions (or "c change"): how to play, then which browser. */
async function askChoices(prefs, found) {
  sceneDirty = true;
  p.intro(pc.bold(pc.yellow('AWS City')));
  const mode = await ask(
    p.select({
      message: 'How do you want to play?',
      initialValue: prefs.mode ?? 'demo',
      options: [
        { value: 'demo', label: 'Play the demo', hint: 'no AWS account needed' },
        { value: 'live', label: 'Real AWS on this computer', hint: 'your AWS account + Claude on Bedrock' },
        { value: 'deploy', label: 'Put it online for everyone', hint: 'deploys to your AWS account (~25 min)' },
      ],
    }),
  );
  if (mode === 'deploy') return { mode };
  const browser =
    args.browser ??
    (await ask(
      p.select({
        message: 'Which browser?',
        initialValue: found.some((b) => b.id === prefs.browser) ? prefs.browser : 'cft',
        options: found.map((b) => ({
          value: b.id,
          label: b.name,
          hint: b.hint ?? (b.id === 'safari' ? 'opens the full city in a tab; needs Xcode' : b.auto ? 'opens with AWS City loaded' : '3 clicks to add it (we guide you)'),
        })),
      }),
    ));
  p.outro(pc.dim('Remembered for next time: Enter plays again.'));
  return { mode, browser };
}

/** The deploy tools (CDK) live in infra/node_modules: install them the first time, like npm run setup does. */
async function infraTools() {
  if (existsSync(path.join(ROOT, 'infra/node_modules'))) return;
  const s = p.spinner();
  s.start('Getting the deploy tools ready (one time, about a minute)…');
  const ok = await runQuiet('npm', ['--prefix', 'infra', 'ci', '--no-audit', '--no-fund', '--loglevel=error']);
  if (!ok) {
    s.stop('Couldn’t install the deploy tools.', 1);
    bye(`Run ${pc.cyan('cd infra && npm ci')} to see why, then ${pc.cyan('npm start')} again.`);
  }
  s.stop('Deploy tools ready');
}

async function main() {
  const prefs = readPrefs();
  const found = detectBrowsers(existsSync);
  if (args.browser && !found.some((b) => b.id === args.browser)) {
    console.error(`\n✗ ${browserById(args.browser).name} isn’t installed on this computer. Try --browser ${found.map((b) => b.id).join(' or ')}.\n`);
    process.exit(1);
  }
  const plan = startPlan(args, prefs, { interactive, installed: found.map((b) => b.id) });
  // The AWS City scene, every run, at the left above the panel (room kept for the panel it expects): a 2 s intro grows
  // it into the still picture (--no-intro prints the still at once). Too short a terminal gets the panel's one-line
  // skyline instead.
  if (interactive) {
    const reserve = panelReserve(plan.mode === 'live' ? 6 : 3);
    scene = introPlays(args) ? await playIntro({ animate: true, reserve }) : printScene({ reserve });
  }

  let { mode, browser } = plan;
  if (plan.kind === 'again' && (await playAgain(choiceLabel(plan.mode, plan.browser, plan.mode === 'live' ? prefs.region : undefined)))) ({ mode, browser } = await askChoices(prefs, found));
  else if (plan.kind === 'ask') ({ mode, browser } = await askChoices(prefs, found));

  if (mode === 'deploy') {
    const tools = await awsTools();
    const region = prefs.region ?? 'us-west-2';
    const { profile } = await connectAws(tools, region, prefs, args.profile);
    savePrefs({ profile });
    await infraTools();
    p.log.info('Handing over to the deploy wizard…');
    // The scene is already on screen: the wizard skips its own (printBanner reads AWS_CITY_SCENE_SHOWN).
    const r = spawnSync('node', ['infra/setup/setup.mjs'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, AWS_PROFILE: profile, ...(scene ? { AWS_CITY_SCENE_SHOWN: '1' } : {}) } });
    process.exit(r.status ?? 0);
  }


  if (mode === 'demo') {
    savePrefs({ mode, browser });
    const dash = panel(
      [
        { id: 'prepare', title: 'Get the browser ready' },
        { id: 'build', title: 'Build the city' },
        { id: 'open', title: 'Open the city' },
      ],
      choiceLabel(mode, browser),
    );
    if ((await runStep(dash, 'prepare', prepareStep(dash, browser, mode))) && (await runStep(dash, 'build', buildStep(dash, browser)))) await openAndControl(dash, browser);
    finish(dash);
  }

  // Real AWS: sign-in first (questions only if it has to), then the panel does the rest.
  const tools = await awsTools();
  const region =
    args.region ??
    (plan.kind !== 'ask' && REGION_RE.test(prefs.region ?? '')
      ? prefs.region
      : interactive
        ? ((sceneDirty = true), await ask(p.text({ message: 'AWS Region (where Claude runs for you)', initialValue: prefs.region ?? 'us-west-2', validate: (v) => (REGION_RE.test(v ?? '') ? undefined : 'e.g. us-west-2') })))
        : 'us-west-2');
  const { profile, account } = await connectAws(tools, region, prefs, args.profile);
  savePrefs({ mode, browser, profile, region });

  const cfg = liveConfig(browser);
  const dash = panel(
    [
      { id: 'aws', title: 'AWS sign-in' },
      { id: 'bedrock', title: 'Check Claude on Bedrock' },
      { id: 'prepare', title: 'Get the browser ready' },
      { id: 'build', title: 'Build the city' },
      { id: 'server', title: 'Start the server' },
      { id: 'open', title: 'Open the city' },
    ],
    choiceLabel(mode, browser, region),
  );
  dash.set('aws', { status: 'done', detail: `account ${account} (${profile})` });
  let server;
  let stopping = false;
  const go =
    (await runStep(dash, 'bedrock', () => bedrockHello(tools, profile, region), { canSkip: true })) &&
    (await runStep(dash, 'prepare', prepareStep(dash, browser, mode))) &&
    (await runStep(dash, 'build', buildStep(dash, browser, cfg.extEnv))) &&
    (await runStep(dash, 'server', async () => {
      if (await portBusy(cfg.port))
        return {
          ok: false,
          message: `port ${cfg.port} is already in use`,
          hint: `Another AWS City server may still be running: stop it and press t, or quit and run PORT=${Number(cfg.port) + 1} npm start.`,
        };
      dash.status(`Starting the server with AWS profile "${profile}"…`);
      let ready = false;
      dash.logTitle('Server log');
      server = startServer({ profile, region, cfg, onLog: (l) => (dash.log(l), !ready && dash.status(`server: ${l}`)) });
      void server.exited.then((code) => {
        if (!ready || stopping) return;
        dash.set('server', { status: 'failed', detail: `stopped (exit ${code ?? '?'})` });
        dash.status(`The server stopped. Press l for its log (full log: ${SERVER_LOG}).`);
      });
      ready = await server.ready;
      if (ready) return { ok: true, detail: `${cfg.url} · Claude on Bedrock` };
      server.stop();
      return { ok: false, message: 'did not start', hint: `Press t to try again; its log is in ${SERVER_LOG}.` };
    }));
  if (go) await openAndControl(dash, browser, { env: { ...process.env, ...cfg.extEnv }, firefoxPrefs: cfg.firefoxPrefs, server: { url: cfg.url } });
  stopping = true;
  server?.stop();
  finish(dash);
}

// A crash must never leave the terminal in raw mode or the cursor hidden: close the panel, then say what happened.
const crash = (err) => {
  current?.close([]);
  console.error(`\n${pc.red('✗')} The launcher hit a problem it didn't expect: ${err?.message ?? err}`);
  if (err?.stack) console.error(pc.dim(err.stack.split('\n').slice(1, 6).join('\n')));
  console.error(`\n  Run ${pc.cyan('npm start')} again; if it keeps happening, ${pc.cyan('npm run build')} shows the build on its own.\n`);
  process.exit(1);
};
process.on('unhandledRejection', crash);
await main().catch(crash);
