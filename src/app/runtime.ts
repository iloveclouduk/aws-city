// Wires backend ⇄ store ⇄ bus ⇄ chrome APIs. UI components call the commands exported here;
// they never touch the backend or chrome.* directly.

import { browser } from 'wxt/browser';
import { createBackend, type AgentBackend } from '@/backend';
import type { ConsoleStepEvent, PageSnapshot } from '@/backend/contract';
import { agentName, emptyProgress } from '@/state/store';
import { uid } from '@/backend/AgentBackend';
import type { Progress } from '@/backend/contract';
import { captureVisibleTab, hasCapturePermission, requestCapturePermission } from '@/capture/screenshot';
import { bus } from '@/state/bus';
import { mergeProgress, sameProgress } from '@/state/progress';
import { CITIZEN_XP, fixGate } from '@/state/citizens';
import { knownAgents, useCity, type CityState } from '@/state/store';
import { ladder, questsDone } from '@/state/ladder';
import { shows } from '@/state/simple';
import { consoleUrl, DEFAULT_CONSOLE_SERVICE, matchText, matchUrl } from '@/world/taxonomy';
import { isPracticeService, isPracticeUrl, PRACTICE_PATH, practiceRoute, practiceUrl } from '@/console/practice';
import type { CopilotMessage } from '@/console/agent';
import { isReadingUrl } from '@/world/reading';
import { isWorkshopUrl } from '@/world/workshops';
import { SURFACE, SURFACE_NAME, type Surface } from '@/app/surface';
import { badgeById, newBadges } from '@/state/badges';
import { cityPoints, cityRank } from '@/state/rank';
import { isoWeekUtc } from '@/state/events';
import { DEMO_OWNER, isAccountIdOrRoleArn, isDemo, isTourDone } from '@/ui/logic';
import { FOCUS_STORAGE_KEY, PROGRESS_STORAGE_KEY, SETTINGS_STORAGE_KEY, type PageFocus, type RuntimeMessage } from '@/state/types';

export type Layout = 'panel' | 'full';

let backend: AgentBackend | undefined;
let layout: Layout = 'panel';
let started = false;
/** Playing the offline demo in a build with sign-in (the `awscity.demo` pref): its saves are tagged DEMO_OWNER. */
let demo = false;

const store = () => useCity.getState();

export function startRuntime(l: Layout) {
  if (started) return;
  started = true;
  layout = l;

  backend = createBackend({ knownAgents: () => knownAgents(store().progress) });
  const kind = backend.kind;
  demo = kind === 'mock' && isDemo();
  store().setBackend(kind, 'connecting', backend.deployMode ?? 'templates');
  let hadSession = false;
  backend.onStatus((s) => {
    const prev = store().backendStatus;
    // A new connection hears the bill switch only after it has read the account's copy (syncBill).
    if (s !== 'connected' || prev !== 'connected') billReady = false;
    store().setBackend(kind, s);
    if (s === 'connected') {
      // Signing in after the panel opened (or reconnecting) must merge the server's copy before ours is pushed.
      if (prev !== 'connected') void pullProgress();
      hadSession = true;
    } else if (s === 'signed-out' && hadSession) {
      // Signed out here, in the other surface, or the session died: the next player must not see this one's city.
      hadSession = false;
      void endSession();
    }
  });
  backend.onEvent((e) => {
    if (e.type === 'error' && e.code === 'mfa_required') mfaRefused = refusedBy(e, stepUps);
    store().applyServerEvent(e);
    bus.emit('server', e);
    if (e.type === 'console.step') void relayConsoleStep(e);
  });
  browser.runtime.onMessage.addListener((msg: { type?: string }) => {
    if (msg?.type === 'copilot.stopRequested') stopConsoleCopilot('You stopped the Copilot.');
  });
  backend.connect();
  syncBill();
  syncFlow();
  watchCare();
  watchBadges();
  watchSocial();

  void initProgress();
  void initFocus();
  void initSettings();

  if (isTourDone()) return; // the welcome lines are for first-timers only
  const where = (backend as { hosted?: boolean }).hosted ? 'the AWS City server' : 'your local AWS server';
  store().log({ kind: 'system', text: kind === 'mock' ? 'Welcome to AWS City! This is the offline demo: nothing real is created.' : `Welcome to AWS City! Your agents run on ${where}.` });
  store().log({ kind: 'message', from: 'concierge', to: 'user', text: 'Open any AWS Console page and I will build that part of town. Or just ask me to do something!' });
}

// ── Progress: local cache (chrome.storage.local) + backend (source of truth when available) ──

/** Adds another copy's progress to ours; true if that changed anything. */
const absorb = (other: Progress) => {
  const mine = store().progress;
  if (sameProgress(mine, other)) return false;
  const merged = mergeProgress(mine, other);
  // If ours added something the other copy lacked, the merge is new: date it now so the server (newest wins) keeps it.
  store().loadProgress(sameProgress(other, mine) ? merged : { ...merged, updatedAt: new Date().toISOString() });
  return true;
};

/**
 * Unsynced progress from a session that ended without the player signing out (the sign-in expired or was revoked),
 * tagged with whose it was. It's absorbed only when that same player signs back in on this device.
 */
export const PARKED_PROGRESS_KEY = 'progress.parked';
type ParkedProgress = { player: string; progress: Progress };
/**
 * Whose saved `progress` that is, on a backend with sign-in: the player id, or '' if it was earned while no one's copy
 * had been read (it merges into whoever signs in, as signed-out play always has). A copy with no owner saved beside it
 * predates the tag, so it's treated as unconfirmed.
 */
export const PROGRESS_OWNER_KEY = 'progress.owner';
/** A backend with sign-in has players (the mock and the local server don't). */
const hasPlayers = () => typeof backend?.playerId === 'function';
/**
 * The owner tag of the copy in storage, as this surface last saw it (from the other surface, via storage.onChanged).
 * A surface that hasn't read the account's copy yet keeps that tag when it saves, so absorbing the other surface's
 * progress never strips the owner (which would hand it to whoever signs in next). Cleared when a session ends.
 */
let storedOwner = '';
/** The owner tag on the copy in storage right now, whoever wrote it (DEMO_OWNER marks the demo's). */
let storedTag: string | undefined;
/** The player this device's progress now belongs to: known once their copy has been read this session, else the stored tag. */
const owner = () => (pulled ? (backend?.playerId?.() ?? '') : storedOwner);

