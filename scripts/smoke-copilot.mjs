// End-to-end Console Copilot check: all eight scripted flows (mock backend) on the practice console inside the
// extension (practice.html: nothing touches AWS). The city asks the Copilot to do each task; in the demo it opens the
// practice console itself (or uses the one already open), from the full tab and from the side panel page.
// Asserts: the resource gets "created" on the practice console, the agent never clicks a risky control (the page records
// clicks on [data-risky] in <body data-risky>), steps that need the player's OK are handed back, no page errors. Also
// exercises the chip (speed, persisted in chrome.storage.local; Pause/Resume; Explain again), the demo Lookout from the
// full tab, and the "browsing grew it" toast.
// Usage: npm run build && node scripts/smoke-copilot.mjs [outDir] [flow…]
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ext = path.resolve(process.env.AWSCITY_EXT ?? '.output/chrome-mv3');
const out = path.resolve(process.argv[2] ?? '.output/smoke');
const only = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// `from`: the surface that asks (city = the full tab, panel = the side panel page). `open`: the player opened the
// practice console at this service first (otherwise the Copilot opens or moves it). `confirm`: the step handed back.
const FLOWS = [
  { id: 's3', goal: 'Create an S3 bucket', open: true, expect: /^city-demo-\w+ \(SSE-S3 · Block all public access on\)$/ },
  { id: 'ec2', goal: 'Launch an EC2 instance', expect: /^city-web-\w+ \(t3\.micro\)$/, confirm: 'Launch instance' },
  { id: 'dynamodb', goal: 'Create a DynamoDB table', expect: /^city-demo-\w+ \(pk id\)$/ },
  { id: 'lambda', goal: 'Create a Lambda function', expect: /^city-hello \(Node\.js 24\.x, from scratch\)$/ },
  { id: 'rds', goal: 'Create an RDS database', expect: /^city-db-\w+ \(PostgreSQL, Free tier\)$/, confirm: 'Create database' },
  { id: 'cloudfront', goal: 'Create a CloudFront distribution', expect: /^city-site\.s3\.us-west-2\.amazonaws\.com \(OAC, redirect http to https\)$/ },
  { id: 'sqs', goal: 'Create an SQS queue', from: 'panel', expect: /^city-orders-\w+ \(Standard\)$/ },
  { id: 'iam', goal: 'Create an IAM role for Lambda', expect: /^city-lambda-role-\w+ \(Lambda, AWSLambdaBasicExecutionRole\)$/, confirm: 'Create role' },
].filter((f) => !only.length || only.includes(f.id));

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'awscity-cp-')), {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1300, height: 820 },
});
let [sw] = ctx.serviceWorkers();
sw ??= await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const PRACTICE = `chrome-extension://${id}/practice.html`;
const errors = [];
const watch = (page, label) => page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
const isPractice = (p) => p.url().startsWith(PRACTICE);

const city = await ctx.newPage();
watch(city, 'city');
await city.goto(`chrome-extension://${id}/city.html`);
await wait(2500);
// Every "browsing grew it" toast the city shows (they carry the building's service id).
await city.evaluate(() => {
  window.__grew = [];
  window.awsCity.useCity.subscribe((s) => {
    for (const t of s.toasts) if (t.serviceId && !window.__grew.includes(`${t.text} | ${t.detail}`)) window.__grew.push(`${t.text} | ${t.detail}`);
  });
});
let panel;

const chip = (page, control) => page.locator(`[data-awscity-overlay] button[data-control="${control}"]`);
const results = [];

