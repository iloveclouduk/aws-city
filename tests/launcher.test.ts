import { describe, expect, it } from 'vitest';
import { frame, introGrowth, introLines, INTRO_SECONDS, sceneLayout, sceneLines, STILL_T } from '../scripts/launcher/banner.mjs';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { depsPlan, explainNpmError, installMessage, readDepsFacts } from '../scripts/launcher/boot.mjs';
import { panelReserve, renderPanel, wrap, type PanelState } from '../scripts/launcher/panel.mjs';
import { buildEnv, sourceEntries, sourceStamp, stampOf } from '../scripts/launcher/stamp.mjs';
import {
  browserFromArg,
  choiceLabel,
  detectBrowsers,
  elapsed,
  explainAwsError,
  explainDownloadError,
  extensionsPage,
  helpText,
  introPlays,
  listProfiles,
  parseArgs,
  parseBuildProgress,
  parseDownloadProgress,
  parsePastedKeys,
  pickProfile,
  progressBar,
  startPlan,
  upsertProfile,
} from '../scripts/launcher/lib.mjs';

describe('npm start helpers', () => {
  it('offers the browsers that are installed (and always the AWS City browser)', () => {
    const installed = new Set(['/Applications/Google Chrome.app', '/Applications/Safari.app']);
    const ids = detectBrowsers((p) => installed.has(p), { platform: 'darwin', appDirs: ['/Applications'] }).map((b) => b.id);
    expect(ids).toEqual(['cft', 'chrome', 'safari']);
    expect(detectBrowsers(() => false, { platform: 'linux' }).map((b) => b.id)).toEqual(['cft']);
    expect(extensionsPage('edge')).toBe('edge://extensions');
  });

  it('finds profiles and picks the one AWS City should use', () => {
    const creds = '[default]\naws_access_key_id = A\n\n[workshop]\naws_access_key_id = B\n';
    const config = '[profile aws-city]\nlogin_session = x\n[sso-session corp]\nsso_region = us-east-1\n';
    const profiles = listProfiles(creds, config);
    expect(profiles).toEqual(['default', 'workshop', 'aws-city']);
    expect(pickProfile(profiles, {})).toBe('aws-city');
    expect(pickProfile(['default'], {})).toBe('default');
    expect(pickProfile(['default'], { AWS_CITY_PROFILE: 'mine' })).toBe('mine');
    expect(pickProfile([], {})).toBeUndefined();
  });

  it('saves pasted keys as one profile without touching the others', () => {
    const before = '[default]\naws_access_key_id = KEEP\naws_secret_access_key = KEEP\n\n[aws-city]\naws_access_key_id = OLD\naws_secret_access_key = OLD\naws_session_token = OLD\n\n[other]\nregion = eu-west-1\n';
    const after = upsertProfile(before, 'aws-city', { accessKeyId: 'NEW', secretAccessKey: 'S' });
    expect(after).toContain('[default]\naws_access_key_id = KEEP');
    expect(after).toContain('[aws-city]\naws_access_key_id = NEW\naws_secret_access_key = S\n');
    expect(after).not.toContain('OLD');
    expect(after).toContain('[other]\nregion = eu-west-1');
    expect(upsertProfile('', 'aws-city', { accessKeyId: 'A', secretAccessKey: 'B', sessionToken: 'T' })).toBe('[aws-city]\naws_access_key_id = A\naws_secret_access_key = B\naws_session_token = T\n');
  });

  it('understands keys pasted from Workshop Studio (export lines) or a profile block', () => {
    expect(parsePastedKeys('export AWS_ACCESS_KEY_ID="ASIA1"\nexport AWS_SECRET_ACCESS_KEY="s/2+x"\nexport AWS_SESSION_TOKEN="tok=="')).toEqual({ accessKeyId: 'ASIA1', secretAccessKey: 's/2+x', sessionToken: 'tok==' });
    expect(parsePastedKeys('[default]\naws_access_key_id=AKIA9\naws_secret_access_key=abc')).toEqual({ accessKeyId: 'AKIA9', secretAccessKey: 'abc', sessionToken: undefined });
    expect(parsePastedKeys('hello')).toBeUndefined();
  });

  it('turns AWS errors into a next step', () => {
    expect(explainAwsError({ name: 'ExpiredTokenException', message: 'x' })).toMatch(/expired/);
    expect(explainAwsError({ name: 'CredentialsProviderError', message: 'Could not load credentials from any providers' })).toMatch(/No AWS sign-in/);
  });
});