/** Keeps a copy for `player` only (merged with one already parked for them; a different player's is replaced). */
async function park(player: string, progress: Progress) {
  const parked = (await browser.storage.local.get(PARKED_PROGRESS_KEY))[PARKED_PROGRESS_KEY] as ParkedProgress | undefined;
  const merged = parked?.player === player && parked.progress?.version === 1 ? mergeProgress(parked.progress, progress) : progress;
  await browser.storage.local.set({ [PARKED_PROGRESS_KEY]: { player, progress: merged } satisfies ParkedProgress });
}

/** Saves this device's copy (with its owner, on a backend with sign-in). */
function saveLocal(progress: Progress) {
  const items: Record<string, unknown> = { [PROGRESS_STORAGE_KEY]: progress };
  if (hasPlayers()) items[PROGRESS_OWNER_KEY] = owner();
  else if (demo) items[PROGRESS_OWNER_KEY] = DEMO_OWNER;
  return browser.storage.local.set(items);
}

/**
 * True once this session has read the backend's copy. Until then nothing is pushed: the server keeps the newest copy,
 * so a fresh device's empty (or older) progress must never overwrite the account's before the two are merged.
 */
let pulled = false;
/** Bumped by endSession, so a pull that started for the previous player is ignored. */
let session = 0;
/** Set by an explicit sign-out (or account deletion) here; any other end of the session is involuntary. */
let signingOut = false;

async function initProgress() {
  const saved = await browser.storage.local.get([PROGRESS_STORAGE_KEY, PROGRESS_OWNER_KEY]);
  const local = saved[PROGRESS_STORAGE_KEY] as Progress | undefined;
  const localOwner = saved[PROGRESS_OWNER_KEY] as string | undefined;
  storedTag = localOwner;
  if (local?.version === 1) {
    // Nobody is confirmed signed in yet (the token may be dead): a player's copy waits for that same player
    // (restoreParked, after their copy is read), and a copy of unknown owner is never handed to whoever signs in next.
    // The demo's copy is no player's (dropped outside the demo), and a player's copy is parked while the demo plays.
    if (localOwner === DEMO_OWNER ? !demo : (hasPlayers() && localOwner !== '') || (demo && !!localOwner)) {
      if (localOwner && localOwner !== DEMO_OWNER) await park(localOwner, local);
      await browser.storage.local.remove([PROGRESS_STORAGE_KEY, PROGRESS_OWNER_KEY]);
      storedTag = undefined;
    } else absorb(local);
  }

  // Save from the start: a slow or failing server must never stop progress being kept locally.
  let putTimer: ReturnType<typeof setTimeout> | undefined;
  useCity.subscribe((s, prev) => {
    if (s.progress === prev.progress) return;
    // A failed local write (quota, storage gone with the extension context) must not become an unhandled rejection.
    saveLocal(s.progress).catch(() => {});
    clearTimeout(putTimer);
    // Signed out: keep it locally; it merges into the player's account when they sign in (pullProgress).
    if (s.backendStatus === 'signed-out') return;
    // Not merged with the backend's copy yet: do that first (the merge triggers the push).
    if (!pulled) {
      if (s.backendStatus === 'connected') void pullProgress();
      return;
    }
    putTimer = setTimeout(() => backend!.putProgress(useCity.getState().progress), 1500);
  });

  // Side panel and full-city tab run separately; keep them in sync (merged, so neither loses XP).
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (PROGRESS_OWNER_KEY in changes) storedTag = changes[PROGRESS_OWNER_KEY]?.newValue as string | undefined;
    // The demo and a backend with players never take each other's copy (a surface still open from before a switch).
    if ((storedTag === DEMO_OWNER) !== demo) return;
    // Adopt the other surface's owner tag before absorbing its progress, so the save that follows keeps it.
    if (PROGRESS_OWNER_KEY in changes) storedOwner = storedTag ?? '';
    const next = changes[PROGRESS_STORAGE_KEY]?.newValue as Progress | undefined;
    if (next?.version === 1) absorb(next);
  });

  await pullProgress();
}

let pulling: Promise<void> | undefined;
let pullAgain = false;
/**
 * Merges the backend's copy into ours. Merging also pushes anything earned here while offline (via the subscription).
 * One pull at a time; a pull asked for meanwhile (say, the socket connected) runs once more after it.
 */
function pullProgress() {
  if (pulling) {
    pullAgain = true;
    return pulling;
  }
  pulling = (async () => {
    do {
      pullAgain = false;
      await pullOnce();
    } while (pullAgain);
  })().finally(() => (pulling = undefined));
  return pulling;
}

async function pullOnce() {
  const mine = session;
  let remote: Progress | null;
  try {
    remote = await backend!.getProgress();
  } catch (err) {
    console.warn('[runtime] getProgress failed, using local cache', err);
    return;
  }
  if (mine !== session) return; // signed out meanwhile: that copy was the previous player's
  pulled = true;
  // From here this device's copy is this player's: tag it even if the merge below changes nothing.
  if (hasPlayers()) saveLocal(store().progress).catch(() => {});
  if (remote) absorb(remote);
  // A new account: push what this device has, unless that's nothing at all.
  else if (!sameProgress(emptyProgress(), store().progress)) backend!.putProgress(store().progress);
  await restoreParked(mine);
  // The local bill switch is now merged with the account's: only now may this connection hear it.
  if (mine === session && store().backendStatus === 'connected') {
    billReady = true;
    checkBill();
    checkFlow();
  }
}

/** Gives a parked copy back to the player it belongs to; a different player's sign-in discards it. */
async function restoreParked(mine: number) {
  const player = backend?.playerId?.();
  if (!player) return;
  const parked = (await browser.storage.local.get(PARKED_PROGRESS_KEY))[PARKED_PROGRESS_KEY] as ParkedProgress | undefined;
  if (!parked || mine !== session) return;
  await browser.storage.local.remove(PARKED_PROGRESS_KEY);
  if (parked.player === player && parked.progress?.version === 1) absorb(parked.progress);
}

