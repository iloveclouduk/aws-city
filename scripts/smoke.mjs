// Loads the built extension into Playwright's Chromium and screenshots the key moments.
// Usage: npm run build && node scripts/smoke.mjs [outDir]   (needs `npm i -D playwright && npx playwright install chromium`)
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const ext = path.resolve('.output/chrome-mv3');
const out = path.resolve(process.argv[2] ?? '.output/smoke');
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'awscity-')), {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1400, height: 880 },
});
let [sw] = ctx.serviceWorkers();
sw ??= await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
console.log('extension id', id);

const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => (errors.push(`pageerror: ${e.message}`), console.log('PAGEERROR', e.message, e.stack?.split('\n').slice(0, 4).join(' | '))));
page.on('console', (m) => m.type() === 'error' && (errors.push(`console: ${m.text()}`), console.log('CONSOLE', m.text().slice(0, 400))));
// A missing file names itself (the console line alone says only ERR_FILE_NOT_FOUND).
page.on('requestfailed', (r) => console.log('REQUEST FAILED', r.url().slice(0, 200), r.failure()?.errorText ?? ''));
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('📸', name);
};
const city = (fn, ...a) => page.evaluate(fn, ...a);
// Accessibility (WCAG 2.2 A/AA rules from axe-core) on what a player sees. The canvas is the game (its own keys and
// labels), so it's excluded. Serious and critical violations fail the smoke; the rest are listed.
const AXE = fs.readFileSync(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8');
const audit = async (where, p = page) => {
  await p.evaluate(AXE); // through DevTools, not a <script> tag: the extension's CSP blocks inline scripts
  const found = await p.evaluate(async () => {
    const r = await window.axe.run({ exclude: [['canvas']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, at: v.nodes.slice(0, 3).map((x) => x.target.join(' ')) }));
  });
  for (const v of found) {
    const line = `${where}: a11y ${v.impact} ${v.id} ×${v.n} (${v.at.join(' | ')})`;
    console.log(line);
    if (v.impact === 'serious' || v.impact === 'critical') errors.push(line);
  }
  if (!found.length) console.log(`${where}: a11y clean`);
};

await page.goto(`chrome-extension://${id}/city.html`);
await wait(2500);
// A first run opens on the world map: pick a Region and dive into its city.
const startView = await city(() => window.awsCity.useCity.getState().view.name);
if (startView !== 'world') errors.push(`first run should open on the world map, got ${startView}`);
await wait(1500); // the world map fades in from the sea
await shot('00-world');
await audit('world map');
// Screenshots don't depend on the time of day the smoke runs: midday unless a shot asks for night.
await city(() => window.awsCity.bus.emit('hour', { hour: 12 }));
await page.mouse.click(10, 10); // a gesture, so sound may unlock (nothing should have queued)
// A first run's world map says one friendly line; the facts (AZs, opt-in, prices) wait behind "Facts ›" (the M key)
// until the player has a city, so M does nothing yet.
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowLeft'); // back to the suggested Region (us-west-2)
await page.keyboard.press('m');
await wait(300);
if (await page.locator('.home .next').count()) errors.push('first run: Home shows a quest card before a Region is picked (one call to action)');
await shot('00b-world-first');
// Connie offers the suggested Region: "Start in Oregon" dives into us-west-2.
const startBtn = page.locator('.world-intro button', { hasText: 'Start in Oregon' });
if (!(await startBtn.count())) errors.push('first run: Connie\'s "Start in Oregon" button is missing on the world map');
else await startBtn.click();
await wait(1500);
if ((await city(() => window.awsCity.useCity.getState().cityRegion)) !== 'us-west-2') errors.push('first run: "Start in Oregon" did not open us-west-2');
const firstTabs = await page.locator('.tabs button').evaluateAll((bs) => bs.map((b) => b.title));
if (firstTabs.join() !== 'City') errors.push(`first run: tabs should start as City only, got ${firstTabs.join()}`);
await shot('01-start');

// Simple mode is the default (src/state/simple.ts): a first city's City tab is one To-do list, and the HUD shows ⭐,
// coins, "To do", Decorate and ⋯ only. The checks after this look at every feature, so they turn Everything on first.
const simple0 = await page.evaluate(() => ({
  pref: window.awsCity.useCity.getState().prefs.simple,
  rows: [...document.querySelectorAll('#city-tabpanel .todo-row .todo-go')].map((b) => b.textContent.trim()),
  shift: !!document.querySelector('#city-tabpanel .shift, #city-tabpanel .more-fold'),
  extras: [...document.querySelectorAll('.hud .rank-chip, .hud .hud-lights, .hud .hud-rush, .ticker-line')].map((e) => e.className),
}));
console.log('simple home (first city):', JSON.stringify(simple0));
if (simple0.pref === false) errors.push('simple mode: it should be on by default');
if (!simple0.rows.length) errors.push('simple mode: the City tab has no To-do list');
if (simple0.shift) errors.push('simple mode: the shift card or More to do shows');
if (simple0.extras.length) errors.push(`simple mode: hidden extras show: ${simple0.extras.join(', ')}`);
if (simple0.rows.some((t) => /^Go\b/.test(t))) errors.push(`simple mode: a task's button says "${simple0.rows.join(' | ')}"`);
await shot('01s-simple-first-city');
await city(() => window.awsCity.useCity.getState().setPref('simple', false));
await wait(300);

// A new player isn't flooded: the demo's findings arrive from 3 s on, but stay held until city care unlocks.
await wait(12_000);
const calm = await city(() => ({ findings: Object.keys(window.awsCity.useCity.getState().findings).length, toasts: window.awsCity.useCity.getState().toasts.length }));
console.log('calm city after 12 s:', JSON.stringify(calm));
if (calm.findings) errors.push(`calm city: ${calm.findings} findings shown before care unlocked`);
if (calm.toasts > 1) errors.push(`calm city: ${calm.toasts} toasts queued in the first seconds`);
await shot('01c-calm');

// City care: once released (a quest done, 4 landmarks or a linked account), findings drip in; a citizen walks to the first one.
await city(() => window.awsCity.releaseCare());
const careStart = Date.now();
while (Date.now() - careStart < 15_000 && !(await city(() => Object.keys(window.awsCity.useCity.getState().findings).length))) await wait(300);
const firstFinding = await city(() => Object.values(window.awsCity.useCity.getState().findings)[0]);
console.log('first finding:', firstFinding ? `${firstFinding.ruleId} on ${firstFinding.resource.name}` : 'none');
if (!firstFinding) errors.push('city care: no finding arrived in demo mode');
else {
  await wait(10_000); // the citizen's walk
  await city((id) => window.awsCity.bus.emit('showFinding', { findingId: id }), firstFinding.id);
  await wait(1200);
  await shot('19-city-care');
}

// Real browsing: a tab on AWS docs should reach the city via background.ts → runtime message.
const tab = await ctx.newPage();
await tab.goto('https://docs.aws.amazon.com/lambda/latest/dg/welcome.html', { waitUntil: 'commit' }).catch((e) => console.log('docs nav failed (offline?)', e.message));
await wait(2500);
const focus = await city(() => window.awsCity.useCity.getState().focus);
console.log('focus from background:', JSON.stringify(focus && { kind: focus.kind, serviceId: focus.serviceId, url: focus.url.slice(0, 60) }));
await tab.close();
await page.bringToFront();

await city(() => window.awsCity.simulateFocus('https://console.aws.amazon.com/console/home', 'Console Home'));
await wait(1500);
await city(() => window.awsCity.simulateFocus('https://eu-west-2.console.aws.amazon.com/s3/buckets?region=eu-west-2', 'S3 buckets'));
await wait(4500);
await shot('02-s3-discovered');
// The building's card: comparisons and the partners' Learn more shelf (links only, credited).
await city(() => (window.awsCity.useCity.getState().select('s3'), window.awsCity.bus.emit('select', { id: 's3' })));
await wait(1200);
const shelf = await page.$('.place-reading');
if (!shelf) errors.push('the S3 card has no Learn more shelf');
else {
  await shelf.evaluate((el) => {
    el.scrollIntoView({ block: 'center' });
  });
  await wait(300);
  await shot('02b-learn-more');
  await audit('place card');
}

// Watch it done (src/state/watch.ts): the story before, Watch (the camera follows Sally), one live line during, the
// result card after (what was built, what it teaches, what it paid, the next step).
await city(() => window.awsCity.submitPrompt('Store my holiday photos cheaply'));
await wait(3500);
if (!(await page.locator('.watch-framing').count())) errors.push('Watch it done: no framing before the agent works');
await page.locator('.watch-btn').first().click().catch(() => errors.push('Watch it done: no Watch button'));
await shot('03-task-dispatch');
await wait(6000);
// The demo task takes about 16 s: by now Sally has arrived and works, so the card shows one live step.
if (!(await page.locator('.watch-live').count())) errors.push('Watch it done: no live step while watching');
await shot('04-task-walking-working');
await wait(9000);
await shot('05-task-steps');
await wait(9000);
// The result card may sit in Home's "More to do" fold: open it to look.
await page.evaluate(() => {
  const card = document.querySelector('.task.done');
  card?.closest('details')?.setAttribute('open', '');
  card?.scrollIntoView({ block: 'center' });
});
await wait(300);
if (!(await page.locator('.task.done .watch-teaches').count())) errors.push('Watch it done: the result card has no "What it teaches"');
await shot('06-task-done');

// level everything up a bit for a fuller city
await city(() => {
  const s = window.awsCity.useCity.getState();
  for (const [id, xp] of [['s3', 60], ['lambda', 120], ['iam', 12], ['route53', 45], ['dynamodb', 210], ['shield', 110], ['bedrock', 45], ['ecs', 40], ['vpc', 20], ['efs', 0], ['aurora', 110], ['rekognition', 0]]) s.addXp(id, xp || 1);
});
await wait(2500);
await city(() => {
  const cam = document.querySelector('canvas');
  return !!cam;
});
await page.mouse.wheel(0, 400);
await wait(800);
await shot('07-city-grown');

await city(() => window.awsCity.useCity.getState().setView({ name: 'interior', districtId: 'storage' }));
await wait(2000);
await city(() => window.awsCity.askDistrict('storage', 'When should I use EFS?'));
await wait(1200);
await shot('08-interior-working');
await wait(5000);
await shot('09-interior-answer');

await city(() => window.awsCity.useCity.getState().setView({ name: 'interior', districtId: 'spheres' }));
await wait(2500);
await shot('09b-spheres-interior');

await city(() => window.awsCity.useCity.getState().setView({ name: 'game', game: 'fishing' }));
await wait(1500);
await shot('10-fishing');
for (const g of ['shield', 'route53', 'lambda', 'queue', 'iamgate', 'edge']) {
  await city((game) => window.awsCity.useCity.getState().setView({ name: 'game', game }), g);
  await wait(3500);
  await shot(`10-game-${g}`);
}
await city(() => window.awsCity.useCity.getState().setView({ name: 'city' }));
await wait(1200);
// Night time + keyboard: Kai walks with the arrow keys
await city(() => window.awsCity.bus.emit('hour', { hour: 22 }));
for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
await wait(1500);
await shot('13-night');
await city(() => window.awsCity.bus.emit('hour', { hour: 12 }));
// The unlock ladder hides Learn, Jobs and Deploy from a new player. Seed a seasoned player's progress (every quest done
// but the last, so the quests in More to do still have an "Up next" card with "Start quest") before any tab is clicked.
await city((seed) => {
  delete seed.quests['walled-garden'];
  window.awsCity.loadProgress(seed);
}, JSON.parse(fs.readFileSync('tests/fixtures/progress-all.json', 'utf8')));
await wait(800);
const seededTabs = await page.locator('.tabs button').evaluateAll((bs) => bs.map((b) => b.title));
if (seededTabs.join() !== 'City,Learn,Jobs,Deploy') errors.push(`seeded progress: expected every tab, got ${seededTabs.join()}`);
// Learning modes
const clickTab = async (label) => page.locator(`.tabs button[title="${label}"]`).click();
await clickTab('Learn');
await wait(400);
await page.locator('.flash').click().catch(() => {});
await wait(300);
await shot('14-flashcards');
await page.locator('.seg button[data-sub="build"]').click();
// Architecture diagram: a refused drop first (a required card on a bonus spot), then follow the hints.
// The first hinted card is dragged with the mouse; the rest are tap card → tap spot.
const hintBtn = page.locator('.arch-row .btn');
await hintBtn.click(); // the free nudge
await hintBtn.click(); // show the card (−3)
await page.locator('.tray .card.hinted').click();
await page.locator('.slot.empty.opt').first().click();
await wait(150);
await shot('15a-architecture-reject');
await page.locator('.tray .card.armed').click(); // put it down again
for (let i = 0; i < 12 && (await hintBtn.isEnabled()); i++) {
  await hintBtn.click();
  if (!(await page.locator('.tray .card.hinted').count())) await hintBtn.click();
  const card = page.locator('.tray .card.hinted');
  const slot = page.locator('.slot.hinted');
  if (i === 0) {
    const a = await card.boundingBox();
    const b = await slot.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 - 20, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
  } else {
    await card.click();
    await slot.click();
  }
}
await page.getByText('Check design').click();
await wait(500);
await shot('15-architecture');
await wait(1600);
await shot('15b-architecture-flow');
const arch = await page.evaluate(() => ({ flow: !!document.querySelector('.flow-bar'), filled: document.querySelectorAll('.slot.filled').length }));
console.log('architecture:', JSON.stringify(arch));
if (!arch.flow) errors.push('architecture: the design did not pass, so no flow played');
await clickTab('City');
await wait(300);
await shot('10-shift');
await audit('today\'s shift');
// One obvious button: exactly one filled button in the City tab, and it says what happens (never a bare "Go").
const shiftPrimary = await page.locator('#city-tabpanel .btn.primary:visible').evaluateAll((bs) => bs.map((b) => b.textContent.trim()));
if (shiftPrimary.length !== 1) errors.push(`today's shift: expected one primary button, got ${shiftPrimary.length} (${shiftPrimary.join(' | ')})`);
if (shiftPrimary.some((t) => /^Go\b/.test(t))) errors.push(`today's shift: the big button says "${shiftPrimary[0]}"`);
console.log('shift button:', shiftPrimary.join(' | '));
await page.locator('.more-fold:not([open]) > summary').click();
await page.locator('.quests-fold:not([open]) > summary').click();
await page.getByText('Start quest').first().click();
await wait(400);
await shot('16-quests');
await clickTab('Deploy');
// Demo mode: one primary button links the practice account; how real accounts connect is folded below it.
await page.getByText('Use the practice account (nothing real)').click();
await wait(1500);
await page.getByText('Preview').first().click();
await wait(3500);
await shot('17-deploy-preview');
await page.getByText('Approve & deploy').click();
await wait(8000);
await shot('18-deploy-done');

// City care: teach Noor to Fixer (as 20 flashcards would), open the city-built table's finding, and approve its fix in the card.
await city(() => window.awsCity.useCity.getState().awardCitizens([{ citizenId: 'citizen:reliability', amount: 20, reason: 'you reviewed 20 reliability flashcards' }]));
await clickTab('City');
await wait(400);
await city(() => window.awsCity.releaseCare(true));
// City care is folded under its health line in the City tab's More to do; open both.
// The list shows the 3 most serious; the table's finding (medium) may be under "+N more".
await page.locator('.more-fold:not([open]) > summary').click().catch(() => {});
await page.locator('.care-fold:not([open]) > summary').click().catch(() => {});
await page.locator('.care-more').click().catch(() => {});
await wait(200);
await shot('19-city-care-list');
const careRow = page.locator('.care-row', { hasText: 'point-in-time recovery' });
if (!(await careRow.count())) errors.push('city care: the PITR finding is not in the City care list');
else {
  await careRow.first().click();
  await wait(1500);
  await shot('19a-finding-card');
  await page.locator('.finding-card').getByRole('button', { name: 'Fix…' }).click();
  const approve = page.locator('.finding-card').getByRole('button', { name: 'Approve the fix' });
  await approve.waitFor({ timeout: 10_000 });
  await wait(600);
  await shot('19a2-fix-preview');
  const onDeploy = await page.locator('.tabs button[title="Deploy"][aria-selected="true"]').count();
  if (onDeploy) errors.push('city care: a fix preview switched to the Deploy tab');
  await approve.click();
  const fixStart = Date.now();
  const resolved = () => city(() => Object.values(window.awsCity.useCity.getState().findings).some((f) => f.ruleId === 'dynamodb-no-pitr' && f.status === 'resolved'));
  while (Date.now() - fixStart < 15_000 && !(await resolved())) await wait(300);
  if (!(await resolved())) errors.push('city care: the approved fix did not resolve the finding');
  const care = await city(() => {
    const s = window.awsCity.useCity.getState();
    return { noorXp: s.progress.citizens?.['citizen:reliability']?.xp, fixes: Object.keys(s.progress.fixes ?? {}).length, open: Object.values(s.findings).filter((f) => f.status === 'open').length };
  });
  console.log('city care:', JSON.stringify(care));
  await wait(900);
  await shot('19b-fixed');
  await page.locator('.finding-card').getByRole('button', { name: 'Close' }).click().catch(() => {});
}

// Regions: the world map with the demo account's cities and links, then another Region's city.
await city(() => window.awsCity.useCity.getState().openWorld());
await wait(1500);
await shot('20-world-links');
// The dive: Enter zooms into the focused Region and fades to the sea; the city pans in from the coast it came from.
await page.keyboard.press('Enter');
const diveAt = Date.now();
while (Date.now() - diveAt < 3000 && (await city(() => window.awsCity.useCity.getState().view.name)) !== 'city') await wait(50);
await wait(300); // ~300 ms into the 700 ms arrival pan
await shot('33-dive-arrive');
await wait(800);
await city(() => window.awsCity.useCity.getState().enterRegion('eu-west-1'));
await wait(1800);
await shot('21-city-eu-west-1');
// Each Region's city has its own landmark by the highway (shared/region-flavour.json signature).
for (const code of ['ap-northeast-1', 'ap-southeast-2', 'me-central-1', 'us-west-1']) {
  await city((c) => window.awsCity.useCity.getState().enterRegion(c), code);
  await wait(1500);
  await city(() => window.awsCity.bus.emit('flyTo', { id: 'signature' }));
  await wait(900);
  await shot(`27-sig-${code}`);
}
await city(() => window.awsCity.useCity.getState().enterRegion('eu-west-1'));
await wait(800);
await city(() => window.awsCity.useCity.getState().enterRegion('us-west-2'));
await wait(8000); // an AZ link plays over a bridge
await shot('22-az-bridges');

// Real Regions: N. Virginia's six AZ bands; a Region that doesn't offer every service (fenced lots); prices; the Region sign.
await city(() => window.awsCity.useCity.getState().enterRegion('us-east-1'));
await wait(1800);
await shot('23-us-east-1-six-azs');
await city(() => window.awsCity.useCity.getState().enterRegion('af-south-1'));
await wait(1500);
// Rekognition isn't offered in Cape Town: its landmark is a fenced lot, and its card says where it is.
// Selecting the way a tap does (the select moment opens the place card).
const pick = (id) => city((i) => (window.awsCity.useCity.getState().select(i), window.awsCity.bus.emit('select', { id: i })), id);
await city(() => window.awsCity.useCity.getState().discover('rekognition'));
await pick('rekognition');
await wait(1800);
await shot('24-closed-lot');
if (!(await page.locator('.region-price.closed').count())) errors.push('Rekognition in af-south-1 should show as not offered');
await pick('ec2');
await wait(1200);
await shot('25-price-card');
if (!(await page.locator('.region-price .prices').count())) errors.push('the EC2 card should show af-south-1 list prices');
await pick('regionsign');
await wait(1200);
await shot('26-region-sign');

// v2.10: AWS North Hall (the conference talks) and the Workshop Studio: a practice workshop step with a taught mistake
// (no billing mode), then the right command, which passes the step and grows DynamoDB.
await pick('northhall');
await wait(1200);
if (!(await page.locator('.north-hall').count())) errors.push('AWS North Hall: its card did not open');
await shot('34-north-hall');
await pick('workshop');
await wait(1000);
if (!(await page.locator('.workshop-studio').count())) errors.push('Workshop Studio: its card did not open');
await city(() => window.awsCity.useCity.getState().openWorkshop('dynamodb-first-table'));
await wait(600);
await page.locator('.workshop-steps button').nth(1).click();
const term = page.locator('.terminal-input textarea');
const xpBefore = await city(() => window.awsCity.useCity.getState().progress.cities?.['af-south-1']?.landmarks.dynamodb?.xp ?? 0);
await term.fill('aws dynamodb create-table --table-name smoke-orders --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH');
await term.press('Enter');
await wait(300);
if (!(await page.locator('.terminal-line.err', { hasText: 'ValidationException' }).count())) errors.push('workshop: the missing billing mode should print the real ValidationException');
await term.fill('aws dynamodb create-table --table-name smoke-orders --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH --billing-mode PAY_PER_REQUEST');
await term.press('Enter');
await wait(500);
await shot('35-workshop-practice');
// The terminal's tools (Hint, Fill my names, Tab) stay in sight without scrolling the dialog.
const toolsInView = async (p, where) => {
  const box = await p.locator('.terminal-tools').first().boundingBox();
  const vh = p.viewportSize()?.height ?? 0;
  if (!box || box.y < 0 || box.y + box.height > vh) errors.push(`${where}: the terminal's Hint/Fill/Tab row is out of sight (${JSON.stringify(box)} in ${vh}px)`);
};
await toolsInView(page, 'workshop (tab)');
const step = await city(() => window.awsCity.useCity.getState().progress.workshops?.['dynamodb-first-table']?.steps.create);
if (step !== 'practice') errors.push(`workshop: the create step should be done in practice, got ${step}`);
const xpAfter = await city(() => window.awsCity.useCity.getState().progress.cities?.['af-south-1']?.landmarks.dynamodb?.xp ?? 0);
if (!(xpAfter > xpBefore)) errors.push('workshop: a practised step should grow DynamoDB');
await audit('workshop');
// The rest of the workshop in practice, to its "Workshop complete" card: Tab types the name used before, each pass
// moves on by itself, and the city drops the building's plaque.
const runStep = async (i, line, tab) => {
  await wait(1100);
  await page.locator('.workshop-steps button').nth(i).click();
  await term.fill(line);
  if (tab) {
    await term.press('Tab');
    if (!(await term.inputValue()).includes('smoke-orders')) errors.push('workshop: Tab should type the table name used before');
  }
  await term.press('Enter');
};
await runStep(2, 'aws dynamodb wait table-exists --table-name ', true);
await runStep(3, `aws dynamodb put-item --table-name smoke-orders --item '{"pk":{"S":"order#1"},"total":{"N":"42"}}'`);
await runStep(4, `aws dynamodb get-item --table-name smoke-orders --key '{"pk":{"S":"order#1"}}'`);
await runStep(5, 'aws dynamodb delete-table --table-name smoke-orders');
await runStep(0, 'aws sts get-caller-identity');
await wait(1800);
if (!(await page.locator('.workshop-done').count())) errors.push('workshop: no "Workshop complete" card after the last step');
if (!(await city(() => !!window.awsCity.useCity.getState().progress.workshops?.['dynamodb-first-table']?.done))) errors.push('workshop: should be finished');
await shot('35b-workshop-done');
await audit('workshop done');
await page.locator('.workshop-done button', { hasText: 'Keep exploring' }).click();
await wait(900);
await shot('35c-workshop-plaque');
await city(() => window.awsCity.useCity.getState().openWorkshop(undefined));

// v2.11: the Mayor's city. My City (rank, badges, AWS at scale), the practice leaderboard with a public profile, a
// Launch Day round (build, play, debrief) and the sandbox's Well-Architected review.
await page.locator('.rank-chip').first().click();
await wait(500);
if (!(await page.locator('.collection-card .badge-grid li').count())) errors.push('My City: no badges listed');
await shot('36-my-city');
await audit('my city');
await city(() => window.awsCity.useCity.getState().openCollection(false));

// Round 3 step 2: the loops that bring you back (contract v2.15). A seasoned player's City Lights at night (two missed
// days dimmed, two freezes held, mint windows from a crate), the season road and the Service Codex in My City, and the
// Daily Supply Drop once the shift is done.
await city(() => {
  const st = window.awsCity.useCity.getState();
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const days = [];
  for (let i = 30; i >= 1; i--) if (i !== 9 && i !== 10) days.push(key(new Date(Date.now() - i * 86_400_000)));
  const months = ['snowy-security', 'data-hearts', 'serverless-spring', 'blossom-networks', 'container-may', 'data-lake-summer', 'edge-summer', 'ai-holiday', 'back-to-builders', 'harvest-streams', 'observability-autumn', 'winter-lights'];
  const season = months[new Date().getMonth()];
  window.awsCity.useCity.setState({
    progress: { ...st.progress, lights: { days, total: 34, freezes: 2 }, seasons: { [season]: { points: 45, claimed: [0, 1] } }, drops: { owned: ['glow-mint', 'snowman'] }, updatedAt: new Date().toISOString() },
    prefs: { ...st.prefs, glow: 'glow-mint' },
  });
});
await city(() => window.awsCity.useCity.getState().setView({ name: 'city' }));
await city(() => window.awsCity.bus.emit('hour', { hour: 22 }));
await wait(2200);
await shot('43-city-lights-night');
await city(() => window.awsCity.bus.emit('hour', { hour: 12 }));
await page.locator('.rank-chip').first().click();
await wait(400);
await page.locator('#lights-title').scrollIntoViewIfNeeded();
await shot('44a-my-city-lights');
await page.locator('#season-title').scrollIntoViewIfNeeded();
await wait(200);
if ((await page.locator('.season-road li').count()) !== 8) errors.push('My City: the season road should have 8 steps');
if (!(await page.locator('.season-road li.ready').count())) errors.push('My City: a reached season step should be claimable');
await shot('44-season-road');
await page.locator('#codex-title').scrollIntoViewIfNeeded();
await wait(200);
if (!(await page.locator('.codex-sets li').count())) errors.push('My City: the Service Codex lists no sets');
await shot('45-codex');
await audit('my city loops');
await city(() => window.awsCity.useCity.getState().openCollection(false));
await clickTab('City');
await city(() => {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  window.awsCity.useCity.setState({ today: { day, cards: 40, puzzles: 5, fixes: 5, games: 5, labs: 5 } });
});
await wait(500);
if (!(await page.locator('.supply-drop').count())) errors.push('Home: a finished shift should offer the Daily Supply Drop');
else {
  await page.locator('.supply-drop').scrollIntoViewIfNeeded();
  await shot('46-supply-drop');
  await audit('supply drop');
  await page.getByRole('button', { name: 'Open the crate' }).click();
  await wait(600);
  await shot('46b-supply-drop-open');
  const owned = await city(() => window.awsCity.useCity.getState().progress.drops?.owned.length ?? 0);
  if (owned !== 3) errors.push(`Supply Drop: expected 3 owned after opening, got ${owned}`);
}
await city(() => window.awsCity.useCity.getState().setPublic(true));
await city(() => window.awsCity.useCity.getState().openBoard('mayors:af-south-1'));
await wait(300);
await city(() => window.awsCity.useCity.getState().openBoard(undefined));
await page.locator('.hud .menu-btn, .hud [aria-label="More"]').first().click().catch(() => {});
await page.locator('button[role="menuitem"]', { hasText: 'Leaderboards and live city' }).click().catch(() => errors.push('menu: no Leaderboards entry'));
await wait(900);
if (!(await page.locator('.board-list li').count())) errors.push('leaderboard: the practice board is empty');
if (!(await page.locator('.board-list li.you').count())) errors.push('leaderboard: a public profile should show its own row');
await shot('37-leaderboard');
await audit('leaderboard');
await city(() => window.awsCity.useCity.getState().openBoard(undefined));
await city(() => window.awsCity.useCity.getState().openLaunch(true));
await wait(400);
await page.locator('.launch-card .btn.primary.wide').click();
await wait(60 * 160 + 1500);
if (!(await page.locator('.launch-debrief .grade').count())) errors.push('Launch Day: no debrief after the round');
await shot('38-launch-day');
await audit('launch day');
await city(() => window.awsCity.useCity.getState().openLaunch(false));
await clickTab('Learn').catch(() => {});
await page.locator('.seg button[data-sub="sandbox"]').click().catch(() => errors.push('Learn: no Drawing board tab'));
await wait(400);
if (!(await page.locator('.drawing-intro').count())) errors.push('Drawing board: no intro card');
await shot('39a-drawing-board-intro');
const pieces = page.locator('.sandbox-palette .sb-piece');
if ((await pieces.count()) < 5) errors.push('sandbox: the tray is too small');
await page.locator('.sandbox-palette .sb-piece', { hasText: 'Users' }).click();
await page.locator('.sb-cell').nth(0).click();
await page.locator('.sandbox-palette .sb-piece', { hasText: 'S3' }).first().click();
await page.locator('.sb-cell').nth(2).click();
await page.locator('.sandbox-palette .sb-piece', { hasText: 'Lambda' }).first().click();
await page.locator('.sb-cell').nth(4).click();
await page.locator('.sandbox .btn.primary', { hasText: 'Review' }).click();
await wait(300);
if (!(await page.locator('.sandbox-review').count())) errors.push('sandbox: the review did not show');
await shot('39-sandbox');
await audit('sandbox');

// v2.6: AWS's public status. The demo plays the real dashboard (Bahrain and the UAE, 2026): a ticker over the city,
// Bahrain's city fenced and under rain, the incident's card, and the Region throbbing on the world map.
await city(() => (window.awsCity.useCity.getState().select(undefined), window.awsCity.useCity.getState().enterRegion('me-south-1')));
await wait(2500);
await shot('40-bahrain-storm');
if (!(await page.locator('.ticker').count())) errors.push('the AWS status ticker should show over the city');
await city(() => {
  const s = window.awsCity.useCity.getState();
  s.openIncident(s.health?.incidents.find((i) => i.region === 'me-south-1')?.id);
});
await wait(700);
await shot('41-incident-card');
if (!(await page.locator('.incident-card').count())) errors.push('the Bahrain incident card should open');
await page.keyboard.press('Escape');
await wait(300);
if (await page.locator('.incident-card').count()) errors.push('Escape should close the incident card');
await city(() => window.awsCity.useCity.getState().openWorld());
await wait(1500);
await shot('42-world-incidents');
await city(() => (window.awsCity.useCity.getState().select(undefined), window.awsCity.useCity.getState().enterRegion('us-west-2')));
await wait(1000);

// A citizen's question (src/game/Requests.ts raises it when Kai walks up): an accessible dialog, and answering it is a
// real flashcard review.
const s3Cards = JSON.parse(fs.readFileSync('shared/flashcards.json', 'utf8')).cards.s3;
const asked = s3Cards[0];
const repsBefore = await city((id) => window.awsCity.useCity.getState().progress.cards?.[id]?.reps ?? 0, asked.id);
await city((r) => window.awsCity.bus.emit('citizenRequest', { name: 'Priya', request: r }), {
  cardId: asked.id, serviceId: 's3', question: asked.q, right: 1, answer: asked.a,
  options: ['A queue that holds messages until a worker is ready.', asked.simple ?? asked.a, 'A firewall in front of your web app.'],
});
await wait(600);
if (!(await page.locator('.request-card').count())) errors.push('citizen question: the card did not open');
await audit('citizen question');
await page.locator('.request-option').nth(1).click();
await wait(500);
await shot('50-citizen-question');
const repsAfter = await city((id) => window.awsCity.useCity.getState().progress.cards?.[id]?.reps ?? 0, asked.id);
if (repsAfter <= repsBefore) errors.push('citizen question: answering did not review the card');
await page.keyboard.press('Escape');
await wait(300);
if (await page.locator('.request-card').count()) errors.push('Escape should close the citizen question');

// Past Master, crowns come from knowledge (src/state/mastery.ts): every S3 card known for a month, a passed S3 drawing,
// a finished S3 quest and rounds of fishing make S3 Lake Lv 7, and its card says so.
const s3Puzzle = JSON.parse(fs.readFileSync('shared/puzzles.json', 'utf8')).puzzles.find((z) => z.required.includes('s3'));
const s3Quest = JSON.parse(fs.readFileSync('shared/quests.json', 'utf8')).quests.find((q) => q.serviceIds.includes('s3'));
await city(({ cards, puzzle, quest }) => {
  const p = structuredClone(window.awsCity.useCity.getState().progress);
  p.cities = p.cities ?? {};
  p.cities['us-west-2'] = p.cities['us-west-2'] ?? { landmarks: {} };
  p.cities['us-west-2'].landmarks.s3 = { discovered: true, xp: 400 };
  for (const id of cards) p.cards = { ...p.cards, [id]: { interval: 40, ease: 2.5, due: Date.now() + 40 * 86_400_000, reps: 6 } };
  p.puzzles = { ...p.puzzles, [puzzle]: { best: 90 } };
  p.quests = { ...p.quests, [quest]: { status: 'done', step: 0 } };
  p.games = { ...p.games, fishing: { best: 5, plays: 9 } };
  window.awsCity.loadProgress(p);
}, { cards: s3Cards.map((c) => c.id), puzzle: s3Puzzle.id, quest: s3Quest.id });
await wait(800);
// Tapping a building opens its card in the City tab (no other tab).
await city(() => (window.awsCity.useCity.getState().select('s3'), window.awsCity.bus.emit('select', { id: 's3' })));
await wait(1200);
const crowned = await page.locator('.place-tier').first().textContent().catch(() => '');
console.log('S3 Lake:', crowned?.trim());
if (!/Level 7/.test(crowned ?? '')) errors.push(`crowns: a fully known S3 Lake should be Level 7, the card says "${crowned?.trim()}"`);
await shot('51-crowned');
await city(() => window.awsCity.useCity.getState().select(undefined));

// The first-run tour (skipped under automation; opened here through the store): 3 steps, the last starts the first job.
await city(() => window.awsCity.useCity.getState().setTourOpen(true));
await wait(700);
await shot('27-tour-1');
await page.locator('.tour-card [data-primary]').click();
await wait(400);
await page.locator('.tour-card [data-primary]').click();
await wait(500);
await shot('27b-tour-3');
const lastTourButton = await page.locator('.tour-card [data-primary]').textContent();
if (lastTourButton?.trim() !== 'Start my first job') errors.push(`tour: the last step's button reads "${lastTourButton}"`);
await page.keyboard.press('Escape');
await wait(300);

// ── Simple mode for a seasoned player (src/state/simple.ts): the To-do list, a task ticking off, the day done; then the
// same list in the 400 px side panel. Everything goes back on after, for the checks that follow. ──
const todayIs = (log) =>
  city((l) => {
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    window.awsCity.useCity.setState({ today: { day, ...l } });
  }, log);
const todoNow = (p = page) =>
  p.evaluate(() => ({
    rows: [...document.querySelectorAll('#city-tabpanel .todo-row')].map((r) => `${r.classList.contains('done') ? '✓' : '☐'} ${(r.querySelector('.todo-go') ?? r.querySelector('b'))?.textContent.trim()}`),
    count: document.querySelector('#city-tabpanel .todo-count')?.textContent.trim(),
    hud: document.querySelector('.hud .hud-todo')?.textContent.trim(),
    done: document.querySelector('#city-tabpanel .todo-done')?.textContent.trim(),
    more: Number(document.querySelector('#city-tabpanel .todo-more')?.textContent.match(/\+(\d+)/)?.[1] ?? 0),
    moreDone: Number(document.querySelector('#city-tabpanel .todo-more')?.getAttribute('data-done') ?? 0),
    primary: [...document.querySelectorAll('#city-tabpanel .btn.primary')].map((b) => b.textContent.trim()),
    lists: document.querySelectorAll('#city-tabpanel .home ul, #city-tabpanel .home ol').length,
    extras: [...document.querySelectorAll('.hud .rank-chip, .hud .hud-lights, .ticker-line, #city-tabpanel .shift, #city-tabpanel .more-fold, .supply-drop')].map((e) => e.className),
    tabs: [...document.querySelectorAll('.tabs button')].map((b) => b.title),
  }));
/** "n/m done" and the HUD's "To do n/m" count exactly the list's rows (the ones behind "+N more" too). */
const todoCounts = (t, where) => {
  const ticked = t.rows.filter((r) => r.startsWith('✓')).length + t.moreDone;
  const want = `${ticked}/${t.rows.length + t.more}`;
  if (t.rows.length && t.count !== `${want} done`) errors.push(`simple mode (${where}): the list says "${t.count}" for ${t.rows.length} rows (+${t.more} more), ${ticked} ticked`);
  if (t.rows.length && !t.hud?.endsWith(want)) errors.push(`simple mode (${where}): the HUD says "${t.hud}", the list ${want}`);
  if (t.done && t.rows.some((r) => r.startsWith('☐'))) errors.push(`simple mode (${where}): "Done for today" with a row still open`);
};
await city(() => window.awsCity.useCity.getState().setPref('simple', undefined));
await wait(300);
// The one-time City Coins note hangs under the counter inside the map: never over the tabs, and taps pass through it.
const coinTip = await page.evaluate(() => {
  const tip = document.querySelector('.hud-tip')?.getBoundingClientRect();
  if (!tip) return undefined;
  const hit = (r) => !!r && tip.left < r.right && tip.right > r.left && tip.top < r.bottom && tip.bottom > r.top;
  const stage = document.querySelector('.stage')?.getBoundingClientRect();
  return { overTabs: hit(document.querySelector('.tabs')?.getBoundingClientRect()), inMap: !!stage && tip.left >= stage.left && tip.right <= stage.right && tip.top >= stage.top && tip.bottom <= stage.bottom };
});
console.log('simple: City Coins note', JSON.stringify(coinTip ?? 'not shown'));
if (coinTip?.overTabs) errors.push('simple mode: the City Coins note covers the tab bar');
if (coinTip && !coinTip.inMap) errors.push('simple mode: the City Coins note hangs outside the map');
await clickTab('City');
await page.locator('.back-link').click().catch(() => {});
// A fresh day's goals for this check (the smoke's day settled its goals while the player was brand new).
await city(() => localStorage.removeItem('awscity.todaySet'));
await todayIs({ cards: 2 });
await wait(600);
const simple1 = await todoNow();
console.log('simple home (seasoned):', JSON.stringify(simple1));
if (simple1.rows.length < 3 || simple1.rows.length > 5) errors.push(`simple mode: the To-do list should have 3-5 tasks, got ${simple1.rows.length}`);
if (simple1.primary.length !== 1) errors.push(`simple mode: expected one primary button, got ${simple1.primary.join(' | ')}`);
if (simple1.extras.length) errors.push(`simple mode: hidden extras show: ${simple1.extras.join(', ')}`);
todoCounts(simple1, 'seasoned');
const linkedNow = await city(() => window.awsCity.useCity.getState().account.linked);
// Deploy shows in Simple only when it's needed: here the practice account is linked (its changes are approved there).
if (simple1.tabs.includes('Deploy') !== linkedNow) errors.push(`simple mode: the Deploy tab ${linkedNow ? 'is missing with an account linked' : 'shows with nothing to approve'}`);
await shot('80-simple-home');
await audit('simple home');
// Five cards reviewed: the cards task ticks off and the bar moves.
await todayIs({ cards: 5 });
await wait(600);
const simple2 = await todoNow();
console.log('simple: a task ticked:', JSON.stringify({ rows: simple2.rows, more: simple2.more, moreDone: simple2.moreDone, count: simple2.count, hud: simple2.hud }));
// (A ticked task may fold behind "+N more" when the list is over five rows: the count says it ticked.)
if (!simple2.rows.some((r) => r.startsWith('✓')) && !simple2.moreDone) errors.push('simple mode: reviewing 5 cards did not tick a task off');
todoCounts(simple2, 'a task ticked');
await shot('80b-simple-task-ticked');
// Every goal done: the day's end line.
await todayIs({ cards: 40, puzzles: 5, fixes: 5, games: 5, labs: 5, jobs: 5 });
await wait(600);
const simple3 = await todoNow();
console.log('simple: day done:', JSON.stringify({ rows: simple3.rows, count: simple3.count, hud: simple3.hud, done: simple3.done }));
todoCounts(simple3, 'day done');
if (!/^🎉 Done for today\. Come back tomorrow/.test(simple3.done ?? '')) errors.push(`simple mode: no "Done for today" line (${simple3.done})`);
await shot('80c-simple-day-done');
await todayIs({ cards: 2 });
// A picked building in Simple: no floating "Next: …" line or blueprint on the map (its card says what's next).
await city(() => (window.awsCity.useCity.getState().select('s3'), window.awsCity.bus.emit('select', { id: 's3' })));
await wait(900);
const simpleGhost = await city(() => window.awsCity.ambient.stats());
if (simpleGhost?.ghost || simpleGhost?.ghostSprite) errors.push(`simple mode: the map shows the next-level line "${simpleGhost.ghost}"`);
await city(() => window.awsCity.useCity.getState().select(undefined));
await wait(300);
// The tour's second step points at the To-do list in Simple mode.
await page.locator('.back-link').click().catch(() => {});
await wait(300);
await city(() => window.awsCity.useCity.getState().setTourOpen(true));
await wait(700);
await page.locator('.tour-card [data-primary]').click();
await wait(500);
const tour2 = (await page.locator('.tour-card').textContent()) ?? '';
if (!/Your To-do list/.test(tour2)) errors.push(`simple mode: the tour's second step should show the To-do list, got "${tour2.slice(0, 80)}"`);
await shot('80e-simple-tour');
await page.keyboard.press('Escape');
await wait(300);
const simplePanel = await ctx.newPage();
simplePanel.on('pageerror', (e) => errors.push(`simple panel pageerror: ${e.message}`));
await simplePanel.setViewportSize({ width: 400, height: 820 });
await simplePanel.goto(`chrome-extension://${id}/sidepanel.html`);
await wait(2500);
await simplePanel.evaluate(() => window.awsCity.bus.emit('hour', { hour: 12 }));
await simplePanel.locator('.tabs button[title="City"]').first().click().catch(() => {});
await simplePanel.locator('.back-link').click().catch(() => {});
await wait(500);
const simple4 = await todoNow(simplePanel);
console.log('simple panel:', JSON.stringify({ rows: simple4.rows, hud: simple4.hud, extras: simple4.extras }));
if (!simple4.rows.length) errors.push('simple mode (panel): no To-do list');
todoCounts(simple4, 'panel');
await simplePanel.screenshot({ path: `${out}/80d-simple-panel.png` });
console.log('📸 80d-simple-panel');
await audit('simple panel', simplePanel);
await simplePanel.close();
await city(() => window.awsCity.useCity.getState().setPref('simple', false));
await wait(300);

// side panel layout
const panel = await ctx.newPage();
panel.on('pageerror', (e) => errors.push(`panel pageerror: ${e.message}`));
await panel.setViewportSize({ width: 400, height: 820 });
await panel.goto(`chrome-extension://${id}/sidepanel.html`);
await wait(2500);
await panel.evaluate(() => window.awsCity.bus.emit('hour', { hour: 12 })); // midday, as the tab's shots are
await wait(500);
await panel.screenshot({ path: `${out}/11-sidepanel.png` });
console.log('📸 11-sidepanel');
await audit('side panel', panel);
await panel.locator('.tabs button[title="Learn"]').click();
await panel.locator('.seg button[data-sub="build"]').click();
await wait(400);
await panel.locator('.diagram').scrollIntoViewIfNeeded();
await panel.screenshot({ path: `${out}/15c-architecture-panel.png` });
console.log('📸 15c-architecture-panel');
// A workshop in the 400 px panel: the terminal's tools in sight without scrolling.
await panel.evaluate(() => window.awsCity.useCity.getState().openWorkshop('dynamodb-first-table'));
await wait(600);
await panel.locator('.workshop-steps button').nth(1).click();
await wait(300);
await panel.screenshot({ path: `${out}/35d-workshop-panel.png` });
console.log('📸 35d-workshop-panel');
await toolsInView(panel, 'workshop (panel)');
await panel.evaluate(() => window.awsCity.useCity.getState().openWorkshop(undefined));
await panel.locator('.tabs button[title="City"]').first().click().catch(() => {});
await panel.locator('.back-link').click().catch(() => {});
await wait(300);
await panel.screenshot({ path: `${out}/11b-shift-panel.png` });
console.log('📸 11b-shift-panel');

// Lookout: capture → upload (mock S3) → classify. Without a user gesture Chrome may refuse; either outcome is reported.
await panel.evaluate(() => window.awsCity.snap());
await wait(3500);
const snap = await panel.evaluate(() => {
  const s = window.awsCity.useCity.getState();
  return { snap: s.snap, hasShot: !!s.lastSnapshot, classified: s.lastClassified?.summary, lastLines: s.feed.slice(-3).map((f) => f.text) };
});
console.log('lookout:', JSON.stringify(snap));
await panel.screenshot({ path: `${out}/12-lookout.png` });

// ── City life (plan B3): traffic, boats, sky and the baseline packets, within the per-surface budget (plan B6) ──
{
  const caps = { tab: { citizens: 26, vehicles: 14, boats: 3, packets: 24, clouds: 3 }, panel: { citizens: 14, vehicles: 8, boats: 2, packets: 16, clouds: 2 } };
  const checkLife = (where, st, surface) => {
    if (!st) return errors.push(`${where}: window.awsCity.ambient.stats() returned nothing (is the city scene running?)`);
    const c = caps[surface];
    for (const k of ['citizens', 'vehicles', 'boats', 'packets', 'clouds']) if (st[k] > c[k]) errors.push(`${where}: ${st[k]} ${k} (cap ${c[k]})`);
    if (st.planes > 1 || st.flocks > 1) errors.push(`${where}: ${st.planes} planes, ${st.flocks} flocks (cap 1 each)`);
    if ((st.cargo ?? 0) > 1) errors.push(`${where}: ${st.cargo} cargo jets at the airport (cap 1)`);
    if (st.headlights > 8) errors.push(`${where}: ${st.headlights} headlights (cap 8)`);
    if (st.data > st.caps.data) errors.push(`${where}: ${st.data} data carriers (cap ${st.caps.data})`);
    if (st.tweens >= 80) errors.push(`${where}: ${st.tweens} active tweens (budget < 80): ${JSON.stringify(st.tweenCensus ?? {})}`);
    if (st.children >= 4500) errors.push(`${where}: ${st.children} display objects (budget < 4,500)`);
    if (!st.reducedMotion && st.vehicles < 1) errors.push(`${where}: no traffic on the roads`);
    // Frame rate (game.loop.actualFps). Warns, never fails: headless Chromium paces requestAnimationFrame at 30 Hz (a
    // blank page measures 33 ms a frame), and the smoke runs the tab and the panel at once, so it reads low here.
    if (typeof st.fps === 'number') console.log(`${where}: ${st.fps} fps${st.fps < 45 ? '  ⚠ below 45 (headless caps rAF at 30)' : ''}`);
    // Baked ground and culled props (src/game/GroundBake.ts, src/game/cull.ts): informational, never fails. Only
    // animated water should be left as core ground Images.
    if (typeof st.groundImages === 'number')
      console.log(
        `${where}: ${st.groundImages} core ground Images, ${st.groundTextures} ground textures, ${st.visible}/${st.culled} culled props shown, last bake ${st.bakeMs} ms (all bakes ${st.bakeTotalMs} ms), ${st.children} display objects`,
      );
    else console.log(`${where}: no ground/cull stats (Ambient.stats() doesn't spread cityPerf() from src/game/cull.ts yet)`);
  };
  // Live traffic on (the demo account's request counts drive request cars in from the highway).
  await city(() => window.awsCity.setFlow(true));
  // Nothing selected, so Kai isn't still walking into an HQ picked earlier (the shot is the street).
  await city(() => (window.awsCity.useCity.getState().select(undefined), window.awsCity.useCity.getState().setView({ name: 'city' })));
  await city(() => window.awsCity.bus.emit('hour', { hour: 12 }));
  await wait(6000);
  await shot('30-traffic');
  await audit('city tab');
  // A data carrier's card (the demo's links drive as carriers; opened through the bus: a moving sprite is a poor click).
  await city(() => window.awsCity.bus.emit('carrierTap', { cargo: { kind: 'tanker', label: 'sessions table', route: '→ eu-west-1', cost: 'Data out to eu-west-1: $0.02 per GB' } }));
  await wait(400);
  await shot('32-carrier-card');
  await audit('carrier card');
  await page.keyboard.press('Escape');
  await wait(200);
  const tab = await city(() => ({ ...window.awsCity.ambient?.stats(), tweenCensus: window.awsCity.ambient?.tweens?.() }));
  console.log('city life (tab):', JSON.stringify(tab));
  checkLife('city life (tab)', tab, 'tab');
  await city(() => window.awsCity.bus.emit('hour', { hour: 22 }));
  await wait(2500);
  await shot('31-traffic-night');
  const night = await city(() => window.awsCity.ambient?.stats());
  console.log('city life (night):', JSON.stringify(night));
  checkLife('city life (night)', night, 'tab');
  await city(() => window.awsCity.bus.emit('hour', { hour: 12 }));
  const side = await panel.evaluate(() => window.awsCity.ambient?.stats()).catch(() => undefined);
  console.log('city life (panel):', JSON.stringify(side));
  if (side) checkLife('city life (panel)', side, side.surface);
}

// ── Build mode (src/state/buildmode.ts, src/ui/BuildDrawer.tsx): three decorations placed by clicking, tab and panel ──
{
  const decorCount = (p) => p.evaluate(() => {
    const s = window.awsCity.useCity.getState();
    return s.progress.decor?.[s.cityRegion]?.props.length ?? 0;
  });
  const buildIn = async (p, where, shotName, extra = []) => {
    await p.evaluate(() => {
      const s = window.awsCity.useCity.getState();
      s.select(undefined);
      s.setView({ name: 'city' });
    });
    await wait(2500); // the arrival's zoom-in settles first (the camera must hold still between finding a spot and the click)
    // Decorations cost City Coins (contract v2.14), never stars: a player who played a while has some.
    await p.evaluate(() => window.awsCity.useCity.getState().earnCoins(200, 'smoke'));
    const before = await decorCount(p);
    await p.locator('.build-toggle').click();
    await wait(400);
    if (!(await p.locator('.build-drawer').count())) return errors.push(`${where}: the Build button didn't open the drawer`);
    await audit(`build drawer (${where})`, p);
    // Decorate opens on free ground (never over water) with every tile a tap would build on tinted green.
    const opened = await p.evaluate(() => ({ free: window.awsCity.build?.free?.() ?? 0, cursor: window.awsCity.build?.cursor?.() }));
    console.log(`${where}: Decorate opened with ${opened.free} free tiles tinted green, cursor at ${opened.cursor?.x},${opened.cursor?.y}`);
    if (!opened.free) errors.push(`${where}: Decorate didn't tint the free tiles green`);
    if (shotName === '58-build-mode') {
      await wait(300);
      await p.screenshot({ path: `${out}/58a-decorate-open.png` });
      console.log('📸', '58a-decorate-open');
    }
    let firstTap = true;
    const picks = [
      ['Trees and flowers', 'Cherry blossom', 'deco:cherry'],
      ['Water', 'Fountain', 'deco:fountain'],
      ['Street life', 'Street lamp', 'deco:lamp'],
      ...extra,
    ];
    for (const [cat, name, kind] of picks) {
      await p.locator('.bd-cats button', { hasText: cat }).click();
      await p.locator('.bd-item').filter({ has: p.locator('.bd-name', { hasText: new RegExp(`^${name}$`) }) }).click();
      const [spot] = await p.evaluate((k) => window.awsCity.build?.spots?.(k, 1) ?? [], kind);
      if (!spot) {
        errors.push(`${where}: build mode found nowhere to put ${kind}`);
        continue;
      }
      await p.mouse.move(spot.px, spot.py);
      await p.mouse.click(spot.px, spot.py);
      await wait(400);
      const note = await p.locator('.bd-note').textContent();
      if (!/^Built/.test(note ?? '')) console.log(`${where}: ${kind} at ${spot.x},${spot.y} (${Math.round(spot.px)},${Math.round(spot.py)}): ${note}`);
      // The first tap of all must build: placing isn't pixel-hunting.
      if (firstTap && !/^Built/.test(note ?? '')) errors.push(`${where}: Decorate's first tap didn't build (${note})`);
      if (firstTap && shotName === '58-build-mode') {
        await p.screenshot({ path: `${out}/58c-decorate-first-tap.png` });
        console.log('📸', '58c-decorate-first-tap');
      }
      firstTap = false;
    }
    const after = await decorCount(p);
    console.log(`${where}: build mode placed ${after - before} decorations (${await p.locator('.bd-count').textContent()}), note: ${await p.locator('.bd-note').textContent()}`);
    if (after - before !== picks.length) errors.push(`${where}: build mode should have placed ${picks.length} decorations, placed ${after - before}`);
    // The shot frames the last one placed (world px = the tile's centre, a little low so it sits above the drawer)…
    const last = await p.evaluate(() => {
      const s = window.awsCity.useCity.getState();
      return s.progress.decor?.[s.cityRegion]?.props.at(-1);
    });
    if (last) await p.evaluate(({ x, y }) => window.awsCity.bus.emit('panTo', { x: (x - y) * 16, y: (x + y) * 8 + 50 }), last);
    await wait(300);
    // …with the ghost over the next free tile.
    await p.locator('.bd-cats button', { hasText: 'Trees and flowers' }).click();
    await p.locator('.bd-item').filter({ has: p.locator('.bd-name', { hasText: /^Oak tree$/ }) }).click();
    const [next] = await p.evaluate(() => window.awsCity.build?.spots?.('deco:oak', 1) ?? []);
    if (next) await p.mouse.move(next.px, next.py);
    await wait(300);
    await p.screenshot({ path: `${out}/${shotName}.png` });
    console.log('📸', shotName);
    if (extra.length) {
      // The lamp, the string lights and the sign's spotlights after dark.
      await p.evaluate(() => window.awsCity.bus.emit('hour', { hour: 22 }));
      await wait(1500);
      await p.screenshot({ path: `${out}/${shotName}-night.png` });
      console.log('📸', `${shotName}-night`);
      await p.evaluate(() => window.awsCity.bus.emit('hour', { hour: 12 }));
    }
    const drawn = await p.evaluate(() => window.awsCity.build?.count?.() ?? -1);
    if (drawn < after) errors.push(`${where}: ${after} decorations saved but ${drawn} drawn`);
    const st = await p.evaluate(() => window.awsCity.ambient?.stats());
    if (st && st.children >= 4500) errors.push(`${where}: ${st.children} display objects with decorations (budget < 4,500)`);
    // Esc leaves (the canvas has the keys once it was clicked); Done is the fallback.
    await p.keyboard.press('Escape');
    await wait(200);
    if (await p.locator('.build-drawer').count()) {
      errors.push(`${where}: Esc didn't leave build mode`);
      await p.locator('.build-drawer button', { hasText: 'Done' }).click();
    }
  };
  await buildIn(page, 'build mode (tab)', '58-build-mode', [['Signs and banners', 'City name sign', 'deco:citysign'], ['Street life', 'String lights', 'deco:lights']]);
  await buildIn(panel, 'build mode (panel)', '58b-build-mode-panel');
}

// ── Real street maps (Phase 4): three Regions baked from OpenStreetMap, day and night, tab and panel ──
{
  const baked = fs.existsSync('shared/city-maps') ? fs.readdirSync('shared/city-maps').filter((f) => /^[a-z]+(-[a-z]+)+-\d\.json$/.test(f)).map((f) => f.slice(0, -5)) : [];
  const picks = ['eu-west-2', 'ap-northeast-1', 'us-east-1', 'eu-west-3', 'ap-southeast-2'].filter((c) => baked.includes(c)).concat(baked).filter((c, i, a) => a.indexOf(c) === i).slice(0, 3);
  console.log(`street maps: ${baked.length} Regions baked; checking ${picks.join(', ') || 'none'}`);
  const lifeCaps = { citizens: 26, vehicles: 14, boats: 3, packets: 24, clouds: 3 };
  for (const [i, code] of picks.entries()) {
    // Each switch restarts the scene on another plan (needsRestart): the second and third are the "switch twice".
    await city((c) => (window.awsCity.useCity.getState().select(undefined), window.awsCity.useCity.getState().enterRegion(c)), code);
    await city(() => window.awsCity.bus.emit('hour', { hour: 12 }));
    await wait(4000);
    const st = await city(() => ({ region: window.awsCity.useCity.getState().cityRegion, view: window.awsCity.useCity.getState().view.name, life: window.awsCity.ambient.stats() }));
    if (st.region !== code || st.view !== 'city') errors.push(`street map ${code}: not in its city (${st.region}, ${st.view})`);
    if (!(await page.locator('.map-credit', { hasText: 'OpenStreetMap contributors' }).count())) errors.push(`street map ${code}: no "© OpenStreetMap contributors" credit`);
    if (!(await page.locator('.minimap canvas').count())) errors.push(`street map ${code}: no minimap in the tab`);
    for (const k of Object.keys(lifeCaps)) if (st.life[k] > lifeCaps[k]) errors.push(`street map ${code}: ${st.life[k]} ${k} (cap ${lifeCaps[k]})`);
    if (st.life.children >= 4500) errors.push(`street map ${code}: ${st.life.children} display objects (budget < 4,500)`);
    // Phase 5 budgets (src/game/InfillLayer.ts): about 3,600 display objects, at most 1,800 drawn at zoom 1 in the tab.
    if (st.life.children > 3600) console.log(`street map ${code}: ⚠ ${st.life.children} display objects (aim ≤ 3,600)`);
    if (st.life.zoom === 1 && st.life.shown > 1800) errors.push(`street map ${code}: ${st.life.shown} display objects drawn at zoom 1 (budget ≤ 1,800)`);
    if (!st.life.segments) errors.push(`street map ${code}: no infill segments drawn`);
    if (st.life.infillFallback) console.log(`street map ${code}: ⚠ ${st.life.infillFallback} infill buildings drawn one by one (no room on the pages)`);
    console.log(
      `street map ${code}: ${st.life.children} display objects (${st.life.shown} drawn at zoom ${st.life.zoom}), ${st.life.fps} fps, ${st.life.groundTextures} ground textures, ${st.life.visible}/${st.life.culled} culled props shown; infill ${st.life.segments} segments, ${st.life.infillImages} images, ${st.life.streetImages} street images, ${st.life.pages} page(s), ${((st.life.packedPx ?? 0) / 1e6).toFixed(2)}M px packed, composed in ${st.life.composeMs} ms`,
    );
    await shot(`60-street-map-${i}-${code}-day`);
    if (i === 0) await audit(`street map ${code}`);
    await city(() => window.awsCity.bus.emit('hour', { hour: 22 }));
    await wait(2000);
    await shot(`60-street-map-${i}-${code}-night`);
    await city(() => window.awsCity.bus.emit('hour', { hour: 12 }));
    // A lost WebGL context: the infill's canvas pages re-upload themselves and the ground re-bakes (no page errors).
    if (i === 0) {
      const lost = await city(async () => {
        const gl = document.querySelector('canvas')?.getContext('webgl2') ?? document.querySelector('canvas')?.getContext('webgl');
        const ext = gl?.getExtension('WEBGL_lose_context');
        if (!ext) return 'no WEBGL_lose_context';
        ext.loseContext();
        await new Promise((r) => setTimeout(r, 500));
        ext.restoreContext();
        await new Promise((r) => setTimeout(r, 1500));
        return gl.isContextLost() ? 'still lost' : 'restored';
      });
      console.log(`street map ${code}: WebGL context ${lost}`);
      if (lost === 'still lost') errors.push(`street map ${code}: the WebGL context did not come back`);
      await shot(`60-street-map-${i}-${code}-restored`);
    }
    // The minimap moves the camera; M hides it and shows it again.
    if (i === 0) {
      const box = await page.locator('.minimap canvas').boundingBox();
      if (box) await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
      await wait(400);
      await shot(`61-street-map-minimap-pan`);
      await page.mouse.click(700, 400);
      await page.keyboard.press('m');
      await wait(200);
      if (await page.locator('.minimap canvas').count()) errors.push('M should hide the minimap');
      await page.keyboard.press('m');
      await wait(200);
      if (!(await page.locator('.minimap canvas').count())) errors.push('M should show the minimap again');
    }
    await panel.evaluate((c) => (window.awsCity.useCity.getState().enterRegion(c), window.awsCity.bus.emit('hour', { hour: 12 })), code).catch(() => {});
    await wait(3000);
    await panel.screenshot({ path: `${out}/62-street-map-${i}-${code}-panel.png` });
    console.log(`📸 62-street-map-${i}-${code}-panel`);
    // The panel at night: the infill's windows glow, cut where nearer buildings stand (src/game/InfillLayer.ts).
    await panel.evaluate(() => window.awsCity.bus.emit('hour', { hour: 22 })).catch(() => {});
    await wait(2000);
    await panel.screenshot({ path: `${out}/62-street-map-${i}-${code}-panel-night.png` });
    console.log(`📸 62-street-map-${i}-${code}-panel-night`);
    await panel.evaluate(() => window.awsCity.bus.emit('hour', { hour: 12 })).catch(() => {});
    const ps = await panel.evaluate(() => window.awsCity.ambient.stats()).catch(() => undefined);
    if (ps && ps.children >= 4500) errors.push(`street map ${code} (panel): ${ps.children} display objects`);
    if (i === 0) await audit(`street map ${code} (panel)`, panel);
  }
  // ?map=legacy keeps the 3×3 city (and no map credit).
  if (picks[0]) {
    const legacy = await ctx.newPage();
    legacy.on('pageerror', (e) => errors.push(`legacy pageerror: ${e.message}`));
    await legacy.goto(`chrome-extension://${id}/city.html?map=legacy`);
    await wait(2500);
    await legacy.evaluate((c) => window.awsCity.useCity.getState().enterRegion(c), picks[0]);
    await wait(3000);
    if (await legacy.locator('.map-credit').count()) errors.push('?map=legacy still shows the OpenStreetMap credit');
    await legacy.screenshot({ path: `${out}/63-map-legacy.png` });
    console.log('📸 63-map-legacy');
    await legacy.close();
  }
  await city(() => window.awsCity.useCity.getState().enterRegion('us-west-2'));
  await wait(1500);
}

// ── City Clients (Phase D): a business's task list, one job of every kind (Go walks Kai to its station, the job
// opens when he arrives), a level done (its card, the site growing), axe on the panel and a station panel ──
{
  const clientsData = JSON.parse(fs.readFileSync('shared/clients.json', 'utf8')).businesses;
  const serviceIds = JSON.parse(fs.readFileSync('shared/world.json', 'utf8')).services.map((x) => x.id);
  const bank = clientsData.find((b) => b.id === 'bank');
  // Montreal's real streets have neighbourhood lots: the businesses stand in the city and Kai walks to them.
  const code = 'ca-central-1';
  await city((c) => (window.awsCity.useCity.getState().select(undefined), window.awsCity.useCity.getState().enterRegion(c)), code);
  await city(() => window.awsCity.bus.emit('hour', { hour: 12 }));
  await city(
    ({ c, ids }) => {
      const p = structuredClone(window.awsCity.useCity.getState().progress);
      const lm = Object.fromEntries(ids.map((id) => [id, { discovered: true, xp: p.cities?.[c]?.landmarks?.[id]?.xp ?? 1 }]));
      p.cities = { ...p.cities, [c]: { landmarks: lm } };
      for (const id of ids) p.landmarks[id] = p.landmarks[id] ?? { discovered: true, xp: 1 };
      p.clients = {};
      p.updatedAt = new Date().toISOString();
      window.awsCity.loadProgress(p);
    },
    { c: code, ids: serviceIds },
  );
  await wait(3500);
  await city(() => window.awsCity.useCity.getState().openClients(''));
  await wait(400);
  await shot('70-clients-list');
  await page.locator('.clients-row', { hasText: bank.name }).click();
  await wait(300);
  if ((await page.locator('.jobs .job').count()) !== bank.levels[0].tasks.length) errors.push('clients: the bank should list its level 1 jobs');
  await shot('71-clients-bank');
  await audit('clients panel');
  await city(() => window.awsCity.useCity.getState().openClients(undefined));
  await city(() => window.awsCity.bus.emit('flyTo', { id: 'client:bank' }));
  await wait(1200);
  const markers = await city(() => new Promise((r) => window.awsCity.bus.emit('minimapState', { reply: (st) => r(st.stations?.length ?? 0) })));
  if (!markers) errors.push('clients: no station markers for the bank');
  await shot('72-client-bank-before');

  const openJob = async (t) => {
    await city((id) => window.awsCity.useCity.getState().openClients(id), 'bank');
    await wait(250);
    await page.getByRole('button', { name: `Go to the ${t.station} for “${t.title}”` }).click();
    const at = Date.now();
    while (Date.now() - at < 25_000 && (await city(() => window.awsCity.useCity.getState().clientTaskOpen)) !== t.id) await wait(250);
    if ((await city(() => window.awsCity.useCity.getState().clientTaskOpen)) !== t.id) {
      errors.push(`clients: "${t.title}" did not open when Kai reached the ${t.station}`);
      await city((id) => window.awsCity.useCity.getState().openClientTask(id), t.id);
    }
    await wait(300);
  };
  const jobDone = async (t) => {
    const at = Date.now();
    while (Date.now() - at < 5000 && !(await city((id) => (window.awsCity.useCity.getState().progress.clients?.bank?.done ?? []).includes(id), t.id))) await wait(200);
    if (!(await city((id) => (window.awsCity.useCity.getState().progress.clients?.bank?.done ?? []).includes(id), t.id))) errors.push(`clients: "${t.title}" (${t.type}) was not done`);
  };
  const cont = async () => {
    const btn = page.locator('.job-done .btn.primary');
    if (await btn.count()) await btn.click();
    await wait(300);
  };
  const runJob = async (t, shotName) => {
    await openJob(t);
    if (t.type === 'choose') {
      const right = t.choose.options.find((o) => o.correct);
      await page.locator('.job-card .choice-option', { hasText: right.text.slice(0, 30) }).click();
    } else if (t.type === 'run') {
      const term = page.locator('.job-card .terminal-input textarea');
      await term.fill(t.run.cli.replace(/<([a-z0-9-]+)>/g, 'riverside'));
      await term.press('Enter');
    } else if (t.type === 'fix') {
      for (const st of t.fix.settings) await page.getByRole('group', { name: st.label }).locator('button').nth(st.switchIt ? 0 : 1).click();
      await page.getByRole('button', { name: 'Check my settings' }).click();
    } else if (t.type === 'station' && t.panel.kind === 'sort') {
      for (let i = 0; i < t.panel.items.length; i++) {
        const text = (await page.locator('.job-card .st-card').textContent().catch(() => '')) ?? '';
        const item = t.panel.items.find((x) => text.includes(x.text));
        if (!item) break;
        if (i === 1) {
          await shot('73-job-station');
          await audit('station panel');
        }
        const bin = t.panel.bins.find((b) => b.id === item.bin);
        await page.locator('.job-card .st-bin', { hasText: bin.label }).click();
        await wait(150);
      }
    } else if (t.type === 'explain') {
      await page.locator('.job-card .explain-back textarea').fill('A standby copy in another Availability Zone keeps the ledger running when one zone fails, so payments keep working.');
      await page.locator('.job-card .explain-back button[type="submit"]').click();
      await wait(2000);
    } else if (t.type === 'wire') {
      const hintBtn = page.locator('.job-card .arch-row .btn');
      for (let i = 0; i < 12 && (await hintBtn.isEnabled()); i++) {
        await hintBtn.click();
        if (!(await page.locator('.job-card .tray .card.hinted').count())) await hintBtn.click();
        await page.locator('.job-card .tray .card.hinted').click();
        await page.locator('.job-card .slot.hinted').click();
      }
      await page.locator('.job-card').getByText('Check design').click();
    } else if (t.type === 'click') {
      // The demo's Copilot works in the practice console (nothing there touches AWS); its run finishing does the job.
      await page.getByRole('button', { name: /Do it with the Copilot/ }).click();
      const at = Date.now();
      // A step that bills (Create database) is handed to the player on the practice page: play the player and press it.
      const CONFIRM = { rds: 'Create database', ec2: 'Launch instance', iam: 'Create role' }[t.click.flow];
      let confirmed = false;
      while (Date.now() - at < 60_000 && !(await city((id) => (window.awsCity.useCity.getState().progress.clients?.bank?.done ?? []).includes(id), t.id))) {
        const tab = ctx.pages().find((p) => p.url().startsWith(`chrome-extension://${id}/practice`));
        if (tab && CONFIRM && !confirmed && (await tab.locator('[data-awscity-overlay]').getByText('needs your OK').count().catch(() => 0))) {
          await tab.getByRole('button', { name: CONFIRM, exact: true }).click().catch(() => {});
          confirmed = true;
        }
        await wait(500);
      }
      await page.bringToFront();
      if (!(await city((id) => (window.awsCity.useCity.getState().progress.clients?.bank?.done ?? []).includes(id), t.id))) {
        console.log('clients: ⚠ the practice Copilot did not finish the click job in 60 s; doing it through the store');
        errors.push(`clients: the Copilot did not finish "${t.title}"`);
        await city((id) => window.awsCity.useCity.getState().clientTaskDone(id), t.id);
      }
    }
    await jobDone(t);
    if (shotName) await shot(shotName);
  };
  const l1 = bank.levels[0].tasks;
  const order = [...l1.filter((t) => t.type !== 'click'), ...l1.filter((t) => t.type === 'click')];
  for (const [i, t] of order.entries()) {
    await runJob(t, i === 0 ? '73a-job-choose' : undefined);
    if (i < order.length - 1) await cont();
  }
  // The level's last job: its card holds the floor, then the bank grows.
  await wait(1500);
  if (!(await page.locator('.client-done').count())) errors.push('clients: no level-done card after the last job');
  await shot('74-client-level-done');
  await audit('client level done');
  await page.locator('.client-done .btn.primary').click();
  await wait(1800);
  const lvl = await city(() => window.awsCity.useCity.getState().progress.clients?.bank?.level);
  if (lvl !== 1) errors.push(`clients: the bank should be level 1 (is ${lvl})`);
  await shot('75-client-bank-after');
  // Level 2's wire and explain jobs: the last two runner kinds.
  for (const t of bank.levels[1].tasks.filter((x) => x.type === 'wire' || x.type === 'explain')) {
    await runJob(t, `76-job-${t.type}`);
    await cont();
  }
  await city(() => (window.awsCity.useCity.getState().openClients(undefined), window.awsCity.useCity.getState().openClientTask(undefined)));
  await panel.evaluate((c) => (window.awsCity.useCity.getState().enterRegion(c), window.awsCity.useCity.getState().openClients('bank')), code).catch(() => {});
  await wait(2500);
  await panel.screenshot({ path: `${out}/77-clients-panel.png` });
  console.log('📸 77-clients-panel');
  await audit('clients (panel)', panel);
  await panel.evaluate(() => window.awsCity.useCity.getState().openClients(undefined)).catch(() => {});
  await city(() => window.awsCity.useCity.getState().enterRegion('us-west-2'));
  await wait(1500);
}

// ── A living city (round 3, Step 3): a combo appearing, learning couriers at rush hour, a next-level ghost, pocket
// parks, a business inside us-west-2's streets, and a winter city (?season=winter) ──
{
  const life = () => city(() => window.awsCity.ambient.stats());
  // One wheel step in or out over the middle of the map (whole-number zooms).
  const zoom = async (dir) => {
    await page.mouse.move(500, 460);
    await page.mouse.wheel(0, dir > 0 ? -240 : 240);
    await wait(700);
  };
  // Progress only merges (loadProgress never forgets a building), so the combo is found in a city the smoke hasn't
  // built yet: Stockholm with Lambda put up, then API Gateway beside it raises the event plaza.
  const putUp = (c, ids) =>
    city(
      ({ c, ids }) => {
        const p = structuredClone(window.awsCity.useCity.getState().progress);
        const lm = { ...p.cities?.[c]?.landmarks, ...Object.fromEntries(ids.map((id) => [id, { discovered: true, xp: 12 }])) };
        p.cities = { ...p.cities, [c]: { ...p.cities?.[c], landmarks: lm } };
        p.updatedAt = new Date().toISOString();
        window.awsCity.loadProgress(p);
      },
      { c, ids },
    );
  const fresh = 'eu-north-1';
  await city((c) => (window.awsCity.useCity.getState().select(undefined), window.awsCity.useCity.getState().enterRegion(c)), fresh);
  await city(() => window.awsCity.bus.emit('hour', { hour: 12 }));
  await putUp(fresh, ['lambda']);
  await wait(3500);
  const before = await life();
  if (before?.combos?.some((c) => c.id === 'event-plaza')) errors.push('combos: the event plaza stands before API Gateway is put up');
  await city(() => window.awsCity.bus.emit('flyTo', { id: 'lambda' }));
  await wait(1200);
  await putUp(fresh, ['apigateway']);
  await wait(700);
  const after = await life();
  const plaza = after?.combos?.find((c) => c.id === 'event-plaza');
  console.log(`living city: ${after?.combos?.length ?? 0} combo props in ${fresh} (${(after?.combos ?? []).map((c) => c.id).join(', ')}), season ${after?.season}`);
  if (!plaza) errors.push('combos: putting up API Gateway beside Lambda should raise the event plaza');
  else {
    await city(({ x, y }) => window.awsCity.bus.emit('panTo', { x, y: y - 20 }), plaza);
    await wait(500);
  }
  await shot('80-combo-found');
  const codex = await city(() => window.awsCity.useCity.getState().progress.codex?.combos?.['event-plaza']);
  if (!codex) console.log('combos: ⚠ the Codex has no event plaza (S2’s discoverCombo not in the store yet?)');

  // us-west-2, every building put up (the clients' section did): learning traffic, the ghost, the businesses.
  const code = 'us-west-2';
  await city((c) => (window.awsCity.useCity.getState().select(undefined), window.awsCity.useCity.getState().enterRegion(c)), code);
  await city(() => window.awsCity.bus.emit('hour', { hour: 12 }));
  await putUp(code, JSON.parse(fs.readFileSync('shared/world.json', 'utf8')).services.map((x) => x.id));
  await wait(3500);

  // Rush hour (8–9 local): more learning couriers, and Auto Scaling adds helpers at EC2 and Lambda.
  await city(() => window.awsCity.useCity.getState().select(undefined));
  await city(() => window.awsCity.bus.emit('flyTo', { id: 'lambda' }));
  await city(() => window.awsCity.bus.emit('hour', { hour: 8.2 }));
  await wait(9000);
  const rush = await life();
  console.log(`living city: rush ${rush?.rush}, ${rush?.learning}/${rush?.learnCap} learning couriers, ${rush?.surged} Auto Scaling helpers, ${rush?.vehicles} vehicles, ${rush?.citizens} citizens`);
  if (!rush?.rush) errors.push('rush hour: hour 8 should be rush hour');
  if (!rush?.learning) errors.push('rush hour: no learning couriers on the roads');
  if (!rush?.rushSignal) errors.push('rush hour: the scene did not raise the rush-hour signal for the HUD chip (src/game/rush.ts)');
  const chip = await page.getByText(/Rush hour/i).first().isVisible().catch(() => false);
  console.log(`living city: rush-hour chip ${chip ? 'shown' : 'missing'}`);
  if (!chip) errors.push('rush hour: no "Rush hour" chip on the HUD');
  if ((rush?.learning ?? 0) > (rush?.learnCap ?? 0)) errors.push(`rush hour: ${rush.learning} learning couriers (cap ${rush.learnCap})`);
  if ((rush?.vehicles ?? 0) > 14 || (rush?.citizens ?? 0) > 26) errors.push(`rush hour: ${rush.vehicles} vehicles / ${rush.citizens} citizens over the caps`);
  // Close in on a courier: its dashed trail and the helpers.
  const courier = rush?.learners?.[0];
  if (courier) {
    console.log(`living city: a courier on "${courier.title}"`);
    await city(({ x, y }) => window.awsCity.bus.emit('panTo', { x, y }), courier);
    await wait(300);
    await zoom(1);
  }
  await shot('81-couriers-rush-hour');
  if (courier) await zoom(-1);
  await city(() => window.awsCity.bus.emit('hour', { hour: 12 }));
  await wait(2500);
  const calm = await life();
  if ((calm?.surged ?? 0) > 0) errors.push(`rush hour: ${calm.surged} Auto Scaling helpers still out after it ended`);

  // A building picked: the see-through next level over it and its line.
  await city(() => (window.awsCity.useCity.getState().openClients(undefined), window.awsCity.useCity.getState().select('ec2'), window.awsCity.bus.emit('select', { id: 'ec2' })));
  await wait(1800);
  const ghost = (await life())?.ghost;
  console.log(`living city: next-level line "${ghost}"`);
  if (!ghost || !/^Next: /.test(ghost)) errors.push('next-level preview: no ghost line over the picked building');
  const gs = await life();
  console.log(`living city: next-level ghost sprite ${gs?.ghostSprite ? `shown ${gs.ghostBox?.w}×${gs.ghostBox?.h} px` : 'missing'}`);
  if (!gs?.ghostSprite || (gs.ghostBox?.w ?? 0) < 16) errors.push('next-level preview: the ghost building is not visible');
  await zoom(1);
  await shot('82-next-level-ghost');
  await zoom(-1);
  await audit('next-level preview');
  await page.keyboard.press('Escape');
  await city(() => window.awsCity.useCity.getState().select(undefined));
  await wait(400);

  // A business on us-west-2's own streets (no longer out on the ring).
  await city(() => window.awsCity.bus.emit('flyTo', { id: 'client:school' }));
  await wait(1500);
  await zoom(1);
  await shot('84-client-inside-us-west-2');
  await zoom(-1);
  await city(() => window.awsCity.bus.emit('flyTo', { id: 'client:hospital' }));
  await wait(1500);
  // Pocket parks round the management district's open lots: each lot takes the next centrepiece and corner piece.
  await shot('83-park-variety');
  await zoom(1);
  await shot('84b-client-inside-us-west-2');
  await zoom(-1);

  // A wave 2 business (the port): its jobs in the panel, then its empty site with the "coming soon" sign.
  const allClients = JSON.parse(fs.readFileSync('shared/clients.json', 'utf8')).businesses;
  const port = allClients.find((b) => b.id === 'port');
  if (!port) errors.push('clients: no port in shared/clients.json (wave 2)');
  else {
    await city(() => window.awsCity.useCity.getState().openClients(''));
    await wait(300);
    if ((await page.locator('.clients-row').count()) !== allClients.length) errors.push(`clients: the list should show all ${allClients.length} businesses`);
    await page.locator('.clients-row', { hasText: port.name }).click();
    await wait(300);
    if ((await page.locator('.jobs .job').count()) !== port.levels[0].tasks.length) errors.push('clients: the port should list its level 1 jobs');
    await shot('85-clients-port');
    await audit('clients panel: port');
    await city(() => window.awsCity.useCity.getState().openClients(undefined));
    await city(() => window.awsCity.bus.emit('flyTo', { id: 'client:port' }));
    await wait(1500);
    await zoom(1);
    await shot('85b-client-port-site');
    await zoom(-1);
  }

  // A winter city: ?season=winter swaps the trees and grass, tints the ground and puts out snowmen.
  const winter = await ctx.newPage();
  winter.on('pageerror', (e) => errors.push(`winter pageerror: ${e.message}`));
  await winter.goto(`chrome-extension://${id}/city.html?season=winter`);
  await wait(2500);
  await winter.evaluate(() => (window.awsCity.useCity.getState().select(undefined), window.awsCity.useCity.getState().enterRegion('eu-west-1'), window.awsCity.bus.emit('hour', { hour: 12 })));
  await wait(4000);
  const ws = await winter.evaluate(() => window.awsCity.ambient.stats());
  if (ws?.season !== 'winter') errors.push(`?season=winter drew ${ws?.season}`);
  await winter.screenshot({ path: `${out}/85-winter-city.png` });
  console.log('📸 85-winter-city');
  await winter.close();
  await city(() => window.awsCity.useCity.getState().enterRegion('us-west-2'));
  await wait(1500);
}

console.log(errors.length ? `\n${errors.length} errors:\n` + errors.join('\n') : '\nno page errors');
await ctx.close();