describe('npm start options (the stage one-liner)', () => {
  it('skips the questions with --demo / --live and --browser', () => {
    expect(parseArgs([])).toEqual({ help: false });
    expect(parseArgs(['--demo', '--browser', 'chrome'])).toEqual({ help: false, mode: 'demo', browser: 'chrome' });
    expect(parseArgs(['--live', '--browser=firefox', '--no-intro'])).toEqual({ help: false, intro: false, mode: 'live', browser: 'firefox' });
    expect(parseArgs(['--demo', '--intro', '--rebuild'])).toEqual({ help: false, intro: true, rebuild: true, mode: 'demo' });
    expect(parseArgs(['--live', '--profile', 'workshop', '--region=eu-west-1'])).toEqual({ help: false, mode: 'live', profile: 'workshop', region: 'eu-west-1' });
    expect(parseArgs(['-b', 'Edge']).browser).toBe('edge');
    expect(parseArgs(['--browser', 'city']).browser).toBe('cft');
    expect(parseArgs(['--browser', 'safari']).browser).toBe('safari');
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
    expect(browserFromArg('nope')).toBeUndefined();
  });

  it('refuses what it does not understand (the launcher then prints help and exits 1)', () => {
    expect(parseArgs(['--bogus']).error).toMatch(/Unknown option "--bogus"/);
    expect(parseArgs(['demo']).error).toMatch(/Unknown option/);
    expect(parseArgs(['--browser']).error).toMatch(/needs a name/);
    expect(parseArgs(['--browser', '--demo']).error).toMatch(/needs a name/);
    expect(parseArgs(['--browser', 'netscape']).error).toMatch(/Unknown browser "netscape"/);
    expect(parseArgs(['--demo', '--live']).error).toMatch(/Pick one/);
    expect(parseArgs(['--region', 'nowhere']).error).toMatch(/"nowhere" isn't one/);
    expect(parseArgs(['--profile']).error).toMatch(/needs the name/);
    expect(parseArgs(['--demo', '--profile', 'x']).error).toMatch(/for real AWS/);
  });

  it('understands npm start --demo without the -- (npm keeps those flags as npm_config_*)', () => {
    const npm = { npm_lifecycle_event: 'start' };
    expect(parseArgs([], { ...npm, npm_config_demo: 'true' })).toEqual({ help: false, mode: 'demo' });
    expect(parseArgs([], { ...npm, npm_config_rebuild: 'true' })).toEqual({ help: false, rebuild: true });
    expect(parseArgs([], { ...npm, npm_config_live: 'true', npm_config_browser: 'firefox' })).toMatchObject({ mode: 'live', browser: 'firefox' });
    // `npm start --demo --browser chrome` loses "chrome": say how to pass it instead of guessing.
    expect(parseArgs([], { ...npm, npm_config_demo: 'true', npm_config_browser: 'true' }).error).toMatch(/npm start -- --demo --browser chrome/);
    // Only for npm start, and argv wins.
    expect(parseArgs([], { npm_config_demo: 'true' })).toEqual({ help: false });
    expect(parseArgs(['--live'], { ...npm, npm_config_demo: 'true' }).mode).toBe('live');
  });

  it('lists every browser and the stage one-liner in --help', () => {
    const help = helpText();
    for (const id of ['cft', 'chrome', 'edge', 'brave', 'firefox', 'safari']) expect(help).toContain(`  ${id} `);
    expect(help).toContain('npm start -- --demo --browser chrome');
    for (const flag of ['--rebuild', '--no-intro', '--profile', '--region']) expect(help).toContain(flag);
  });
});

describe('what the launcher asks', () => {
  const installed = ['cft', 'chrome', 'firefox'];
  it('asks nothing when the options say what to do (last browser unless --browser)', () => {
    expect(startPlan({ help: false, mode: 'demo' }, { browser: 'firefox' }, { installed })).toEqual({ kind: 'go', mode: 'demo', browser: 'firefox' });
    expect(startPlan({ help: false, mode: 'live', browser: 'chrome' }, { browser: 'firefox' }, { installed })).toEqual({ kind: 'go', mode: 'live', browser: 'chrome' });
    // a remembered browser that has since been removed falls back to the AWS City browser
    expect(startPlan({ help: false, mode: 'demo' }, { browser: 'safari' }, { installed })).toMatchObject({ browser: 'cft' });
  });

  it('offers "Play again?" after the first time, and the two questions before it', () => {
    expect(startPlan({ help: false }, { mode: 'demo', browser: 'cft' }, { installed })).toEqual({ kind: 'again', mode: 'demo', browser: 'cft' });
    expect(startPlan({ help: false }, { mode: 'live', browser: 'chrome' }, { installed })).toEqual({ kind: 'again', mode: 'live', browser: 'chrome' });
    expect(startPlan({ help: false }, {}, { installed })).toEqual({ kind: 'ask', browser: undefined });
    // a deploy isn't something to "play again"
    expect(startPlan({ help: false }, { mode: 'deploy' }, { installed }).kind).toBe('ask');
  });

  it('never waits for an answer without a terminal', () => {
    expect(startPlan({ help: false }, {}, { interactive: false, installed })).toEqual({ kind: 'go', mode: 'demo', browser: 'cft' });
    expect(startPlan({ help: false }, { mode: 'live', browser: 'chrome' }, { interactive: false, installed })).toEqual({ kind: 'go', mode: 'live', browser: 'chrome' });
  });

  it('plays the intro on every run, unless --no-intro', () => {
    expect(introPlays({ help: false })).toBe(true);
    expect(introPlays(parseArgs([]))).toBe(true);
    expect(introPlays({ help: false, intro: true })).toBe(true);
    expect(introPlays(parseArgs(['--no-intro']))).toBe(false);
    expect(introPlays(parseArgs([], { npm_lifecycle_event: 'start', npm_config_intro: 'false' }))).toBe(false);
  });

  it('names the choice in a few words', () => {
    expect(choiceLabel('demo', 'cft')).toBe('demo · Chrome for Testing');
    expect(choiceLabel('live', 'firefox', 'eu-west-1')).toBe('real AWS · Firefox · eu-west-1');
  });
});

describe('boot: installing packages before the launcher', () => {
  const lock = { hasModules: true, missing: [], hasLock: true, lockMtime: 10_000, hiddenMtime: 10_000 };
  it('installs on a fresh clone, a half-finished install or a changed package list', () => {
    expect(depsPlan({ ...lock, hasModules: false })).toEqual({ install: true, reason: 'missing', args: ['ci', '--no-audit', '--no-fund', '--loglevel=error'] });
    expect(depsPlan({ ...lock, missing: ['@clack/prompts'] })).toMatchObject({ install: true, reason: 'incomplete' });
    expect(depsPlan({ ...lock, lockMtime: 60_000 })).toMatchObject({ install: true, reason: 'changed' });
    expect(depsPlan({ ...lock, hiddenMtime: undefined })).toMatchObject({ install: true, reason: 'changed' });
    expect(depsPlan({ ...lock, hasModules: false, hasLock: false })).toMatchObject({ args: ['install', '--no-audit', '--no-fund', '--loglevel=error'] });
  });

  it('does nothing when the packages match the lockfile (npm writes both together)', () => {
    expect(depsPlan(lock)).toEqual({ install: false });
    expect(depsPlan({ ...lock, lockMtime: 11_500 })).toEqual({ install: false });
    expect(depsPlan({ ...lock, hasLock: false, hiddenMtime: undefined })).toEqual({ install: false });
  });

  it('reads those facts from a folder', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'boot-'));
    try {
      expect(readDepsFacts(dir)).toMatchObject({ hasModules: false, hasLock: false });
      writeFileSync(path.join(dir, 'package-lock.json'), '{}');
      for (const p of ['@clack/prompts', 'picocolors', 'playwright', 'wxt']) {
        mkdirSync(path.join(dir, 'node_modules', p), { recursive: true });
        writeFileSync(path.join(dir, 'node_modules', p, 'package.json'), '{}');
      }
      writeFileSync(path.join(dir, 'node_modules/.package-lock.json'), '{}');
      expect(depsPlan(readDepsFacts(dir))).toEqual({ install: false });
      utimesSync(path.join(dir, 'package-lock.json'), new Date(), new Date(Date.now() + 60_000)); // a pull brought a new lockfile
      expect(depsPlan(readDepsFacts(dir))).toMatchObject({ install: true, reason: 'changed' });
      rmSync(path.join(dir, 'node_modules/wxt'), { recursive: true });
      expect(readDepsFacts(dir).missing).toEqual(['wxt']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('explains npm failures in plain words', () => {
    expect(explainNpmError('', 'ENOENT')).toMatch(/npm isn’t installed/);
    expect(explainNpmError('npm ERR! code ENOTFOUND registry.npmjs.org')).toMatch(/internet/);
    expect(explainNpmError('ENOSPC: no space left on device')).toMatch(/disk is full/);
    expect(explainNpmError('npm ERR! code EACCES')).toMatch(/permission denied/);
    expect(explainNpmError('npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync')).toMatch(/npm install once/);
    expect(explainNpmError('something odd')).toBe('npm couldn’t install the packages.');
    expect(installMessage('missing')).toMatch(/first time/);
  });
});

describe('skipping the build when nothing changed', () => {
  it('changes when a file, its size or time, or the build settings change', () => {
    const files: [string, number, number][] = [['src/a.ts', 10, 1000], ['shared/b.json', 20, 2000]];
    const base = stampOf(files, { target: 'chrome' });
    expect(stampOf([...files].reverse(), { target: 'chrome' })).toBe(base); // order doesn't matter
    expect(stampOf([['src/a.ts', 11, 1000], files[1]], { target: 'chrome' })).not.toBe(base);
    expect(stampOf([['src/a.ts', 10, 1001], files[1]], { target: 'chrome' })).not.toBe(base);
    expect(stampOf(files.slice(0, 1), { target: 'chrome' })).not.toBe(base);
    expect(stampOf(files, { target: 'firefox' })).not.toBe(base);
    expect(stampOf(files, { target: 'chrome', WXT_BACKEND: 'aws' })).not.toBe(base);
    expect(buildEnv({ WXT_BACKEND: 'aws', VITE_X: '1', HOME: '/h' })).toEqual({ WXT_BACKEND: 'aws', VITE_X: '1' });
  });

  it('fingerprints a real folder: same twice, different after an edit', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
    try {
      mkdirSync(path.join(dir, 'src/deep'), { recursive: true });
      writeFileSync(path.join(dir, 'src/deep/a.ts'), 'x');
      writeFileSync(path.join(dir, 'wxt.config.ts'), 'y');
      expect(sourceEntries(dir).map(([p]) => p).sort()).toEqual(['src/deep/a.ts', 'wxt.config.ts']);
      const before = sourceStamp(dir, 'chrome');
      expect(sourceStamp(dir, 'chrome')).toBe(before);
      writeFileSync(path.join(dir, 'src/deep/a.ts'), 'xx');
      expect(sourceStamp(dir, 'chrome')).not.toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('launcher messages', () => {
  it('formats elapsed times', () => {
    expect(elapsed(800)).toBe('0.8 s');
    expect(elapsed(12_340)).toBe('12.3 s');
    expect(elapsed(74_000)).toBe('1 min 14 s');
    expect(elapsed(125_000)).toBe('2 min 05 s');
  });

  it("follows Chrome for Testing's download and explains why it failed", () => {
    expect(parseDownloadProgress('|■■■■■■■■■■■■■■■■                                                                |  20% of 150.2 MiB\n|■■■■■■■■■■■■■■■■■■■■■■■■                                                        |  30% of 150.2 MiB')).toEqual({ fraction: 0.3, total: '150.2 MiB' });
    expect(parseDownloadProgress('Downloading Chromium 140')).toBeUndefined();
    expect(explainDownloadError('Error: getaddrinfo ENOTFOUND cdn.playwright.dev')).toMatch(/no internet/);
    expect(explainDownloadError('Download failed: server closed connection.')).toMatch(/no internet/);
    expect(explainDownloadError('ENOSPC: no space left on device')).toMatch(/disk is full/);
    expect(explainDownloadError('something else')).toBe("Couldn't download Chrome for Testing.");
  });
});

describe('the title scene', () => {
  const visible = (l: string) => l.replace(/\x1b\[[0-9;]*m/g, '');

  it('never draws past the terminal edge, at any moment, wide or narrow', () => {
    // One expect per width and layout (the widest line of every moment), not one per line: same coverage, a fraction of the time.
    for (const width of [10, 20, 40, 60, 80, 84, 86, 100, 120, 200])
      for (const compact of [undefined, true]) {
        let widest = 0;
        for (let t = 0; t <= INTRO_SECONDS; t += 0.2) for (const line of frame(t, width, { compact })) widest = Math.max(widest, [...visible(line)].length);
        expect(widest, `${width} columns${compact ? ', compact' : ''}`).toBeLessThanOrEqual(width);
      }
  }, 30_000); // ~280 frames: ~1.5 s alone, several when every test file runs at once

  it('never cuts the tagline: the long one only where it fits', () => {
    for (const width of [40, 60, 80, 84, 86, 120]) {
      const tag = frame(INTRO_SECONDS, width, { color: false }).at(-1)?.trim() ?? '';
      expect(tag).toMatch(/^learn AWS by living in it( {2}· {2}every service is a place, every agent does its real job)?$/);
    }
    expect(frame(INTRO_SECONDS, 120, { color: false }).at(-1)).toContain('every agent does its real job');
  });

  it('spells AWS CITY in big letters, or small ones under 84 columns', () => {
    const big = frame(INTRO_SECONDS, 120, { color: false }).join('\n');
    expect(big).toContain('█████╗');
    expect(big).toContain('learn AWS by living in it');
    const small = frame(INTRO_SECONDS, 80, { color: false });
    expect(small[0]).toContain('▄▀█');
    expect(small.length).toBeLessThan(frame(INTRO_SECONDS, 120).length);
  });

  it('is the same still picture every run: the city by night, no road, no cars, no fireworks', () => {
    for (const cols of [80, 120, 200]) {
      const layout = sceneLayout(cols, 60);
      expect(layout).not.toBeNull();
      const still = sceneLines(cols, layout!, { color: false });
      expect(sceneLines(cols, layout!, { color: false })).toEqual(still);
      expect(sceneLines(cols, layout!)).toEqual(sceneLines(cols, layout!));
      const text = still.join('\n');
      expect(text).toContain('RDS');
      // no fireworks (✶ •), no vehicles (the old road's Bedrock car, arrows), and the waterfront is the last row
      expect(text).not.toMatch(/[✶•▶◀]|Bedrock/);
      expect(still.at(-2)).toMatch(/^ *▀+/);
    }
  });

  it('the intro takes about 2 s, wipes the title in, raises the city and ends on the exact still picture', () => {
    expect(INTRO_SECONDS).toBeGreaterThanOrEqual(1.5);
    expect(INTRO_SECONDS).toBeLessThanOrEqual(2.5);
    expect(STILL_T).toBe(INTRO_SECONDS);
    expect(introGrowth(STILL_T)).toBe(1);
    for (const cols of [80, 120, 200]) {
      const layout = sceneLayout(cols, 60)!;
      // the last frame is the still, in colour and plain (so nothing jumps when the animation stops)
      expect(introLines(STILL_T, cols, layout)).toEqual(sceneLines(cols, layout));
      expect(introLines(STILL_T + 5, cols, layout)).toEqual(sceneLines(cols, layout));
      // it starts empty (no title, no roofs) and every frame is the still's height
      const first = introLines(0, cols, layout, { color: false });
      expect(first.join('')).not.toMatch(/[█▄▀]{3}.*[╗╝]/);
      for (let t = 0; t <= STILL_T; t += 0.25) expect(introLines(t, cols, layout).length).toBe(layout.rows - 2);
      // half-way the title is partly written and the city partly built; no fireworks or vehicles at any moment
      const mid = introLines(0.6, cols, layout, { color: false }).join('\n');
      expect(mid.length).toBeGreaterThan(first.join('\n').length);
      for (let t = 0; t <= STILL_T; t += 0.1) expect(introLines(t, cols, layout, { color: false }).join('')).not.toMatch(/[✶•▶◀]/);
    }
  });

  it('fits above the panel from 80×24 to 200×60, at the left edge, or gives way to the one-line skyline', () => {
    const plainWidth = (l: string) => [...visible(l)].length;
    const panelState = (n: number): PanelState => ({
      subtitle: 'demo · Chrome for Testing',
      steps: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, title: `Step ${i}`, status: i ? 'pending' : 'done' })),
      info: ['1. Turn on "Developer mode" (top right), then click "Load unpacked" and pick the folder.', 'Click once in the city for sound.'],
      status: 'The city is open',
      keys: [['c', 'city'], ['p', 'practice console'], ['a', 'AWS console'], ['l', 'server log'], ['r', 'reopen'], ['q', 'quit']],
    });
    const seen: Record<string, string> = {};
    for (const [cols, rows] of [[80, 24], [100, 30], [120, 40], [160, 50], [200, 60]])
      for (const n of [3, 6]) {
        const layout = sceneLayout(cols, rows, panelReserve(n));
        seen[`${cols}x${rows}/${n}`] = layout ? (layout.compact ? 'compact' : 'big') : 'none';
        const panel = renderPanel(panelState(n), 1, cols, rows - (layout?.rows ?? 0), { color: false, mini: !layout });
        expect((layout?.rows ?? 0) + panel.length, `${cols}×${rows}`).toBeLessThan(rows);
        expect(panel.join('\n')).toContain('q quit');
        for (const l of panel) expect(plainWidth(l)).toBeLessThan(cols);
        if (!layout) {
          expect(panel[0]).toMatch(/^ {2}\S{8} {2}AWS City/);
          continue;
        }
        expect(panel[0].trim()).toMatch(/^AWS City {3}demo/);
        const lines = sceneLines(cols, layout);
        expect(lines.length).toBe(layout.rows - 2);
        for (const l of lines) expect(plainWidth(l)).toBeLessThan(cols);
        // left-aligned: the scene starts at the first column (its sky), its waterfront too, and the panel's text
        // is indented two columns, whatever the width
        expect(sceneLines(cols, layout, { color: false }).at(-2)).toMatch(/^▀/);
        // the sky starts at column 1 (no centring margin before it) and the scene is never wider than it draws
        expect(lines.filter((l) => l.startsWith('\x1b[')).length).toBeGreaterThan(lines.length / 2);
        expect(Math.max(...lines.map(plainWidth))).toBe(Math.min(cols, 110) - 1);
        expect(panel[0]).toMatch(/^ {2}AWS City/);
        for (const l of panel.filter(Boolean)) expect(visible(l)).toMatch(/^ {2}/);
      }
    expect(seen).toMatchObject({ '80x24/3': 'compact', '80x24/6': 'none', '120x40/6': 'big', '200x60/6': 'big' });
    expect(sceneLayout(200, 60)).not.toHaveProperty('left');
  });

  it('plain mode has no colour codes', () => {
    expect(frame(INTRO_SECONDS, 120, { color: false }).join('')).not.toMatch(/\x1b/);
  });
});

describe('build progress', () => {
  it('turns WXT output into stages and a finish time', () => {
    const out = '\x1b[K⠋ [1/3] background\r⠴ [2/3] city, sidepanel\r⠇ [3/3] console\n✔ Built extension in 2.938 s\n';
    expect(parseBuildProgress(out)).toEqual([
      { step: 1, of: 3, label: 'background', name: 'wiring the power grid' },
      { step: 2, of: 3, label: 'city, sidepanel', name: 'laying the roads' },
      { step: 3, of: 3, label: 'console', name: 'building the bridge to the AWS console' },
      { done: true, seconds: 2.938 },
    ]);
    expect(parseBuildProgress('✔ Built extension in 850 ms')).toEqual([{ done: true, seconds: 0.85 }]);
    expect(parseBuildProgress('Σ Total size: 6.93 MB')).toEqual([]);
  });

  it('draws the bar', () => {
    expect(progressBar(0, 6)).toBe('▱▱▱▱▱▱');
    expect(progressBar(0.5, 6)).toBe('▰▰▰▱▱▱');
    expect(progressBar(1.4, 6)).toBe('▰▰▰▰▰▰');
  });
});

describe('the panel', () => {
  const visible = (l: string) => [...l.replace(/\x1b\[[0-9;]*m/g, '')].length;
  const state = (over: Partial<PanelState> = {}): PanelState => ({
    subtitle: 'demo · Chrome for Testing',
    steps: [
      { id: 'a', title: 'AWS sign-in', status: 'done', detail: 'account 123456789012 (aws-city)', started: 0, ended: 800 },
      { id: 'b', title: 'Build the city', status: 'running', detail: 'laying the roads (2/3)', progress: 0.5, started: 1000 },
      { id: 'c', title: 'Start the server', status: 'pending' },
      { id: 'd', title: 'Open the city', status: 'failed', detail: 'the browser did not start' },
    ],
    status: 'Building: laying the roads',
    keys: [['t', 'try again'], ['q', 'quit']],
    ...over,
  });
  const busy = state({
    info: ['1. Turn on "Developer mode" (top right), then click "Load unpacked" and pick the folder. It is a long line.', 'Click once in the city for sound.'],
    infoTitle: "You're in",
    showLogs: true,
    logs: Array.from({ length: 12 }, (_, i) => `server line ${i}`),
    keys: [['c', 'city'], ['p', 'practice console'], ['a', 'AWS console'], ['l', 'server log'], ['r', 'reopen'], ['q', 'quit']],
  });

  it('fits every terminal from 80×24 to 200×60, and never takes the last row', () => {
    for (const [cols, rows] of [[80, 24], [80, 12], [100, 30], [120, 45], [200, 60]])
      for (const st of [state(), busy])
        for (const color of [true, false]) {
          const out = renderPanel(st, 3, cols, rows, { color, now: 5000 });
          expect(out.length).toBeLessThan(rows);
          for (const l of out) expect(visible(l)).toBeLessThan(cols);
        }
  });

  it('is a calm block: a header, the checklist with times, one status line and the keys', () => {
    const out = renderPanel(state(), 3, 120, 45, { color: false, now: 5000 });
    expect(out[0]).toMatch(/^ {2}\S{8} {2}AWS City {3}demo · Chrome for Testing$/);
    const text = out.join('\n');
    expect(text).toMatch(/✓ AWS sign-in\s+account 123456789012 \(aws-city\)\s+0\.8 s/);
    expect(text).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Build the city\s+▰▰▰▰▱▱▱▱ laying the roads \(2\/3\)\s+4\.0 s/);
    expect(text).toMatch(/· Start the server$/m);
    expect(text).toMatch(/✗ Open the city\s+the browser did not start/);
    expect(text).toContain('› Building: laying the roads');
    expect(out.at(-1)).toBe('  t try again · q quit');
    expect(out.length).toBeLessThanOrEqual(10); // no full-screen picture
  });

  it('keeps the steps, status and keys when the terminal is short (logs go first, then the extra lines)', () => {
    const out = renderPanel(busy, 3, 80, 14, { color: false, now: 5000 }).join('\n');
    for (const s of ['AWS sign-in', 'Build the city', 'Start the server', 'Open the city', '› Building', 'q quit']) expect(out).toContain(s);
    expect(out).not.toContain('server line');
    const tall = renderPanel(busy, 3, 120, 45, { color: false, now: 5000 }).join('\n');
    expect(tall).toContain('server line 11');
    expect(tall).not.toContain('server line 5');
  });

  it('wraps the "next" lines and the keys instead of cutting them at 80 columns', () => {
    const out = renderPanel(busy, 3, 80, 40, { color: false, now: 5000 });
    const text = out.join('\n');
    expect(text).toContain('q quit');
    expect(text.replace(/\s+/g, ' ')).toContain('pick the folder. It is a long line.');
    expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four']);
    expect(wrap('1. one two three', 9)).toEqual(['1. one', '   two', '   three']);
  });

  it('plain mode has no colour codes', () => {
    expect(renderPanel(busy, 3, 120, 45, { color: false }).join('')).not.toMatch(/\x1b/);
    expect(renderPanel(busy, 3, 120, 45, { color: true }).join('')).toMatch(/\x1b/);
  });
});

describe('an AWS City window that is already open', async () => {
  const { lockPid, alreadyOpenPid, meaningfulLines, ALREADY_OPEN } = await import('../scripts/launcher/lib.mjs');

  it('reads the pid from Chrome’s SingletonLock target', () => {
    expect(lockPid('Salmans-MacBook-Air.local-74762')).toBe(74762);
    expect(lockPid('nonsense')).toBeUndefined();
    expect(lockPid(undefined)).toBeUndefined();
  });

  it('reads back the marker scripts/open.mjs prints', () => {
    expect(alreadyOpenPid(`AWS City is already open…\n${ALREADY_OPEN} 4242\n`)).toBe(4242);
    expect(alreadyOpenPid('READY abc')).toBeUndefined();
  });

  it('shows why a launch failed, not Playwright’s cleanup lines', () => {
    const out = [
      'browserType.launchPersistentContext: Target page, context or browser has been closed',
      'Browser logs:',
      'Opening in existing browser session.',
      '  - [pid=41462] starting temporary directories cleanup',
      '  - [pid=41462] finished temporary directories cleanup',
      '  - [pid=41462] <gracefully close end>',
      '  ]',
      '}',
      'Node.js v24.9.0',
    ].join('\n');
    const lines = meaningfulLines(out);
    expect(lines[0]).toMatch(/has been closed/);
    expect(lines.join(' ')).not.toMatch(/cleanup|gracefully|Node\.js/);
  });
});