async function endSession() {
  const explicit = signingOut;
  signingOut = false;
  session++;
  pulled = false;
  storedOwner = '';
  stepUps.clear();
  mfaRefused = undefined;
  // Anything held for this player must not reach the next one.
  clearTimeout(autoSnapTimer);
  lastScreenshotKey = undefined;
  explained.clear();
  stopConsoleCopilot();
  const progress = store().progress;
  const player = backend?.playerId?.();
  store().resetSession();
  // The session died (not a sign-out): keep this device's copy for the same player, out of sight of anyone else.
  if (!explicit && player && !sameProgress(emptyProgress(), progress)) await park(player, progress);
  else if (explicit) await browser.storage.local.remove(PARKED_PROGRESS_KEY);
  await browser.storage.local.remove([PROGRESS_STORAGE_KEY, PROGRESS_OWNER_KEY]);
}

// ── City care pacing: findings wait until the ladder unlocks care (1 quest, 4 landmarks, or a linked account) ──

const careUnlocked = (s: CityState) =>
  ladder({ progress: s.progress, linked: s.account.linked, hasDeploys: Object.keys(s.deploys).length > 0, opened: new Set() }).care &&
  // Simple mode holds them until a quest is finished (src/state/simple.ts); Everything brings them back.
  shows('care', s.prefs, { questsDone: questsDone(s.progress), linked: s.account.linked });

/** Releases the held findings once care unlocks (again for each new player: resetSession locks it). */
function watchCare() {
  if (careUnlocked(store())) store().releaseCare();
  useCity.subscribe((s, prev) => {
    if (s.careReleased || (s.progress === prev.progress && s.account === prev.account && s.deploys === prev.deploys && s.prefs === prev.prefs)) return;
    if (careUnlocked(s)) s.releaseCare();
  });
}

/**
 * A badge newly earned (src/state/badges.ts): one toast and a feed line. A sync that brings several at once (another
 * surface, the server) is quiet: those were celebrated where they were earned.
 */
function watchBadges() {
  // Badges kept only on this device before v2.11 (culture.badges) move into the synced progress.
  for (const id of store().culture.badges) if (!store().progress.badges?.[id]) store().awardBadge(id, id);
  useCity.subscribe((s, prev) => {
    if (s.progress === prev.progress) return;
    const fresh = newBadges(prev.progress, s.progress);
    if (!fresh.length || fresh.length > 2) return;
    for (const id of fresh) {
      const b = badgeById(id)!;
      // Simple mode records the badge (My City shows it with Everything on) without the toast.
      if (shows('badgeToast', s.prefs)) s.toast(b.icon, `Badge earned: ${b.name}. ${b.how}`);
      s.log({ kind: 'system', text: `${b.icon} Badge earned: ${b.name}` });
    }
  });
}

// ── v2.11: the live city and leaderboards ──

/** How often an open, visible tab says the player is still in the city. */
export const BEAT_MS = 30_000;
let beatTimer: ReturnType<typeof setInterval> | undefined;
/** What each board was last sent this week (a best only goes up, so only a better one is sent). */
const sentScores = new Map<string, number>();

/** A hidden tab (or no document, in tests) isn't someone in the city. */
const visible = () => globalThis.document?.visibilityState === 'visible';

function beat() {
  const s = store();
  if (!backend || s.backendStatus !== 'connected' || !visible() || !s.prefs.region) return;
  backend.send({ action: 'presence.beat', region: s.cityRegion, rank: cityRank(s.progress, s.cityRegion).rank.name });
}

/**
 * Sends every best that went up (and the city's rank points), only while the profile is public. A game's board gets
 * this ISO week's best timed round only (v2.12 `bestTimed`): relaxed rounds and last week's bests never reach it.
 */
function sendScores() {
  const s = store();
  if (!backend || s.backendStatus !== 'connected' || !s.progress.profile?.public) return;
  const week = isoWeekUtc(); // the server's board week, which `bestWeek` uses too
  const boards: [string, number][] = [
    ...Object.entries(s.progress.games ?? {}).flatMap(([g, v]) => (v.bestWeek === week && v.bestTimed ? [[g, v.bestTimed] as [string, number]] : [])),
    [`mayors:${s.cityRegion}`, cityPoints(s.progress, s.cityRegion)],
  ];
  for (const [board, score] of boards) {
    // Boards are weekly (the server keeps the best of the ISO week), so a new week sends again from nothing.
    const key = `${week}/${board}`;
    if (score <= 0 || (sentScores.get(key) ?? -1) >= score) continue;
    sentScores.set(key, score);
    backend.send({ action: 'score.submit', board, score });
  }
}

function watchSocial() {
  bus.on('openBoard', ({ board }) => openLeaderboard(board));
  clearInterval(beatTimer);
  beatTimer = setInterval(beat, BEAT_MS);
  globalThis.document?.addEventListener('visibilitychange', () => visible() && beat());
  useCity.subscribe((s, prev) => {
    const arrived = s.backendStatus === 'connected' && prev.backendStatus !== 'connected';
    if (arrived) sentScores.clear();
    if (arrived || s.cityRegion !== prev.cityRegion) {
      if (s.cityRegion !== prev.cityRegion) useCity.setState({ presence: undefined });
      beat();
    }
    // Going public sends the bests at once; a better score or a bigger city sends just that.
    if (s.progress.profile?.public !== prev.progress.profile?.public) sentScores.clear();
    if (arrived || s.progress !== prev.progress) sendScores();
  });
}

/** Opens a board's card and asks for its latest standings. */
export function openLeaderboard(board: string) {
  store().openBoard(board);
  backend?.send({ action: 'leaderboard.get', board });
}

/** Dev and smoke: unlock city care now (findings drip in); `all` shows every held finding at once. */
export const releaseCare = (all = false) => store().releaseCare({ all });

// ── The bill (v2.5): Progress.bill is the player's choice; the backend hears it as bill.enable ──

/** What this connection was last told (undefined = nothing yet). Sent on connect only when it's on, and on every change. */
let billSent: boolean | undefined;
/**
 * True once this connection's pull of the account's copy has succeeded. Until then the local switch may be stale
 * (turned off on another device), and replaying an old 'on' could buy a Cost Explorer read the player revoked.
 */