for (const [n, flow] of FLOWS.entries()) {
  const asker = flow.from === 'panel' ? (panel ??= await ctx.newPage()) : city;
  if (asker === panel && !asker.url().includes('sidepanel')) {
    watch(panel, 'panel');
    await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await wait(2000);
  }
  if (flow.open) {
    const p = await ctx.newPage();
    watch(p, `practice(${flow.id})`);
    await p.goto(`${PRACTICE}#/${flow.id}`);
    await p.bringToFront();
    await wait(1200);
  }
  const focus = await asker.evaluate(() => window.awsCity.useCity.getState().focus);
  console.log(`\n[${flow.id}] asked from the ${flow.from ?? 'city'} page; focus:`, focus?.kind, focus?.serviceId);
  const opened = ctx.waitForEvent('page', { predicate: isPractice, timeout: 8000 }).catch(() => undefined);
  await asker.evaluate((g) => window.awsCity.startConsoleCopilot(g), flow.goal);
  const tab = ctx.pages().find(isPractice) ?? (await opened);
  if (!tab) {
    errors.push(`${flow.id}: the practice console never opened`);
    results.push({ flow: flow.id, ok: false });
    continue;
  }
  if (!flow.open) watch(tab, `practice(${flow.id})`);
  await tab.bringToFront();

  let shot = 0;
  const snap = async (label) => tab.screenshot({ path: `${out}/copilot-${flow.id}-${String(shot++).padStart(2, '0')}${label ? `-${label}` : ''}.png` });
  let created;
  const t0 = Date.now();
  let paused = false;
  let explained = false;
  let speedSet = false;
  let confirmed = false;
  while (Date.now() - t0 < 90_000) {
    await wait(1500);
    // The chip: set the speed once (persists to later flows), pause/resume once, explain again once.
    if (!speedSet && n === 0 && (await chip(tab, 'speed').count())) {
      await chip(tab, 'speed').click(); // normal → fast
      speedSet = true;
      console.log(`[${flow.id}] speed:`, await chip(tab, 'speed').textContent());
    }
    if (!paused && flow.id === 'dynamodb' && (await chip(tab, 'pause').count()) && Date.now() - t0 > 5000) {
      await chip(tab, 'pause').click();
      paused = true;
      await wait(2500); // anything already under way finishes
      const before = await tab.evaluate(() => document.getElementById('app').innerHTML);
      await snap('paused');
      await wait(5000);
      const after = await tab.evaluate(() => document.getElementById('app').innerHTML);
      console.log(`[${flow.id}] pause held the page still for 5 s:`, before === after);
      if (before !== after) errors.push(`${flow.id}: the agent acted while paused`);
      await chip(tab, 'pause').click(); // resume
    }
    if (!explained && flow.id === 'ec2' && (await chip(tab, 'explain').count())) {
      await chip(tab, 'explain').click();
      explained = true;
      await wait(300);
      await snap('explain');
    }
    // A step that bills or changes access (risk 'confirm') is handed to the player: play the player and click it.
    if (flow.confirm && !confirmed && (await tab.locator('[data-awscity-overlay]').getByText('needs your OK').count())) {
      await snap('your-turn');
      await tab.getByRole('button', { name: flow.confirm, exact: true }).click();
      confirmed = true;
      console.log(`[${flow.id}] player confirmed: ${flow.confirm}`);
    }
    if (shot < 14) await snap();
    created = await tab.evaluate(() => document.body.dataset.created);
    if (created) break;
  }
  // let the "done" step show, then check nothing risky was ever clicked
  await wait(2500);
  await snap('final');
  const risky = await tab.evaluate(() => document.body.dataset.risky ?? '');
  const ok = !!created && flow.expect.test(created) && !risky && (!flow.confirm || confirmed);
  results.push({ flow: flow.id, created, risky: risky || 'none', ok });
  console.log(`[${flow.id}] created: ${created ?? '(nothing)'} · risky clicks: ${risky || 'none'} · ${ok ? 'OK' : 'FAIL'}`);
  const busy = await asker.evaluate(() => window.awsCity.useCity.getState().copilotTaskId);
  if (busy) await asker.evaluate(() => window.awsCity.stopConsoleCopilot());
  // A fresh practice console for the next flow (its "created" marker lives in the page).
  await tab.close();
  await wait(500);
}

// The demo Lookout from the full tab: it opens the practice console, photographs it and classifies it.
await city.bringToFront();
const before = await city.evaluate(() => window.awsCity.useCity.getState().lastClassified?.summary);
await city.evaluate(() => window.awsCity.snap());
let look;
for (let i = 0; i < 20 && !look; i++) {
  await wait(500);
  look = await city.evaluate((b) => {
    const s = window.awsCity.useCity.getState();
    // The browser wants the player's OK for the photo: here the player says no, so the Lookout goes by the address.
    if (s.snap === 'needs-permission' && window.awsCity.canLookByAddress()) return (window.awsCity.lookByAddress(), 'asked');
    return s.lastClassified && s.lastClassified.summary !== b ? { summary: s.lastClassified.summary, photo: !!s.lastSnapshot, state: s.snap } : undefined;
  }, before);
  if (look === 'asked') (console.log('lookout: asked for "📷 Allow"; declined here, so it goes by the address'), (look = undefined));
}
console.log('\nlookout (full tab):', JSON.stringify(look ?? null));
if (!look) errors.push('lookout: the demo Lookout never classified the practice console');
const practiceShot = ctx.pages().find(isPractice);
if (practiceShot) await practiceShot.screenshot({ path: `${out}/practice-console.png` });

const speed = await sw.evaluate(() => chrome.storage.local.get('copilotSpeed'));
console.log('stored speed:', JSON.stringify(speed));
await city.bringToFront();
await wait(600);
await city.screenshot({ path: `${out}/copilot-city.png` });
const feed = await city.evaluate(() => window.awsCity.useCity.getState().feed.filter((f) => f.text.includes('🖱️')).map((f) => f.text.slice(0, 100)));
console.log('steps:\n  ' + feed.join('\n  '));
// "Browsing grew it": opening a practice console page grew (or found) its building, with the building toast.
const grew = await city.evaluate(() => window.__grew);
console.log('browsing grew it:\n  ' + (grew.join('\n  ') || '(no toast)'));
if (!grew.length) errors.push('browsing: no "grew it" toast in the city');
console.log(JSON.stringify(results));
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
await ctx.close();
process.exit(results.every((r) => r.ok) && results.length === FLOWS.length && !errors.length ? 0 : 1);