let billReady = false;
function checkBill() {
  const s = store();
  if (s.backendStatus !== 'connected' || !billReady) return void (billSent = undefined);
  const on = !!s.progress.bill;
  if (billSent === on || (billSent === undefined && !on)) return void (billSent = on);
  billSent = on;
  backend?.send({ action: 'bill.enable', on });
}
function syncBill() {
  useCity.subscribe((s, prev) => {
    if (s.backendStatus !== prev.backendStatus || !!s.progress.bill !== !!prev.progress.bill) checkBill();
  });
}

/** Turn the month-to-date bill on or off (each server read of Cost Explorer costs the player $0.01, so it's off by default). */
export function setBill(on: boolean) {
  store().setBill(on);
}

// ── Live traffic (v2.8): Progress.flow is the player's choice; the backend hears it as flow.enable ──

let flowSent: boolean | undefined;
/** Like the bill: only once this connection has pulled the account's copy (billReady), never a stale 'on'. */
function checkFlow() {
  const s = store();
  if (s.backendStatus !== 'connected' || !billReady) return void (flowSent = undefined);
  const on = !!s.progress.flow;
  if (flowSent === on || (flowSent === undefined && !on)) return void (flowSent = on);
  flowSent = on;
  backend?.send({ action: 'flow.enable', on });
}
function syncFlow() {
  useCity.subscribe((s, prev) => {
    if (s.backendStatus !== prev.backendStatus || !!s.progress.flow !== !!prev.progress.flow) checkFlow();
  });
}

/** Turn live traffic on or off (CloudWatch reads, about a cent a day, so it's off by default). */
export function setFlow(on: boolean) {
  store().setFlow(on);
}

// ── Page focus (from background.ts) ──

async function initFocus() {
  browser.runtime.onMessage.addListener((msg: RuntimeMessage) => {
    if (msg?.type === 'page.focus') handleFocus(msg.focus);
  });
  const saved = (await browser.storage.session.get(FOCUS_STORAGE_KEY))[FOCUS_STORAGE_KEY] as PageFocus | undefined;
  if (saved) handleFocus(saved);
}

let autoSnapTimer: ReturnType<typeof setTimeout> | undefined;
function handleFocus(f: PageFocus) {
  if (f.kind === 'extension') return; // our own full-city tab
  const prev = store().focus;
  store().setFocus(f);
  bus.emit('focus', f);
  if (prev?.url === f.url) return;
  // A screenshot of the last page must not ride along with a task about this one.
  lastScreenshotKey = undefined;
  clearTimeout(autoSnapTimer);
  // Auto-snap covers AWS pages only (like pageContext): other sites are photographed only when the player asks.
  if (store().autoSnap && isAwsPage(f) && layout === 'panel') {
    autoSnapTimer = setTimeout(() => void snap(), 1500);
  }
}

async function initSettings() {
  const s = (await browser.storage.local.get(SETTINGS_STORAGE_KEY))[SETTINGS_STORAGE_KEY] as { autoSnap?: boolean } | undefined;
  if (s?.autoSnap) store().setAutoSnap(true);
}

// ── Commands used by the UI ──

/**
 * What the agents may know about the tab the player is on: AWS console and docs pages only. Any other
 * site's URL and title stay in the browser (they can carry personal data, and they're not AWS).
 */
export function pageContext(f: PageFocus | undefined = store().focus) {
  if (!f || !isAwsPage(f)) return {};
  return { url: f.url, title: f.title, serviceId: f.serviceId };
}

/** AWS console and docs pages: the only ones whose URL and title the agents see, and the only ones auto-snapped. */
export const isAwsPage = (f: Pick<PageFocus, 'kind'>) => f.kind === 'console' || f.kind === 'console-home' || f.kind === 'docs';

export function submitPrompt(prompt: string) {
  const text = prompt.trim();
  if (!text || !backend) return;
  const taskId = uid();
  store().addTask(taskId, text);
  backend.send({ action: 'task.submit', taskId, prompt: text, context: { ...pageContext(), screenshotKey: lastScreenshotKey } });
}

/** Ask a district's agent; `shown` is what the chat shows as the player's words (the framing stays out of it). */
export function askDistrict(districtId: string, question: string, shown = question) {
  const q = question.trim();
  if (!q || !backend) return;
  const requestId = uid();
  store().addUserChat(districtId, requestId, shown.trim() || q);
  backend.send({ action: 'chat.ask', requestId, districtId, question: q, context: pageContext() });
  return requestId;
}

let lastScreenshotKey: string | undefined;

/** Why the Lookout can't snap from the full tab, and where it can (the side panel or sidebar sees the page beside it). */
export function lookoutUnavailable(surface: Surface = SURFACE): string {
  if (surface === 'tab') return 'Safari has no side panel, so I can’t see your other tabs from here. Open the AWS page and ask me in words instead.';
  const how = surface === 'sidebar' ? 'click the AWS City toolbar button (or View → Sidebar)' : 'click the AWS City toolbar button';
  return `I can only see the page beside me from the ${SURFACE_NAME[surface]}. Open the AWS page in a tab, then ${how} to open the ${SURFACE_NAME[surface]} and press my camera.`;
}

/** Lookout snaps the visible tab, uploads it, and asks the backend what it shows. */
export async function snap() {
  if (!backend || store().snap === 'snapping') return;
  // The demo's Lookout looks at the practice console from every surface (the tab and Safari too).
  if (backend.kind === 'mock' && (layout === 'full' || !store().focus || !isAwsPage(store().focus!))) return void lookAtPractice();
  if (layout === 'full') {
    store().setSnap('unavailable');
    store().log({ kind: 'message', from: 'lookout', to: 'user', text: lookoutUnavailable() });
    return;
  }
  store().setSnap('snapping');
  bus.emit('snap', { phase: 'start' });
  const f = store().focus;
  const shot = await captureVisibleTab(f?.windowId);
  if (!shot.ok) {
    store().setSnap(shot.reason === 'needs-permission' ? 'needs-permission' : 'failed');
    store().log({ kind: 'message', from: 'lookout', to: 'user', text:
        shot.reason === 'restricted'
          ? 'Chrome won’t let me photograph this page.'
          : shot.reason === 'needs-permission'
            ? 'Chrome needs your OK first — press “📷 Allow” and I’ll snap the page.'
            : `I couldn’t take the photo: ${shot.message}` });
    bus.emit('snap', { phase: 'failed' });
    return;
  }
  try {
    lastScreenshotKey = await backend.uploadScreenshot(shot.dataUrl);
    // The photo goes (the player asked, or it's an AWS page); another site's URL and title don't.
    backend.send({ action: 'page.classify', requestId: uid(), context: { ...pageContext(f), screenshotKey: lastScreenshotKey } });
    store().setSnap('idle', shot.dataUrl);
    bus.emit('snap', { phase: 'done' });
  } catch (err) {
    store().setSnap('failed');
    store().log({ kind: 'system', text: `⚠️ Screenshot upload failed: ${String(err)}` });
    bus.emit('snap', { phase: 'failed' });
  }
}

/** Whether the Lookout's camera works here: the side panel or sidebar, or anywhere in the demo (the practice console). */
export const lookoutWorksHere = (l: Layout | undefined = layout) => l === 'panel' || backend?.kind === 'mock';

/** The practice console page the demo's Lookout couldn't photograph yet: waiting on the player's "📷 Allow" (or a no). */
let practiceLook: { url: string; title?: string } | undefined;

/**
 * The demo's Lookout: brings up the practice console (opening it if needed), photographs it, and comes back. If the
 * browser wants the player's OK first, it asks for it ("📷 Allow", as on a real page); if the player says no, it reads
 * the page's address instead (`lookByAddress`: the offline demo classifies by service, not by pixels).
 */
async function lookAtPractice() {
  if (!backend) return;
  store().setSnap('snapping');
  bus.emit('snap', { phase: 'start' });
  const own = await browser.tabs.getCurrent?.().catch(() => undefined);
  const tab = await openPractice(store().focus?.serviceId, { wait: false });
  if (!tab) {
    store().setSnap('failed');
    bus.emit('snap', { phase: 'failed' });
    return;
  }
  await new Promise((r) => setTimeout(r, 700)); // let it draw
  const shot = await captureVisibleTab(tab.windowId);
  // Back to the city when the practice console had to take its place in the same window.
  if (own?.id !== undefined && own.windowId === tab.windowId) void browser.tabs.update(own.id, { active: true }).catch(() => {});
  if (!shot.ok && shot.reason === 'needs-permission') {
    practiceLook = { url: tab.url, title: tab.title };
    store().setSnap('needs-permission');
    store().log({
      kind: 'message',
      from: 'lookout',
      to: 'user',
      text: 'The browser needs your OK before I can photograph the practice console: press “📷 Allow”. If you’d rather not, I’ll go by the page’s address.',
    });
    bus.emit('snap', { phase: 'failed' });
    return;
  }
  practiceLook = undefined;
  try {
    lastScreenshotKey = shot.ok ? await backend.uploadScreenshot(shot.dataUrl) : undefined;
    const serviceId = practiceRoute(tab.url).service;
    backend.send({ action: 'page.classify', requestId: uid(), context: { url: tab.url, title: tab.title, serviceId, screenshotKey: lastScreenshotKey } });
    store().setSnap('idle', shot.ok ? shot.dataUrl : undefined);
    bus.emit('snap', { phase: 'done' });
  } catch (err) {
    store().setSnap('failed');
    store().log({ kind: 'system', text: `⚠️ Screenshot upload failed: ${String(err)}` });
    bus.emit('snap', { phase: 'failed' });
  }
}

/** Call directly from a click handler. A no in the demo still gets the practice console read, by its address. */
export function grantLookout() {
  void requestCapturePermission()
    .catch(() => false)
    .then((ok) => {
      if (ok) void snap();
      else if (practiceLook) lookByAddress();
    });
}

/** The demo's Lookout without a photo (the player declined): it reads the practice console's address instead. */
export function lookByAddress() {
  const look = practiceLook;
  if (!backend || !look) return;
  practiceLook = undefined;
  lastScreenshotKey = undefined;
  backend.send({ action: 'page.classify', requestId: uid(), context: { url: look.url, title: look.title, serviceId: practiceRoute(look.url).service } });
  store().setSnap('idle');
  store().log({ kind: 'message', from: 'lookout', to: 'user', text: 'No photo, then: I’ll go by the page’s address.' });
}

/** Whether a declined photo can still be read by address (the demo's practice console, waiting on "📷 Allow"). */
export const canLookByAddress = () => !!practiceLook;

export function setAutoSnap(on: boolean) {
  store().setAutoSnap(on);
  void browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: { autoSnap: on } });
  if (on) void hasCapturePermission().then((has) => !has && store().log({ kind: 'message', from: 'lookout', to: 'user', text: 'Auto-snap is on for AWS pages. Press my camera once so Chrome lets me see them.' }));
}

// ── Account linking + real deploys (curated templates, change-set approval) ──

export function signIn() {
  if (!backend?.signIn || store().signingIn) return;
  store().setSigningIn(true);
  void backend
    .signIn()
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|closed|did not approve/i.test(msg)) return store().log({ kind: 'system', text: 'Sign-in cancelled.' });
      store().log({ kind: 'system', text: `⚠️ Sign-in failed: ${msg}` });
      store().toast('⚠️', `Sign-in didn’t finish: ${msg}. If it keeps happening, this build’s sign-in redirect may not be registered with the server.`, 'error');
    })
    .finally(() => store().setSigningIn(false));
}

/** Optional backend methods (added to the AgentBackend contract separately) — read defensively. */
type MaybeRecoverable = { reconnect?: () => void | Promise<void>; signOut?: () => void | Promise<void>; deleteAccount?: () => Promise<void> };
const optional = () => backend as (AgentBackend & MaybeRecoverable) | undefined;

export const canSignIn = () => typeof backend?.signIn === 'function';
export const canReconnect = () => typeof optional()?.reconnect === 'function';
export const canDeleteAccount = () => typeof optional()?.deleteAccount === 'function';

/** Deletes everything the server stores about the player (privacy policy: "Delete my account"). */
export async function deleteAccount() {
  const b = optional();
  if (!b?.deleteAccount) return;
  try {
    signingOut = true;
    await b.deleteAccount();
    store().toast('🧾', 'Your AWS City account and progress were deleted. Delete the AWSCity stack in CloudFormation to remove the role.');
  } catch (e) {
    store().log({ kind: 'system', text: `⚠️ Couldn’t delete your account: ${String(e)}` });
  } finally {
    signingOut = false;
  }
}

export function reconnect() {
  void Promise.resolve(optional()?.reconnect?.()).catch((e) => store().log({ kind: 'system', text: `⚠️ Reconnect failed: ${String(e)}` }));
}

export function signOut() {
  // The backend reports 'signed-out' from inside signOut(), so endSession sees this flag and forgets the device's copy.
  signingOut = true;
  void Promise.resolve(optional()?.signOut?.())
    .catch((e) => store().log({ kind: 'system', text: `⚠️ Sign-out failed: ${String(e)}` }))
    .finally(() => (signingOut = false));
}

export const canSetUpMfa = () => typeof backend?.startTotp === 'function';

/** Step 1 of authenticator setup; the panel shows the key. */
export async function startMfaSetup() {
  try {
    return await backend!.startTotp!();
  } catch (e) {
    store().toast('⚠️', (e as Error).message, 'error');
    return undefined;
  }
}

/** A command the server can refuse with mfa_required (step-up), as sent. */
export type StepUp = { action: 'account.link'; region: string } | { action: 'account.verify'; roleArn: string } | { action: 'finding.fix' } | { action: 'deploy.approve' };
/** requestId → the step-up command sent with it (its mfa_required error carries that id; deploy.approve's carries none). */
const stepUps = new Map<string, StepUp>();
const noteStepUp = (requestId: string, cmd: StepUp) => {
  stepUps.set(requestId, cmd);
  if (stepUps.size > 20) stepUps.delete(stepUps.keys().next().value!);
};
/** The command the last mfa_required refused (undefined = unknown). */
let mfaRefused: StepUp | undefined;

/** Which command an mfa_required error refused: by its requestId, or deploy.approve (the only one sent without an id). */
export function refusedBy(e: { requestId?: string }, sent: ReadonlyMap<string, StepUp>): StepUp | undefined {
  return e.requestId ? sent.get(e.requestId) : { action: 'deploy.approve' };
}

/**
 * What to do once the authenticator is on: resend a refused link or verify as it was sent; an approval or a fix is
 * the player's to press again (the server keeps the preview pending; a refused fix never made one).
 */
export function afterMfa(refused: StepUp | undefined): { resend?: StepUp; message: string } {
  switch (refused?.action) {
    case 'account.link':
      return { resend: refused, message: 'Authenticator on. Linking your AWS account now.' };
    case 'account.verify':
      return { resend: refused, message: 'Authenticator on. Checking your AWS account now.' };
    case 'deploy.approve':
      return { message: 'Authenticator on. Press Approve again: your change is still waiting.' };
    case 'finding.fix':
      return { message: 'Authenticator on. Press Fix again to preview the change.' };
    default:
      return { message: 'Authenticator on. Your AWS account is protected.' };
  }
}

/** Step 2: confirm with a code, then retry the link or verify the server refused (an approval or fix is pressed again). */
export async function confirmMfaSetup(code: string) {
  try {
    await backend!.confirmTotp!(code);
    const next = afterMfa(mfaRefused);
    mfaRefused = undefined;
    store().setMfaRequired(false);
    store().toast('🔐', next.message);
    if (next.resend?.action === 'account.link') linkAccount(next.resend.region);
    else if (next.resend?.action === 'account.verify') verifyAccount(next.resend.roleArn);
    return true;
  } catch (e) {
    store().toast('⚠️', (e as Error).message, 'error');
    return false;
  }
}

/** Returns the requestId (an error for this request carries it), or undefined if nothing was sent. */
export function linkAccount(region = 'us-west-2') {
  if (!backend) return undefined;
  const requestId = uid();
  noteStepUp(requestId, { action: 'account.link', region });
  backend.send({ action: 'account.link', requestId, region });
  return requestId;
}

/**
 * Accepts a 12-digit account id or a role ARN; the value goes to the server unchanged (it accepts either).
 * Returns the requestId, or undefined if the value was refused (or there's no backend).
 */
export function verifyAccount(roleArn: string) {
  if (!isAccountIdOrRoleArn(roleArn)) {
    store().toast('⚠️', 'That doesn’t look right — paste the 12-digit account ID (or the role ARN arn:aws:iam::123456789012:role/…).', 'error');
    return undefined;
  }
  if (!backend) return undefined;
  const requestId = uid();
  noteStepUp(requestId, { action: 'account.verify', roleArn: roleArn.trim() });
  backend.send({ action: 'account.verify', requestId, roleArn: roleArn.trim() });
  return requestId;
}

/** Returns the requestId (an error for this request carries it). */
export function planDeploy(templateId: string, taskId?: string) {
  if (!backend) return undefined;
  const requestId = uid();
  backend.send({ action: 'deploy.plan', requestId, templateId, taskId });
  return requestId;
}

/** `confirm` = what the player typed when the preview asked for confirmText (sent only with an approval). */
export function decideDeploy(deployId: string, approve: boolean, confirm?: string) {
  backend?.send(approve && confirm !== undefined ? { action: 'deploy.approve', deployId, confirm } : { action: approve ? 'deploy.approve' : 'deploy.reject', deployId });
}

// ── City care (v2.3): citizens explain and fix findings; every fix is a normal preview to approve ──

/** Findings explained this session (Explain teaches the citizen once per finding). */
const explained = new Set<string>();
export const wasExplained = (findingId: string) => explained.has(findingId);

export function explainFinding(findingId: string) {
  const f = store().findings[findingId];
  if (!f || !backend) return;
  const requestId = uid();
  store().noteCare(findingId, { kind: 'explain', requestId });
  backend.send({ action: 'finding.explain', requestId, findingId });
  if (!explained.has(findingId)) {
    explained.add(findingId);
    store().awardCitizens([{ citizenId: f.citizenId, amount: CITIZEN_XP.explain }]);
  }
}

/** Asks for the fix; the answer is a deploy.preview the player approves in the Deploy tab. */
export function fixFinding(findingId: string) {
  const f = store().findings[findingId];
  if (!f || !backend) return;
  const gate = fixGate(store().progress, f);
  if (!gate.ok) {
    store().toast('🎓', gate.reason);
    return;
  }
  const requestId = uid();
  store().noteCare(findingId, { kind: 'fix', requestId });
  noteStepUp(requestId, { action: 'finding.fix' });
  backend.send({ action: 'finding.fix', requestId, findingId });
}

/** Only AWS documentation pages open from a finding's url. */
export const isSafeDocsUrl = (raw: string) => {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && (u.hostname === 'docs.aws.amazon.com' || u.hostname === 'aws.amazon.com');
  } catch {
    return false;
  }
};

export function openDocs(url: string) {
  if (!isSafeDocsUrl(url)) {
    store().toast('⚠️', 'That link isn’t an AWS documentation page, so it wasn’t opened.', 'error');
    return;
  }
  void browser.tabs.create({ url });
}

/** "Learn more" opens only the learning partners' own sites (src/world/reading.ts), in a new tab. */
export function openReading(url: string) {
  if (!isReadingUrl(url)) {
    store().toast('⚠️', 'That link isn’t on a learning partner’s site, so it wasn’t opened.', 'error');
    return;
  }
  void browser.tabs.create({ url });
}

/** The map data's licence page: the only OpenStreetMap address the game opens (the map itself is bundled). */
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
/** OpenStreetMap's own site over https (nothing else, no credentials in the URL). */
export const isOsmUrl = (raw: string) => {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && u.hostname === 'www.openstreetmap.org';
  } catch {
    return false;
  }
};
/** "© OpenStreetMap contributors" opens the copyright page in a new tab (never fetched by the extension). */
export function openOsmCopyright(url = OSM_COPYRIGHT_URL) {
  if (!isOsmUrl(url)) return;
  void browser.tabs.create({ url });
}

/** v2.6: AWS's own status page (a fixed address, never one from a feed). */
export const AWS_STATUS_URL = 'https://health.aws.amazon.com/health/status';
export function openAwsStatus() {
  void browser.tabs.create({ url: AWS_STATUS_URL });
}

/** A workshop's full version: AWS Workshop Studio or its source repo in one of AWS's GitHub orgs (isWorkshopUrl). */
export function openWorkshopSource(url: string) {
  if (!isWorkshopUrl(url)) {
    store().toast('⚠️', 'That link isn’t an AWS workshop page, so it wasn’t opened.', 'error');
    return;
  }
  void browser.tabs.create({ url });
}

/** AWS CloudShell, where a workshop's commands run for real (signed in already, in the console's Region). */
export const CLOUDSHELL_URL = 'https://console.aws.amazon.com/cloudshell/home';
export function openCloudShell() {
  void browser.tabs.create({ url: CLOUDSHELL_URL });
}

/** v2.10: asks the backend to check a workshop step in the account; the answer (workshop.verified) pays the building. */
export function verifyWorkshopStep(workshopId: string, stepId: string, values: Record<string, string>) {
  if (!backend) return;
  store().noteWorkshopCheck(workshopId, stepId);
  backend.send({ action: 'workshop.verify', workshopId, stepId, values });
}

export function teardownDeploy(deployId: string) {
  backend?.send({ action: 'deploy.teardown', deployId });
}

export function startQuest(questId: string) {
  backend?.send({ action: 'quest.start', questId, taskId: uid() });
}

/** Only AWS's own https pages (the CloudFormation quick-create link, deploy outputs on AWS) open from server data. */
export const isSafeAwsUrl = (raw: string) => {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && (u.hostname === 'console.aws.amazon.com' || u.hostname.endsWith('.console.aws.amazon.com'));
  } catch {
    return false;
  }
};

export function openUrl(url: string) {
  if (!isSafeAwsUrl(url)) {
    store().toast('⚠️', 'That link isn’t an AWS Console page, so it wasn’t opened.', 'error');
    return;
  }
  void browser.tabs.create({ url });
}

export function openFullCity() {
  void browser.tabs.create({ url: browser.runtime.getURL('/city.html') });
}

export function openConsole(serviceId: string) {
  void browser.tabs.create({ url: consoleUrl(serviceId) });
}

/** Dev helper: pretend the user opened `url` (used by tests and the DevTools console via window.awsCity). */
export function simulateFocus(url: string, title = url) {
  const m = matchUrl(url);
  handleFocus({ url, title, kind: m.kind, serviceId: m.serviceId });
}

// ── Console Copilot: the agent works in the player's live AWS console tab ──

let copilot: { taskId: string; tabId: number } | undefined;
const emptySnapshot = (): PageSnapshot => ({ url: '', title: '', items: [] });

// ── The practice console (src/entrypoints/practice/): the demo's Copilot and Lookout work there, from every surface ──

const practiceBase = () => browser.runtime.getURL(PRACTICE_PATH);
const practiceTabs = new Set<number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A message to the page a Copilot task runs in. Content scripts get tabs.sendMessage; the practice console is our own
 * page, which Chrome reaches the same way; where a browser doesn't, the message is broadcast with the tab's id, and
 * only that tab's practice console answers (src/entrypoints/practice/main.ts).
 */
async function sendToTab<T>(tabId: number, msg: CopilotMessage): Promise<T | undefined> {
  try {
    return (await browser.tabs.sendMessage(tabId, msg)) as T | undefined;
  } catch (err) {
    if (!practiceTabs.has(tabId)) throw err;
    return (await browser.runtime.sendMessage({ ...msg, practiceTabId: tabId })) as T | undefined;
  }
}

/**
 * Brings the practice console to the front at `serviceId`'s page (opening it, or moving an open one there), and waits
 * until its Copilot answers (`wait`). Returns the tab, or undefined when it couldn't open.
 */
export async function openPractice(serviceId?: string, opts: { wait?: boolean } = {}) {
  const base = practiceBase();
  const want = practiceUrl(base, serviceId);
  const tabs = await browser.tabs.query({}).catch(() => []);
  const focused = store().focus?.tabId;
  let tab = tabs.find((t) => t.id === focused && isPracticeUrl(t.url, base)) ?? tabs.find((t) => isPracticeUrl(t.url, base));
  try {
    if (tab?.id !== undefined) {
      const move = isPracticeService(serviceId) && practiceRoute(tab.url ?? '').service !== serviceId;
      tab = (await browser.tabs.update(tab.id, move ? { url: want, active: true } : { active: true })) ?? tab;
      if (tab.windowId !== undefined) void browser.windows.update(tab.windowId, { focused: true }).catch(() => {});
    } else tab = await browser.tabs.create({ url: want, active: true });
  } catch {
    return undefined;
  }
  if (tab?.id === undefined) return undefined;
  const tabId = tab.id;
  practiceTabs.add(tabId);
  const url = isPracticeService(serviceId) ? want : (tab.url ?? want);
  const found: { tabId: number; windowId?: number; url: string; title: string; snapshot?: PageSnapshot } = { tabId, windowId: tab.windowId, url, title: tab.title ?? 'Practice console' };
  if (opts.wait === false) return found;
  // A fresh tab needs a moment to load its page; a moved one re-renders at once.
  for (let i = 0; i < 40; i++) {
    const res = await sendToTab<{ snapshot?: PageSnapshot }>(tabId, { type: 'copilot.snapshot' }).catch(() => undefined);
    if (res?.snapshot && practiceRoute(res.snapshot.url).service === practiceRoute(url).service) return { ...found, url: res.snapshot.url, title: res.snapshot.title, snapshot: res.snapshot };
    await sleep(150);
  }
  return undefined;
}

/** The service a demo Copilot task is about: the task's own, else one the goal names, else the page's. */
function practiceServiceFor(goal: string, serviceId?: string) {
  const f = store().focus;
  for (const id of [serviceId, matchText(goal), f?.serviceId]) if (isPracticeService(id)) return id;
  return serviceId ?? f?.serviceId ?? matchText(goal);
}

/**
 * The demo's Copilot always works in the practice console, never a real AWS console tab (its scripted flows would
 * really click there). Opens or moves the practice console as needed, then starts the task on it.
 */
async function startPracticeCopilot(text: string, opts: { serviceId?: string; onStart?: (taskId: string) => void }) {
  if (!backend) return;
  const serviceId = practiceServiceFor(text, opts.serviceId);
  const f = store().focus;
  const already = !!f?.tabId && isPracticeUrl(f.url, practiceBase()) && (!isPracticeService(serviceId) || practiceRoute(f.url).service === serviceId);
  if (!already) store().log({ kind: 'message', from: 'concierge', to: 'user', text: 'This is the demo, so I’ll do it in the practice console: it looks like the AWS console, and nothing there touches AWS.' });
  const tab = await openPractice(serviceId);
  if (!tab?.snapshot) {
    store().log({ kind: 'message', from: 'concierge', to: 'user', text: 'The practice console didn’t open. Try once more in a moment.' });
    return;
  }
  if (copilot) stopConsoleCopilot();
  const taskId = uid();
  copilot = { taskId, tabId: tab.tabId };
  store().setCopilot(taskId);
  store().addTask(taskId, `🖥️ ${text}`);
  opts.onStart?.(taskId);
  const service = practiceRoute(tab.url).service ?? serviceId;
  backend.send({ action: 'console.start', taskId, goal: text, context: { url: tab.url, title: tab.title, serviceId: service }, snapshot: tab.snapshot });
  return taskId;
}

/**
 * Start a Copilot task on the console tab the player is looking at (from the side panel / Firefox sidebar). `serviceId`
 * names the task's own service (a workshop step's), which picks the agent and the offline demo's flow; without it, the
 * page's service does. `onStart` gets the new task's id before anything is sent, so a caller links only the task it
 * started. Returns that id, or undefined when no task started.
 */
export async function startConsoleCopilot(goal: string, opts: { serviceId?: string; onStart?: (taskId: string) => void } = {}): Promise<string | undefined> {
  const text = goal.trim();
  if (!text || !backend) return;
  if (backend.kind === 'mock') return startPracticeCopilot(text, opts);
  const f = store().focus;
  if (!f?.tabId || (f.kind !== 'console' && f.kind !== 'console-home')) {
    store().log({ kind: 'message', from: 'concierge', to: 'user', text: 'Open an AWS Console tab first (I’ll wait) — then ask me again and I’ll do it right there.' });
    openConsole(f?.serviceId ?? DEFAULT_CONSOLE_SERVICE);
    return;
  }
  if (isPracticeUrl(f.url, practiceBase())) practiceTabs.add(f.tabId);
  let snapshot: PageSnapshot;
  try {
    const res = await sendToTab<{ snapshot?: PageSnapshot }>(f.tabId, { type: 'copilot.snapshot' });
    snapshot = res?.snapshot ?? emptySnapshot();
  } catch {
    store().log({ kind: 'message', from: 'concierge', to: 'user', text: 'I can’t reach that console tab yet — reload it once (so the Copilot can load) and try again.' });
    return;
  }
  if (copilot) stopConsoleCopilot();
  const taskId = uid();
  copilot = { taskId, tabId: f.tabId };
  store().setCopilot(taskId);
  store().addTask(taskId, `🖥️ ${text}`);
  opts.onStart?.(taskId);
  backend.send({ action: 'console.start', taskId, goal: text, context: { url: f.url, title: f.title, serviceId: opts.serviceId ?? f.serviceId }, snapshot });
  return taskId;
}

async function relayConsoleStep(step: ConsoleStepEvent) {
  if (!copilot || step.taskId !== copilot.taskId || !backend) return;
  const { tabId, taskId } = copilot;
  let result: { ok: boolean; note?: string; snapshot?: PageSnapshot };
  try {
    result = (await sendToTab<typeof result>(tabId, { type: 'copilot.step', step, agentName: agentName(step.agentId) })) ?? { ok: false, note: 'no answer from page' };
  } catch {
    result = { ok: false, note: 'console tab closed' };
  }
  if (step.action === 'done') {
    copilot = undefined;
    store().setCopilot(undefined);
    return;
  }
  if (!copilot || copilot.taskId !== taskId) return; // stopped meanwhile
  if (result.note === 'stopped by player' || result.note === 'console tab closed') {
    stopConsoleCopilot(result.note === 'console tab closed' ? 'The console tab closed, so I stopped.' : undefined);
    return;
  }
  backend.send({ action: 'console.observe', taskId, index: step.index, ok: result.ok, note: result.note, snapshot: result.snapshot ?? emptySnapshot() });
}

export function stopConsoleCopilot(message?: string) {
  if (!copilot) return;
  const { taskId, tabId } = copilot;
  copilot = undefined;
  store().setCopilot(undefined);
  backend?.send({ action: 'console.stop', taskId });
  void sendToTab(tabId, { type: 'copilot.stop', message }).catch(() => {});
  if (message) store().log({ kind: 'system', text: `🛑 ${message}` });
}

