import { create } from 'zustand';
import flavourJson from '../../shared/region-flavour.json' with { type: 'json' };

/** How Connie says hello in each Region (flavour only). */
const FLAVOUR = flavourJson as { regions: Record<string, { hello: string; language: string }> };
import type { ConnectionStatus } from '@/backend/AgentBackend';
import type { AwsHealthEvent, AwsNewsEvent, CityBillEvent, LeaderboardStateEvent, PresenceStateEvent, SavedDesign,
  CityFlowEvent, CityFinding, CityInventoryEvent, DeployChange, DeployStatusEvent, PillarKey, Progress, ServerEvent, StepStatus } from '@/backend/contract';
import { placeFor, TIER_NAMES, tierForXp, type GameId } from '@/world/places';
import { questById, serviceOfCard, type QuestStep } from '@/world/content';
import { review, xpFor, type Grade } from '@/learning/srs';
import { countDaily, takeDaily, usedToday } from '@/learning/dailyLedger';
import { isoWeekUtc } from './events';
import { firstRemembered, REMEMBERED_STARS } from './mastery';
import { ACTION_BLUEPRINT, GUARDED_EQUIV } from '@/backend/ServerBackend';
import { serviceById } from '@/world/taxonomy';
import { REGIONS } from '@/world/culture';
import { citizenById, PILLAR_LABEL } from '@/world/citizens';
import { bus } from './bus';
import { growthLine, growthOf } from './growth';
import { newsOpen } from './ladder';
import { builtCities, landmarkOf, migrateCities, withLandmark } from './cities';
import { incidentLine, plainIncidentLead } from '@/world/incidents';
import { bumpDay, dayKey, nextStreak, type DayLog, type LearningKind } from './progress';
import { workshopById } from '@/world/workshops';
import { TALK_XP, talkById } from '@/world/conference';
import { mayorName } from './names';
import { clientName, completeTask, taskById } from '@/world/clients';
import { bumpShift, stepService, type ShiftLog } from './next';
import { cityDecor, itemOfKind, moveProp, nextVariant, placeProp, propAt, pushUndo, removeProp, undoStep, type BuildResult, type Ground, type UndoStep } from './buildmode';
import { COIN_PAY, earn as earnPure, migrateWallet, payShift as payShiftPure, roundCoins, spend as spendPure, WATCH_PAID_A_DAY } from './wallet';
import { addFreeze, heldFreezes, lightDay as lightDayPure, lightsOf, MAX_FREEZES } from './lights';
import { ownedCosmetics } from './rewards';
import { claimStep, fillSeason as fillSeasonPure, seasonById, seasonFor, rewardName, type RoadReward } from './season';
import { openDrop as openDropPure } from './drops';
import { findCombo } from './codex';
import { RARITY_NAME, type Cosmetic } from './cosmetics';
import { comboById } from '@/world/combos';

/** v2.11: sandbox designs kept in Progress (the server accepts at most 20). */
export const MAX_DESIGNS = 20;
/** An agent's answer pays its building CHAT_STARS for the first CHAT_PAID_A_DAY answers a day. */
export const CHAT_STARS = 5;
export const CHAT_PAID_A_DAY = 3;
/** …and at most CHAT_PAID_A_DAY_TOTAL paid answers a day across every building. */
export const CHAT_PAID_A_DAY_TOTAL = 10;
const CHAT_DAY_KEY = 'chat:*';
/** A finished task pays its building for the first TASK_PAID_A_DAY tasks a day, nothing after. */
export const TASK_PAID_A_DAY = 3;
/** A Lookout-classified page pays each service it names CLASSIFY_STARS, once a day per service. */
export const CLASSIFY_STARS = 3;
import { FINISH_XP, honestMode, stepReward, withStep, type StepMode } from '@/learning/workshopRewards';
import { awardCitizens as awardPure, cardReviewsFor, CITIZEN_XP, citizensForPuzzle, citizensForService, levelCan, levelName, type Award } from './citizens';
import type { PageFocus } from './types';
import { agentName, cityHealth, emptyProgress, HEALTH_COST, isDiscovered, knownAgents, openFindings, questTargets, severityRank, taskRunning, tierOf } from './selectors';
import { shows } from './simple';

// Pure reads of the store's state (no zustand): kept in ./selectors, exported from here as before.
export { agentName, cityHealth, emptyProgress, HEALTH_COST, isDiscovered, knownAgents, openFindings, questTargets, severityRank, taskRunning, tierOf };

export interface FeedItem {
  id: number;
  at: number;
  kind: 'message' | 'step' | 'state' | 'system' | 'user';
  from?: string;
  to?: string;
  text: string;
  taskId?: string;
  /** Agents talking among themselves while none of the player's tasks runs (hidden unless prefs.chatter). */
  ambient?: boolean;
}

export interface TaskView {
  taskId: string;
  prompt: string;
  agentId?: string;
  steps: { text: string; status: StepStatus }[];
  status: 'routing' | 'running' | 'done' | 'failed';
  result?: string;
  /** The real AWS API calls its agent made (from agent.state working details), in order. */
  calls?: string[];
  /** Watch it done: the stars its finish paid, by building (empty when today's paid tasks there were used up). */
  paid?: { serviceId: string; stars: number }[];
  /** Its finish paid nothing because that building's TASK_PAID_A_DAY paid tasks today are used up. */
  capped?: boolean;
  /** A capped repeat still pays a few City Coins (COIN_PAY.watch, the first WATCH_PAID_A_DAY a day). */
  coins?: number;
}

export interface ChatMsg {
  id: string;
  role: 'user' | 'agent' | 'error';
  agentId?: string;
  text: string;
  pending?: boolean;
  /** A finished answer: the stars it grew its building, or `capped` when today's paid answers are used up. */
  stars?: number;
  capped?: boolean;
}

/** The words every new-city welcome toast shares, so a stale one can be found and dropped. */
const WELCOME_MARK = 'Every AWS Region starts empty';

export interface Toast {
  id: number;
  icon: string;
  text: string;
  kind?: 'info' | 'error';
  /** How long it shows (the countdown bar runs this long). */
  ms: number;
  /** In its exit animation (removed a moment later). */
  leaving?: boolean;
  /** Toasts of one group merge ("3 new landmarks: …"); `items` are what was merged. */
  group?: 'discover';
  items?: string[];
  /** A building's moment (browsing grew it): its service icon pops beside the text, with its growth line under it. */
  serviceId?: string;
  detail?: string;
}

/** Info toasts wait here so only one shows at a time (errors show at once). */
const toastQueue: Omit<Toast, 'id'>[] = [];
/** Toasts waiting their turn (the oldest give way). */
const TOAST_QUEUE_MAX = 6;
/** Messages kept per HQ chat (in memory only). */
const CHAT_MAX = 50;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();
const listOf = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
/**
 * One channel per moment: while a quest's celebration card, a finished workshop's card or a mini-game is up, info
 * toasts (badges, AWS status, a drill) wait in the queue and show one by one once it closes, so nothing lands on top
 * of the big moment or a game's timer. Errors still show at once.
 */
export const toastsHeld = (s: { celebration?: string; workshopDone?: string; clientDone?: unknown; view: { name: string } }) =>
  !!s.celebration || !!s.workshopDone || !!s.clientDone || s.view.name === 'game';
/** The next waiting toast, once nothing else shows and nothing holds the floor. */
const nextToast = (get: () => CityState) => {
  const s = get();
  if (toastQueue.length && !s.toasts.some((t) => !t.leaving) && !toastsHeld(s)) s.showToast(toastQueue.shift()!);
};
/** A big card takes the floor: a toast already up goes back to the front of the queue and shows after the card. */
const stepAside = (get: () => CityState) => {
  const up = get().toasts.filter((t) => !t.leaving && t.kind !== 'error');
  for (const t of up.reverse()) toastQueue.unshift({ icon: t.icon, text: t.text, kind: t.kind, ms: t.ms, ...(t.group ? { group: t.group, items: t.items } : {}) });
  for (const t of up) get().dismissToast(t.id);
};
const groupText = (items: string[]) =>
  items.length === 1 ? `New landmark discovered: ${items[0]}! Construction has started.` : `${items.length} new landmarks: ${listOf(items)}. Construction has started.`;

/** Known backend error codes (optional `code` on ErrorEvent) → friendly text. */
const ERROR_TEXT: Record<string, string> = {
  quota: 'You’ve used today’s AI helpers — back tomorrow!',
  auth: 'Please sign in again',
  unlinked: 'Connect your AWS account in the Deploy tab',
  paused: 'The city’s AI helpers are taking a break — try again later.',
};

/** What to show the player for a backend `error` event. */
export const errorText = (e: { message: string }) => {
  const code = (e as { code?: string }).code;
  return (code && ERROR_TEXT[code]) || e.message;
};

export type View = { name: 'world' } | { name: 'city' } | { name: 'interior'; districtId: string } | { name: 'game'; game: GameId };

export interface AgentStatus {
  state: 'idle' | 'working';
  service?: string;
  detail?: string;
}

export interface AccountState {
  linked: boolean;
  accountId?: string;
  region?: string;
  linkUrl?: string;
  externalId?: string;
  message?: string;
  /** The server wants an authenticator app on before linking (error code mfa_required). */
  mfaRequired?: boolean;
  /** Bumped on every account.status, so a repeated reply (same message) still settles a pending button. */
  seq?: number;
}

export interface DeployView {
  deployId: string;
  templateId: string;
  stackName: string;
  region: string;
  changes: DeployChange[];
  costNote?: string;
  status: 'preview' | DeployStatusEvent['status'];
  outputs?: Record<string, string>;
  message?: string;
  /** v2.3: this change fixes a finding; `rollback` says how to undo it in the console. */
  findingId?: string;
  rollback?: string;
  /** The player must type this exactly to approve. */
  confirmText?: string;
}

/** A finding as the city keeps it: `seenAt` orders the City care list (newest first). */
export interface FindingView extends CityFinding {
  seenAt: number;
}
export type Inventory = Omit<CityInventoryEvent, 'type'>;
/** A finding.* request in flight (its button spins until the answer lands). */
export interface CareRequest {
  kind: 'explain' | 'fix';
  requestId: string;
}

/** A Correction of Error entry, written from a real failed task (task.done ok=false). */
export interface CoeEntry {
  id: string;
  at: number;
  taskId: string;
  prompt: string;
  agentId?: string;
  failedStep?: string;
  result?: string;
}

/** Day 1 Quarter progress (badges, COE board). Device-local: kept in localStorage, not in the synced Progress. */
export interface CultureState {
  badges: string[];
  coe: CoeEntry[];
  expoBest?: number;
}
const CULTURE_KEY = 'aws-city-culture';
const COE_MAX = 30;
const loadCulture = (): CultureState => {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(CULTURE_KEY) ?? 'null');
    if (v && Array.isArray(v.badges) && Array.isArray(v.coe)) return v;
  } catch {
    /* fresh start */
  }
  return { badges: [], coe: [] };
};
const saveCulture = (c: CultureState) => {
  try {
    globalThis.localStorage?.setItem(CULTURE_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable (tests) */
  }
};

/** Display preferences (this device only). */
export interface Prefs {
  /** Show agents talking to each other when no task of yours is running. */
  chatter: boolean;
  /** How much of the side panel the city takes. */
  stage: 'compact' | 'tall';
  /** The Region whose city you last chose on the world map (none yet: the game opens on the world map). */
  region?: string;
  /** Show the map's technical labels (AZ IDs, network notes, distance signs). Off: the city stays calm. */
  mapDetails?: boolean;
  /** The minimap (M): absent = the surface's default (shown in the full tab, hidden in the side panel). */
  minimap?: boolean;
  /** Accessibility: text size in percent (UI and the labels in the city); absent = 100. */
  textSize?: 125 | 150;
  /** Accessibility: stronger colours for muted text, lines and focus rings. */
  contrast?: boolean;
  /** Accessibility: a plain, wide sans-serif everywhere, the pixel headings included. */
  easyFont?: boolean;
  /** Accessibility: games without a clock (rounds end on Done; reaction windows and spawns slower). */
  relaxed?: boolean;
  /** Accessibility: a short caption for each sound effect. */
  captions?: boolean;
  /** "I already build on AWS": every area open from the start, and the deeper "For AWS learners" text shown first. */
  builder?: boolean;
  /** The certification the player is working towards (shared/certifications.json id): Home shows how close they are. */
  certGoal?: string;
  /** Each workshop's names (`<table>` → `orders`) and terminal history, so ↑, Tab and CloudShell's check reuse them. */
  workshopMemory?: Record<string, WorkshopMemory>;
  /** The season the city is drawn in (spring, summer, autumn, winter: a test override, CityScene); absent = the calendar's. */
  season?: string;
  /** v2.15: the season road a finished shift fills (src/state/season.ts id); absent = this month's. Was `season` before round 3 step 5. */
  road?: string;
  /** v2.15: the City Lights window colour (a glow cosmetic id the player owns); absent = warm gold. */
  glow?: string;
  /** v2.15: the gentle return note on Home (one positive line a day). Opt-in: off unless turned on in My City. */
  returnNote?: boolean;  /** Simple mode (src/state/simple.ts): a plain To-do list, the extras hidden. Absent = on (the default); ⋯ → Show everything turns it off. */
  simple?: boolean;
}
export interface WorkshopMemory {
  names: Record<string, string>;
  history: string[];
}
const NAME_KEY = /^[a-z0-9-]{1,40}$/;
/** What a workshop remembers, cleaned (it comes from storage): short names, the last 30 lines. */
export const cleanWorkshopMemory = (v: unknown): Record<string, WorkshopMemory> | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const out: Record<string, WorkshopMemory> = {};
  for (const [id, m] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
    if (!/^[a-z0-9-]{1,60}$/.test(id) || !m || typeof m !== 'object') continue;
    const { names, history } = m as { names?: unknown; history?: unknown };
    const n: Record<string, string> = {};
    if (names && typeof names === 'object')
      for (const [k, x] of Object.entries(names)) if (NAME_KEY.test(k) && typeof x === 'string' && x.length > 0 && x.length <= 200) n[k] = x;
    const h = Array.isArray(history) ? history.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 2000).slice(-30) : [];
    out[id] = { names: n, history: h };
  }
  return Object.keys(out).length ? out : undefined;
};
const PREFS_KEY = 'aws-city-prefs';
const loadPrefs = (): Prefs => {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(PREFS_KEY) ?? 'null');
    if (v && typeof v === 'object')
      return {
        chatter: !!v.chatter,
        stage: v.stage === 'tall' ? 'tall' : 'compact',
        ...(v.mapDetails === true ? { mapDetails: true } : {}),
        ...(typeof v.minimap === 'boolean' ? { minimap: v.minimap } : {}),
        ...(typeof v.region === 'string' && /^[a-z]{2}(-[a-z]+)+-\d$/.test(v.region) ? { region: v.region } : {}),
        ...(v.textSize === 125 || v.textSize === 150 ? { textSize: v.textSize } : {}),
        ...(v.contrast === true ? { contrast: true } : {}),
        ...(v.easyFont === true ? { easyFont: true } : {}),
        ...(v.relaxed === true ? { relaxed: true } : {}),
        ...(v.captions === true ? { captions: true } : {}),
        ...(v.builder === true ? { builder: true } : {}),
        ...(typeof v.certGoal === 'string' && /^[a-z0-9-]{3,60}$/.test(v.certGoal) ? { certGoal: v.certGoal } : {}),
        ...(cleanWorkshopMemory(v.workshopMemory) ? { workshopMemory: cleanWorkshopMemory(v.workshopMemory) } : {}),
        // The road pick moved from `season` (which also named the art's season) to `road`: an old road pick moves over.
        ...(typeof v.season === 'string' && /^[a-z0-9-]{3,40}$/.test(v.season) && !seasonById(v.season) ? { season: v.season } : {}),
        ...(typeof v.road === 'string' && seasonById(v.road) ? { road: v.road } : typeof v.season === 'string' && seasonById(v.season) ? { road: v.season } : {}),
        ...(typeof v.glow === 'string' && /^glow-[a-z]{2,20}$/.test(v.glow) ? { glow: v.glow } : {}),
        ...(v.returnNote === true ? { returnNote: true } : {}),
        ...(v.simple === false ? { simple: false } : {}),
      };
  } catch {
    /* defaults */
  }
  return { chatter: false, stage: 'compact' };
};

export type BuildTool = 'place' | 'move' | 'remove';
export interface BuildState {
  tool: BuildTool;
  kind?: string;
  /** The id of the prop picked up to move (the ghost carries it). */
  moving?: string;
  undo: UndoStep[];
  /** The last refusal or result, for the drawer's status line (and screen readers). */
  note?: string;
}
export interface BuildOutcome {
  ok: boolean;
  action?: 'placed' | 'picked' | 'moved' | 'removed';
  why?: string;
}

export type SnapState = 'idle' | 'snapping' | 'needs-permission' | 'failed' | 'unavailable';

export interface CityState {
  backendKind: 'mock' | 'server';
  deployMode: 'templates' | 'guarded';
  backendStatus: ConnectionStatus;
  focus?: PageFocus;
  progress: Progress;
  agents: Record<string, AgentStatus>;
  tasks: Record<string, TaskView>;
  taskOrder: string[];
  feed: FeedItem[];
  chats: Record<string, ChatMsg[]>;
  toasts: Toast[];
  view: View;
  /** The Region whose city you're in (each Region is its own city; the world map picks one). */
  cityRegion: string;
  selected?: string;
  autoSnap: boolean;
  lastClassified?: { serviceIds: string[]; summary: string };
  snap: SnapState;
  lastSnapshot?: string;
  account: AccountState;
  deploys: Record<string, DeployView>;
  agentLevels: Record<string, number>;
  /** v2.3 city care: what's in the account, the findings by id, and the one whose card is open. */
  inventory?: Inventory;
  /** v2.5: the month-to-date bill (or why it can't be read), while the bill is on. Narrow on `unavailable`. */
  bill?: CityBillEvent;
  /** v2.5: the player turned the bill on (Progress.bill; synced across surfaces). */
  billOn: boolean;
  /** Turn the bill on or off (persisted in Progress; app/runtime.ts relays it to the backend as bill.enable). */
  setBill(on: boolean): void;
  /** v2.8: live traffic from CloudWatch (or why it can't be read), while it's on. Narrow on `unavailable`. */
  flow?: CityFlowEvent;
  /** v2.8: the player turned live traffic on (Progress.flow; synced across surfaces). */
  flowOn: boolean;
  /** Turn live traffic on or off (persisted in Progress; app/runtime.ts relays it as flow.enable). */
  setFlow(on: boolean): void;
  /** v2.11: who's in this Region's city now (or the demo's practice mayors). */
  presence?: PresenceStateEvent;
  /** v2.11: leaderboards by board id, as last read; the one whose card is open. */
  boards: Record<string, LeaderboardStateEvent>;
  boardOpen?: string;
  openBoard(board?: string): void;
  /** v2.11: save (or, with no design, delete) a sandbox design (at most MAX_DESIGNS, the oldest drops off). */
  saveDesign(id: string, design?: SavedDesign): void;
  /** v2.11: turn the public profile on or off (a name is generated the first time; `reroll` picks a new one). */
  setPublic(on: boolean, reroll?: boolean): void;
  /** Launch Day (src/ui/launch/LaunchDay.tsx), open or closed. */
  launchOpen: boolean;
  openLaunch(open: boolean): void;
  /** My City (src/ui/Collection.tsx): everything earned, open or closed. */
  collectionOpen: boolean;
  openCollection(open: boolean): void;
  /** A Console Copilot task started from a workshop step: when it finishes well, the step is done for real. */
  copilotFor?: { taskId: string; workshopId: string; stepId: string };
  /** v2.10: the workshop whose panel is open (src/ui/Workshop.tsx). */
  workshopOpen?: string;
  openWorkshop(id?: string): void;
  /** A workshop just finished: its "Workshop complete" card holds the floor (src/ui/WorkshopDone.tsx), toasts wait. */
  workshopDone?: string;
  /** Holds (or, with no id, releases) the floor for a finished workshop's card. */
  celebrateWorkshop(workshopId?: string): void;
  /** v2.10: the last check of each step in the account (`<workshop>/<step>`), while one is pending or after it answered. */
  workshopChecks: Record<string, { pending: boolean; ok?: boolean; detail?: string }>;
  /** Marks a check as sent (app/runtime.ts sends workshop.verify). */
  noteWorkshopCheck(workshopId: string, stepId: string): void;
  /**
   * A workshop step done in practice or for real: pays its building (src/learning/workshopRewards.ts) once per mode,
   * a star less for each hint taken. In the offline demo "real" counts as practice. Returns the stars paid.
   */
  workshopStep(workshopId: string, stepId: string, mode: StepMode, hints?: number): number;
  /** Keeps a workshop's names and a terminal line (prefs.workshopMemory). */
  rememberWorkshop(workshopId: string, patch: { names?: Record<string, string>; line?: string }): void;
  /** v2.10: an AWS North Hall talk's check passed: its buildings grow (TALK_XP each), once per talk. */
  passTalk(talkId: string): boolean;
  /**
   * Build mode (src/state/buildmode.ts, src/ui/BuildDrawer.tsx, src/game/BuildLayer.ts): set while the player decorates
   * this city. The tool, the item picked (its kind, a sprite name), a prop picked up to move, the session's undo steps.
   */
  build?: BuildState;
  setBuild(on: boolean): void;
  buildPick(kind?: string): void;
  buildTool(tool: BuildTool): void;
  /** R: the picked item (or the prop being moved) turns, or takes its next colour. */
  buildTurn(): void;
  /** A tap on tile (x, y) with the current tool on this ground; the result says what happened (or why not). */
  buildAt(x: number, y: number, ground: Ground): BuildOutcome;
  buildUndo(): void;
  /** City Clients (src/ui/clients/ClientsPanel.tsx): open on a business (its id) or on the list (''); undefined: closed. */
  clientsOpen?: string;
  openClients(id?: string): void;
  /** The business whose open jobs show as station markers on the map and minimap (the last one opened). */
  clientFocus?: string;
  /** The side job whose runner is open (src/ui/clients/ClientTask.tsx). */
  clientTaskOpen?: string;
  openClientTask(taskId?: string): void;
  /** A Console Copilot task started from a "Click it" side job: when it finishes well, the job is done. */
  copilotJob?: { taskId: string; jobId: string };
  /** A business just finished a level: its celebration card holds the floor (toasts wait). */
  clientDone?: { clientId: string; level: number };
  /** Holds (or, with nothing, releases) the floor for a business's level-up card. */
  celebrateClient(done?: { clientId: string; level: number }): void;
  /**
   * v2.13: a side job done. Its stars go to its services once ever (src/world/clients.ts completeTask); the level's last
   * job also finishes the level (its bonus, its card, the site grows). Returns the stars paid (0: done before).
   */
  clientTaskDone(taskId: string): number;
  findings: Record<string, FindingView>;
  findingOpen?: string;
  openFinding(id?: string): void;
  /** v2.6: the public AWS Health Dashboard and What's New (the same for everyone; kept on sign-out). */
  health?: AwsHealthEvent;
  news?: AwsNewsEvent;
  /** The incident whose card is open. */
  incidentOpen?: string;
  openIncident(id?: string): void;
  /** A quest's choose step (by id) whose card is open. */
  choiceOpen?: string;
  /** A quest just finished: its celebration card is showing (src/ui/Celebrate.tsx). */
  celebration?: string;
  openChoice(id?: string): void;
  /** Shows (or, with no id, closes) a finished quest's celebration card. */
  celebrate(questId?: string): void;
  /** The player picked the right answer: the step is done. */
  passChoice(id: string): void;
  /**
   * City care is unlocked (src/state/ladder.ts `care`): held findings start to show, one at a time.
   * Until then findings wait out of sight (a first session isn't a wall of problems).
   */
  careReleased: boolean;
  /** `all`: show every held finding now (a linked account does this itself; dev and smoke ask for it). */
  releaseCare(opts?: { all?: boolean }): void;
  careRequests: Record<string, CareRequest>;
  /** The citizen's last answer about a finding (Explain, or why a fix can't run yet), by finding id. */
  explanations: Record<string, string>;
  noteCare(findingId: string, req?: CareRequest): void;
  /** A city.finding: open → its citizen walks over; resolved after your fix → XP for the citizen and the landmark. */
  applyFinding(f: CityFinding): void;
  /** Teach citizens (XP in Progress.citizens); announces level-ups. */
  awardCitizens(awards: Award[]): void;
  /** Console Copilot task running in the player's console tab, if any. */
  copilotTaskId?: string;
  setCopilot(taskId?: string): void;
  culture: CultureState;
  prefs: Prefs;
  setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void;
  /** Award a badge once; returns true the first time. */
  awardBadge(id: string, label: string): boolean;
  recordExpo(score: number): void;

  // pure state transitions (no I/O — see app/runtime.ts for commands)
  setBackend(kind: 'mock' | 'server', status: ConnectionStatus, deployMode?: 'templates' | 'guarded'): void;
  setFocus(f: PageFocus): void;
  /** `quiet`: built because a finding or XP needed it — no toast, camera move or greeting. */
  /** `toast: false`: the caller says it its own way (browsing a console page). */
  discover(serviceId: string, opts?: { quiet?: boolean; toast?: boolean }): void;
  addXp(serviceId: string, amount: number): void;
  loadProgress(p: Progress): void;
  applyServerEvent(e: ServerEvent): void;
  addTask(taskId: string, prompt: string): void;
  addUserChat(districtId: string, requestId: string, text: string): void;
  log(item: Omit<FeedItem, 'id' | 'at'>): void;
  /** `first`: the player's own moment (a quest step done): it goes to the front of the queue and is never trimmed. */
  toast(icon: string, text: string, kind?: Toast['kind'], merge?: { group: 'discover'; item: string }, building?: { serviceId: string; detail?: string }, opts?: { first?: boolean }): void;
  /** Drop every toast, shown or waiting. */
  clearToasts(): void;
  /** Internal: put one toast on screen now (toast() decides when). */
  showToast(t: Omit<Toast, 'id'>): void;
  setMfaRequired(on: boolean): void;
  /** A sign-in window is open (buttons disable until it settles). */
  signingIn: boolean;
  setSigningIn(on: boolean): void;
  /** Signed out (here or in another surface): forget everything that belonged to that player. */
  resetSession(): void;
  /** Coach-mark tour overlay (UI-only, not persisted here — the done flag lives in localStorage). */
  tourOpen: boolean;
  setTourOpen(open: boolean): void;
  dismissToast(id: number): void;
  setView(v: View): void;
  /** Zoom out to the world map. */
  openWorld(): void;
  /** Pick a Region on the world map and zoom into its city (remembered for next time). */
  enterRegion(code: string): void;
  select(id?: string): void;
  /** The puzzle a quest step wants open on the Build tab. */
  focusPuzzle?: string;
  setFocusPuzzle(id?: string): void;
  setAutoSnap(on: boolean): void;
  setSnap(s: SnapState, snapshot?: string): void;
  // learning
  /**
   * Grades a card: its schedule moves on, its building grows, and a quest's cards step counts it (every grade, Again
   * too). `practice`: a quest top-up of a card that isn't due (src/learning/srs.ts questPracticeDeck): it counts and
   * pays the reviewed-card stars but leaves the schedule alone. Returns the stars paid and whether the card was just
   * remembered for a week (its one-time bonus is in `stars`).
   */
  reviewCard(cardId: string, grade: Grade, opts?: { practice?: boolean }): { stars: number; remembered: boolean };
  recordPuzzle(puzzleId: string, score: number, passed: boolean, pillars?: Partial<Record<PillarKey, number>>): void;
  /**
   * A finished round: `best` keeps the best ever; `scored` counts rounds above 0 (the crown's game step); a timed round
   * (the default; `timed: false` for Games without a clock) also keeps this ISO week's `bestTimed` for the leaderboard.
   * v2.14: a round that scored pays City Coins (wallet.ts roundCoins: COIN_PAY.round, half after the day's first
   * FULL_ROUNDS_A_DAY unless a new best, none after HALF_ROUNDS_A_DAY more; the scene counted the round with countRound
   * first). Returns the coins paid.
   */
  recordGame(game: GameId | 'launch', score: number, opts?: { timed?: boolean }): number;
  startQuest(questId: string): void;
  /** Advance any active quest whose current step matches. */
  questEvent(match: (step: QuestStep) => boolean, countable?: boolean): void;
  /** What the player learned today (device-local; the streak itself is in Progress). */
  today?: DayLog;
  /** A learning action (a card reviewed, a puzzle passed, a fix approved): counts toward today and the streak. */
  noteLearning(kind: LearningKind): void;
  /** Kai reached a landmark (walked there): a quest's visit step counts on arrival, not on a tap. */
  arrive(id: string): void;
  /** Today's shift: stars earned building by building (device-local, src/state/next.ts shiftSummary). */
  shift?: ShiftLog;
  /** v2.9: Kai picked up a golden token (src/world/tokens.ts). False if it was already found. */
  collectFind(id: string): boolean;

  // ── Wallet (v2.14, src/state/wallet.ts): City Coins. Read them with coins(progress) / coinsToday(progress, day). ──
  /** Earn `n` City Coins (whole, > 0) for `reason` (a short phrase, kept for the feed). Returns the coins added. */
  earnCoins(n: number, reason: string): number;
  /** Spend `n` City Coins; false (and nothing spent) when there aren't enough. */
  spendCoins(n: number): boolean;
  /** Today's shift is done: pays COIN_PAY.shift once a day (Progress.wallet.shift). Returns the coins added (0 if already paid). */
  payShift(): number;

  // ── Loops that bring you back (v2.15, round 3 step 2): City Lights, season roads, supply drops, the Codex ──
  /** Light tonight's window (src/state/lights.ts; noteLearning calls it). True when it just lit (the day's first). */
  lightDay(): boolean;
  /** Today's shift is done: it fills the picked season road once a day (`grew`: the shift's buildings). Points added. */
  fillSeason(grew: readonly string[]): number;
  /** Claim step `i` of season road `id` (default: the picked one). Undefined when it isn't reached or was claimed. */
  claimSeason(i: number, id?: string): RoadReward | undefined;
  /**
   * Open today's Daily Supply Drop (once a day, after the shift), or (`overtime`) the overtime goal's bonus crate (once
   * a day, after it's done). Undefined when it was already opened today. `spare`: one more copy of an owned decoration.
   */
  openDrop(opts?: { overtime?: boolean }): { item?: Cosmetic; spare?: boolean } | undefined;
  /**
   * A combo was found (CityScene): into the Codex once ever, a toast with its fact and COIN_PAY.combo. False if known.
   * `quiet` (a combo found while the city slept, or already standing when it loads): the Codex fills and the coins are
   * paid, with no toast or coin animation.
   */
  discoverCombo(id: string, opts?: { quiet?: boolean }): boolean;
}

let nextId = 1;
const FEED_MAX = 120;
const VISIT_XP_COOLDOWN_MS = 60_000;
/** Stars a console visit pays (at most once a minute per service). */
const VISIT_XP = 2;

/** "Amazon S3" → "S3", "AWS Lambda" → "Lambda": what the player calls the console they opened. */
export const consoleName = (serviceId: string) => (serviceById(serviceId)?.name ?? serviceId).replace(/^(Amazon|AWS)\s+/, '');

/** "You opened the S3 console: S3 Lake +2⭐" (or "…S3 Lake is going up!" when it found the building). */
export function browsedText(serviceId: string, stars: number) {
  const place = placeFor(serviceId)?.place ?? consoleName(serviceId);
  return `You opened the ${consoleName(serviceId)} console: ${place} ${stars > 0 ? `+${stars}⭐` : 'is going up!'}`;
}

/** The "browsing grew it" toast: the building's icon, what grew, and its growth line. */
function browsedToast(get: () => CityState, serviceId: string, stars: number) {
  const s = get();
  get().toast(stars > 0 ? '⭐' : '🚧', browsedText(serviceId, stars), 'info', undefined, { serviceId, detail: growthLine(growthOf(s.progress, serviceId, s.cityRegion)) });
}
const lastVisitXp = new Map<string, number>();


const TODAY_KEY = 'awscity.today';
// ── Today's shift (src/state/next.ts): stars by building today, for the end-of-shift card ──
const SHIFT_KEY = 'awscity.shift';
const loadShift = (): ShiftLog | undefined => {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(SHIFT_KEY) ?? 'null') as ShiftLog | null;
    return v && typeof v.day === 'string' && v.stars && typeof v.stars === 'object' ? v : undefined;
  } catch {
    return undefined;
  }
};
const noteShift = (get: () => CityState, set: (p: Partial<CityState>) => void, serviceId: string, stars: number) => {
  const shift = bumpShift(get().shift, serviceId, stars, dayKey());
  try {
    globalThis.localStorage?.setItem(SHIFT_KEY, JSON.stringify(shift));
  } catch {
    /* storage unavailable */
  }
  set({ shift });
};
const loadToday = (): DayLog | undefined => {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(TODAY_KEY) ?? 'null') as DayLog | null;
    return v && typeof v.day === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
};

// ── Finding pacing: held until city care unlocks, then dripped in one at a time ──

/** Findings the player hasn't been shown yet, by id (insertion order = arrival order). Resolved events update them. */
const heldFindings = new Map<string, CityFinding>();
/** At most this many open findings on screen before the next one waits. */
export const MAX_OPEN_FINDINGS = 3;
/** The next held finding shows when the last one shown is opened, or after this long. */
export const DRIP_MS = 90_000;
let dripTimer: ReturnType<typeof setTimeout> | undefined;
/** The finding last dripped in: opening its card lets the next one in. */
let dripWaitingFor: string | undefined;
const stopDrip = () => {
  clearTimeout(dripTimer);
  dripTimer = undefined;
  dripWaitingFor = undefined;
};
/**
 * Hardware-choice advice (x86 → Graviton, an older instance generation, an older disk type) means little in a
 * beginner's first minutes: it waits until a quest is finished, and comes after everything else (round 3 step 5).
 */
export const ADVANCED_RULES: ReadonlySet<string> = new Set(['ec2-graviton-candidate', 'ec2-previous-generation', 'ebs-gp2']);
const advanced = (f: CityFinding) => ADVANCED_RULES.has(f.ruleId);
/** Held findings still open, lowest severity first, then oldest (a gentle start); the advanced ones last. */
const heldOpen = () =>
  [...heldFindings.values()].filter((f) => f.status === 'open').sort((a, b) => Number(advanced(a)) - Number(advanced(b)) || severityRank(a.severity) - severityRank(b.severity));
/** Held findings not shown yet (tests and the smoke check this). */
export const heldFindingIds = () => heldOpen().map((f) => f.id);


export const useCity = create<CityState>()((set, get) => ({
  backendKind: 'mock',
  deployMode: 'templates',
  backendStatus: 'disconnected',
  progress: emptyProgress(),
  agents: {},
  tasks: {},
  taskOrder: [],
  feed: [],
  chats: {},
  toasts: [],
  // First time: the world map, to pick a Region. After that: straight back into your last Region's city.
  view: loadPrefs().region ? { name: 'city' } : { name: 'world' },
  cityRegion: loadPrefs().region ?? REGIONS.cityRegion,
  autoSnap: false,
  snap: 'idle',
  account: { linked: false },
  deploys: {},
  agentLevels: {},
  findings: {},
  openIncident: (id) => set({ incidentOpen: id }),
  openChoice: (id) => set({ choiceOpen: id }),
  celebrate: (questId) => {
    if (questId) stepAside(get);
    set({ celebration: questId });
    if (!questId) nextToast(get);
  },
  celebrateWorkshop: (workshopId) => {
    if (workshopId) stepAside(get);
    set({ workshopDone: workshopId });
    if (!workshopId) nextToast(get);
  },
  passChoice: (id) => get().questEvent((st) => st.kind === 'choose' && st.id === id),
  flowOn: false,
  setFlow: (on) => {
    const p = get().progress;
    if (!!p.flow === on) return;
    set({ flowOn: on, progress: { ...p, flow: on, updatedAt: new Date().toISOString() }, ...(on ? {} : { flow: undefined }) });
  },
  billOn: false,
  setBill: (on) => {
    const p = get().progress;
    if (!!p.bill === on) return;
    set({ billOn: on, progress: { ...p, bill: on, updatedAt: new Date().toISOString() }, ...(on ? {} : { bill: undefined }) });
  },
  careRequests: {},
  explanations: {},
  workshopChecks: {},
  collectionOpen: false,
  launchOpen: false,
  openLaunch: (launchOpen) => set({ launchOpen }),
  boards: {},
  openBoard: (boardOpen) => set({ boardOpen }),
  saveDesign: (id, design) => {
    const p = get().progress;
    const designs = { ...p.designs };
    if (design) designs[id] = design;
    else delete designs[id];
    const ids = Object.keys(designs).sort((a, b) => designs[b].updatedAt.localeCompare(designs[a].updatedAt));
    for (const old of ids.slice(MAX_DESIGNS)) delete designs[old];
    set({ progress: { ...p, designs, updatedAt: new Date().toISOString() } });
  },
  setPublic: (on, reroll) => {
    const p = get().progress;
    const name = !reroll && p.profile?.name ? p.profile.name : mayorName();
    set({ progress: { ...p, profile: { public: on, name }, updatedAt: new Date().toISOString() } });
  },
  openCollection: (collectionOpen) => set({ collectionOpen }),
  openWorkshop: (workshopOpen) => set({ workshopOpen }),
  openClients: (id) => set(id ? { clientsOpen: id, clientFocus: id } : { clientsOpen: id }),
  setBuild: (on) => set({ build: on ? (get().build ?? { tool: 'place', undo: [] }) : undefined, ...(on ? { selected: undefined } : {}) }),
  buildPick: (kind) => {
    const b = get().build;
    if (b) set({ build: { ...b, kind, tool: 'place', moving: undefined, note: undefined } });
  },
  buildTool: (tool) => {
    const b = get().build;
    if (b) set({ build: { ...b, tool, moving: undefined, note: undefined } });
  },
  buildTurn: () => {
    const b = get().build;
    if (b?.kind && itemOfKind(b.kind)?.variants.length !== 1) set({ build: { ...b, kind: nextVariant(b.kind) } });
  },
  buildAt: (x, y, ground) => {
    const b = get().build;
    if (!b) return { ok: false };
    const { progress: p, cityRegion: region } = get();
    const before = p.decor?.[region];
    const apply = (r: BuildResult, label: string, action: BuildOutcome['action'], next: Partial<BuildState> = {}): BuildOutcome => {
      if (!r.ok) {
        set({ build: { ...b, note: r.why } });
        return { ok: false, why: r.why };
      }
      const now = new Date().toISOString();
      set({ progress: { ...r.progress, updatedAt: now }, build: { ...b, ...next, undo: pushUndo(b.undo, { region, before, label, ...(r.coins ? { coins: r.coins } : {}), ...(r.prop ? { prop: r.prop } : {}) }), note: label } });
      return { ok: true, action };
    };
    if (b.tool === 'remove') {
      const hit = propAt(cityDecor(p, region).props, x, y);
      if (!hit) return (set({ build: { ...b, note: 'Tap a decoration you placed to remove it' } }), { ok: false, why: 'nothing here' });
      const r = removeProp(p, region, hit.id);
      return apply(r, r.ok ? `Removed: ${itemOfKind(hit.kind)?.name ?? 'decoration'}${r.coins ? ` (+${r.coins} 🪙 back)` : ''}` : '', 'removed');
    }
    if (b.tool === 'move') {
      if (!b.moving) {
        const hit = propAt(cityDecor(p, region).props, x, y);
        if (!hit) return (set({ build: { ...b, note: 'Tap a decoration you placed to pick it up' } }), { ok: false, why: 'nothing here' });
        set({ build: { ...b, moving: hit.id, kind: hit.kind, note: `Moving: ${itemOfKind(hit.kind)?.name ?? 'decoration'}. Tap where it goes.` } });
        return { ok: true, action: 'picked' };
      }
      const r = moveProp(p, region, ground, b.moving, x, y, { kind: b.kind });
      return apply(r, `Moved: ${itemOfKind(b.kind ?? '')?.name ?? 'decoration'}`, 'moved', { moving: undefined });
    }
    if (!b.kind) return (set({ build: { ...b, note: 'Pick something to build first' } }), { ok: false, why: 'nothing picked' });
    const r = placeProp(p, region, ground, b.kind, x, y);
    // A crate item bought to place it is the player's for good (undo gives back the placement, not the purchase).
    const bought = r.ok && r.bought ? ` Bought for ${r.bought.coins} 🪙: yours to keep.` : '';
    return apply(r, r.ok ? `Built: ${itemOfKind(b.kind)?.name ?? 'decoration'}${r.coins ? ` (${r.coins} 🪙)` : ''}${bought}` : '', 'placed');
  },
  buildUndo: () => {
    const b = get().build;
    const step = b?.undo.at(-1);
    if (!b || !step) return;
    set({ progress: { ...undoStep(get().progress, step), updatedAt: new Date().toISOString() }, build: { ...b, moving: undefined, undo: b.undo.slice(0, -1), note: `Undone: ${step.label.split(' (')[0]}` } });
  },
  openClientTask: (clientTaskOpen) => set(clientTaskOpen ? { clientTaskOpen, clientFocus: taskById(clientTaskOpen)?.client.id } : { clientTaskOpen }),
  celebrateClient: (done) => {
    if (done) stepAside(get);
    set({ clientDone: done });
    if (!done) nextToast(get);
  },
  clientTaskDone: (taskId) => {
    const ref = taskById(taskId);
    if (!ref) return 0;
    const r = completeTask(get().progress, taskId, dayKey());
    const paid = Object.values(r.pay).reduce((a, n) => a + n, 0) + Object.values(r.levelUp?.pay ?? {}).reduce((a, n) => a + n, 0);
    if (!paid) return 0;
    const id = ref.client.id;
    // One channel: the level's card holds the floor before any star lands, so tier-up logs and badges wait behind it.
    if (r.levelUp) get().celebrateClient({ clientId: id, level: r.levelUp.level.level });
    set({ progress: { ...get().progress, clients: { ...get().progress.clients, [id]: r.next }, updatedAt: new Date().toISOString() } });
    for (const [svc, n] of Object.entries(r.pay)) get().addXp(svc, n);
    for (const [svc, n] of Object.entries(r.levelUp?.pay ?? {})) get().addXp(svc, n);
    get().noteLearning('jobs');
    // v2.14: a job pays City Coins too (its level's last job a bonus), once ever like its stars.
    const coins = get().earnCoins(COIN_PAY.job + (r.levelUp ? COIN_PAY.jobLevel : 0), 'a side job');
    get().log({ kind: 'system', text: `🏢 ${clientName(ref.client)}: “${ref.task.title}” done. +${paid} ⭐ · +${coins} 🪙` });
    if (r.levelUp) bus.emit('clientLevelUp', { clientId: id, level: r.levelUp.level.level });
    return paid;
  },
  passTalk: (talkId) => {
    const t = talkById(talkId);
    const p = get().progress;
    if (!t || p.talks?.[talkId]) return false;
    set({ progress: { ...p, talks: { ...p.talks, [talkId]: dayKey() }, updatedAt: new Date().toISOString() } });
    for (const id of t.serviceIds) get().addXp(id, TALK_XP);
    get().noteLearning('talks');
    return true;
  },
  noteWorkshopCheck: (workshopId, stepId) => set((s) => ({ workshopChecks: { ...s.workshopChecks, [`${workshopId}/${stepId}`]: { pending: true } } })),
  workshopStep: (workshopId, stepId, asked, hints = 0) => {
    const w = workshopById(workshopId);
    if (!w?.steps.some((st) => st.id === stepId)) return 0;
    const mode = honestMode(asked, get().backendKind === 'mock');
    const { progress } = get();
    const prev = progress.workshops?.[workshopId];
    const stars = stepReward(prev, stepId, mode, hints);
    const { next, finished } = withStep(prev, w.steps.map((st) => st.id), stepId, mode, dayKey());
    // A quest's workshop step counts any step done there, a step done again included (so a finished one never sticks).
    get().questEvent((st) => st.kind === 'workshop' && st.workshopId === workshopId);
    if (JSON.stringify(next) === JSON.stringify(prev)) {
      bus.emit('workshopStep', { workshopId, stepId, mode, stars: 0, finished: false });
      return 0;
    }
    // One celebration: the "Workshop complete" card holds the floor from before the progress lands (so the badge it
    // earns waits as a toast) until the player closes it.
    if (finished) get().celebrateWorkshop(workshopId);
    set({ progress: { ...get().progress, workshops: { ...get().progress.workshops, [workshopId]: next }, updatedAt: new Date().toISOString() } });
    get().addXp(w.serviceId, stars + (finished ? FINISH_XP : 0));
    // v2.14: a step that pays stars pays City Coins too (each step once per mode, ever).
    if (stars > 0) get().earnCoins(COIN_PAY.workshopStep, 'a workshop step');
    get().noteLearning('labs');
    bus.emit('workshopStep', { workshopId, stepId, mode, stars, finished });
    if (finished) {
      get().log({ kind: 'system', text: `🏗️ ${w.title}: workshop finished. ${placeFor(w.serviceId)?.place ?? w.serviceId} is established.` });
      bus.emit('workshopDone', { workshopId, serviceId: w.serviceId });
    }
    return stars;
  },
  rememberWorkshop: (workshopId, { names, line }) => {
    const all = get().prefs.workshopMemory ?? {};
    const cur = all[workshopId] ?? { names: {}, history: [] };
    const kept = Object.fromEntries(Object.entries(names ?? {}).filter(([k, v]) => NAME_KEY.test(k) && v.trim() && v.length <= 200 && !/^<.*>$/.test(v)));
    const history = line?.trim() && line.length <= 2000 ? [...cur.history.filter((h) => h !== line.trim()), line.trim()].slice(-30) : cur.history;
    const merged = { names: { ...cur.names, ...kept }, history };
    if (JSON.stringify(merged) === JSON.stringify(cur)) return;
    get().setPref('workshopMemory', { ...all, [workshopId]: merged });
  },
  tourOpen: false,
  signingIn: false,
  culture: loadCulture(),
  prefs: loadPrefs(),
  today: loadToday(),
  shift: loadShift(),
  noteLearning: (kind) => {
    const day = dayKey();
    const today = bumpDay(get().today, kind, day);
    try {
      globalThis.localStorage?.setItem(TODAY_KEY, JSON.stringify(today));
    } catch {
      /* storage unavailable */
    }
    // City Lights first (a save from before v2.15 takes its windows from the streak as it was before today).
    get().lightDay();
    const p = get().progress;
    const streak = nextStreak(p.streak, day);
    set(streak === p.streak ? { today } : { today, progress: { ...p, streak, updatedAt: new Date().toISOString() } });
  },
  setPref: (key, value) => {
    const prefs = { ...get().prefs, [key]: value };
    set({ prefs });
    try {
      globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
  },

  awardBadge: (id, label) => {
    const c = get().culture;
    const p = get().progress;
    if (c.badges.includes(id) && p.badges?.[id]) return false;
    const culture = c.badges.includes(id) ? c : { ...c, badges: [...c.badges, id] };
    set({ culture, progress: { ...p, badges: { ...p.badges, [id]: p.badges?.[id] ?? dayKey() }, updatedAt: new Date().toISOString() } });
    saveCulture(culture);
    // The badge's moment is the store-wide watch in app/runtime.ts (watchBadges), so it's celebrated once.
    void label;
    return true;
  },
  recordExpo: (score) => {
    const c = get().culture;
    const culture = { ...c, expoBest: Math.max(score, c.expoBest ?? 0) };
    set({ culture });
    saveCulture(culture);
  },

  careReleased: false,
  openFinding: (findingOpen) => {
    set({ findingOpen });
    // The player looked at the last one shown: the next may come in.
    if (findingOpen && findingOpen === dripWaitingFor) {
      stopDrip();
      drip();
    }
  },
  releaseCare: (opts) => {
    if (!get().careReleased) set({ careReleased: true });
    // A real account's findings are real: all of them at once. The demo's (practice account too) come in gently.
    if (opts?.all || realAccount(get())) flushHeld();
    else drip();
  },
  noteCare: (findingId, req) => {
    const careRequests = { ...get().careRequests };
    if (req) careRequests[findingId] = req;
    else delete careRequests[findingId];
    set({ careRequests });
  },
  applyFinding: (f) => {
    const s = get();
    const prev = s.findings[f.id];
    const changed = prev?.status !== f.status;
    set({ findings: { ...s.findings, [f.id]: { ...f, seenAt: prev && !changed ? prev.seenAt : Date.now() } } });
    if (!changed) return;
    const c = citizenById(f.citizenId);
    if (f.status === 'open') {
      // The citizen needs a building to stand at: a finding on a place the city hasn't built yet builds it.
      if (serviceById(f.serviceId) && !isDiscovered(s.progress, f.serviceId, s.cityRegion)) get().discover(f.serviceId, { quiet: true });
      get().log({ kind: 'message', from: f.citizenId, to: 'user', text: `${prev ? 'It’s back' : 'I found a problem'} near ${placeFor(f.serviceId)?.place ?? 'town'}: ${f.title}.` });
      bus.emit('findingRaised', { finding: f });
      return;
    }
    if (!prev) return; // resolved before we ever saw it open: nothing to celebrate
    // Resolved after the player's approved fix (the fix's deploy is running or done), not on its own.
    const fixed = Object.values(get().deploys).some((d) => d.findingId === f.id && (d.status === 'creating' || d.status === 'complete'));
    if (fixed) {
      const p = get().progress;
      const first = !p.fixes?.[f.id];
      set({ progress: { ...p, fixes: { ...p.fixes, [f.id]: new Date().toISOString() }, updatedAt: new Date().toISOString() } });
      // XP once per finding, so a finding that comes back and is fixed again doesn't farm it.
      get().noteLearning('fixes');
      if (first) {
        get().awardCitizens([{ citizenId: f.citizenId, amount: CITIZEN_XP.fix, reason: 'you approved a fix' }]);
        get().addXp(f.serviceId, CITIZEN_XP.fix);
      }
      get().toast('✅', `Fixed by ${c?.name ?? 'the city'}: ${f.fix?.title ?? f.title}.`);
    }
    get().log({ kind: 'system', text: `✅ Fixed: ${f.title} (${f.resource.name}).` });
    bus.emit('findingResolved', { finding: f, fixed });
  },
  awardCitizens: (awards) => {
    const before = get().progress;
    const { progress, levelUps } = awardPure(before, awards);
    if (progress === before) return;
    set({ progress });
    for (const u of levelUps) {
      const c = citizenById(u.citizenId)!;
      // Say what earned it, then what they can do now.
      const text = `${c.name} is now a ${levelName(u.level)}${u.reason ? `: ${u.reason}` : ''}. ${levelCan(u.level)}.`;
      get().toast('🎓', text);
      get().log({ kind: 'system', text: `🎓 ${text}` });
      bus.emit('citizenLevelUp', u);
    }
  },

  setBackend: (backendKind, backendStatus, deployMode) => set(deployMode ? { backendKind, backendStatus, deployMode } : { backendKind, backendStatus }),

  setFocus: (focus) => {
    set({ focus });
    const id = focus.serviceId;
    if (!id) return;
    get().questEvent((st) => st.kind === 'visit' && st.serviceId === id);
    // Browsing a console page is a moment the player sees: a toast with the building's icon and how far it grew.
    const onConsole = focus.kind === 'console';
    if (!isDiscovered(get().progress, id, get().cityRegion)) {
      get().discover(id, { toast: !onConsole });
      if (onConsole) browsedToast(get, id, 0); // the discovery itself flies the camera there (CityScene.onDiscovered)
      return;
    }
    const now = Date.now();
    if (now - (lastVisitXp.get(id) ?? 0) > VISIT_XP_COOLDOWN_MS) {
      lastVisitXp.set(id, now);
      get().addXp(id, VISIT_XP);
      if (!onConsole) return;
      browsedToast(get, id, VISIT_XP);
      // One channel per moment: no camera move while a celebration card or a game holds the floor, or the city sleeps.
      const s = get();
      if (s.view.name === 'city' && !toastsHeld(s)) bus.emit('flyTo', { id });
    }
  },

  discover: (serviceId, opts) => {
    const { progress, cityRegion } = get();
    if (isDiscovered(progress, serviceId, cityRegion) || !serviceById(serviceId)) return;
    // Found in this Region's city (a global service: in every city), src/state/cities.ts.
    set({ progress: { ...withLandmark(progress, serviceId, cityRegion, { discovered: true, xp: landmarkOf(progress, serviceId, cityRegion)?.xp ?? 0 }), updatedAt: new Date().toISOString() } });
    const p = placeFor(serviceId);
    const quiet = !!opts?.quiet;
    if (!quiet && opts?.toast !== false) get().toast('🚧', `New landmark discovered: ${p?.place}! Construction has started.`, 'info', { group: 'discover', item: p?.place ?? serviceId });
    get().log({ kind: 'system', text: `You found ${p?.place}. ${p?.agentName} moved into town.` });
    bus.emit('discovered', { serviceId, quiet });
  },

  addXp: (serviceId, amount) => {
    if (!serviceById(serviceId) || amount <= 0) return;
    if (!isDiscovered(get().progress, serviceId, get().cityRegion)) get().discover(serviceId, { quiet: true });
    const { progress, cityRegion } = get();
    const before = landmarkOf(progress, serviceId, cityRegion);
    const xp = (before?.xp ?? 0) + amount;
    set({ progress: { ...withLandmark(progress, serviceId, cityRegion, { discovered: true, xp }), updatedAt: new Date().toISOString() } });
    bus.emit('xpGained', { serviceId, amount });
    noteShift(get, set, serviceId, amount);
    const oldTier = tierForXp(before?.xp ?? 0);
    const newTier = tierForXp(xp);
    if (newTier > oldTier) {
      const p = placeFor(serviceId);
      // The city celebrates on the building itself (CityScene's tierUp); no toast on top of it.
      get().log({ kind: 'system', text: `${p?.place} is now ${TIER_NAMES[newTier]}: ${p?.tiers[newTier - 1]}.` });
      bus.emit('tierUp', { serviceId, tier: newTier });
    }
  },

  loadProgress: (loaded) => {
    // Saved before v2.7: its Region landmarks belong to the city the player was building.
    const cities = migrateCities(loaded, get().cityRegion);
    // v2.14: decorations bought with stars come back as City Coins, once (src/state/wallet.ts migrateWallet).
    const migrated = migrateWallet(cities);
    const p = migrated === cities ? cities : { ...migrated, updatedAt: new Date().toISOString() };
    set({
      progress: p,
      ...(!!p.bill === get().billOn ? {} : { billOn: !!p.bill, ...(p.bill ? {} : { bill: undefined }) }),
      ...(!!p.flow === get().flowOn ? {} : { flowOn: !!p.flow, ...(p.flow ? {} : { flow: undefined }) }),
    });
  },

  applyServerEvent: (e) => {
    const s = get();
    switch (e.type) {
      case 'task.plan': {
        const t = s.tasks[e.taskId];
        set({
          tasks: {
            ...s.tasks,
            [e.taskId]: {
              taskId: e.taskId,
              prompt: t?.prompt ?? '',
              agentId: e.agentId,
              steps: e.steps.map((text) => ({ text, status: 'pending' as StepStatus })),
              status: 'running',
            },
          },
        });
        // An agent can't work at a landmark the city hasn't built yet — discovering it is part of the story.
        if (serviceById(e.targetServiceId)) get().discover(e.targetServiceId);
        s.log({ kind: 'system', from: e.agentId, text: `${agentName(e.agentId)} took the job (${e.steps.length} steps).`, taskId: e.taskId });
        break;
      }
      case 'task.step': {
        const t = s.tasks[e.taskId];
        if (t) {
          const steps = [...t.steps];
          steps[e.index] = { text: e.text, status: e.status };
          set({ tasks: { ...s.tasks, [e.taskId]: { ...t, steps } } });
        }
        if (e.status === 'running') s.log({ kind: 'step', from: t?.agentId, text: e.text, taskId: e.taskId });
        break;
      }
      case 'agent.state': {
        set({ agents: { ...s.agents, [e.agentId]: { state: e.state, service: e.service, detail: e.detail } } });
        // An API name (service:Action) while one of the player's tasks runs on this agent: that task made the call.
        const own = e.state === 'working' && e.detail && /^[a-z0-9-]+:[A-Za-z]+$/.test(e.detail) ? Object.values(s.tasks).find((t) => t.status === 'running' && t.agentId === e.agentId) : undefined;
        if (own && !own.calls?.includes(e.detail!)) set({ tasks: { ...get().tasks, [own.taskId]: { ...own, calls: [...(own.calls ?? []), e.detail!] } } });
        if (e.state === 'working' && e.detail) s.log({ kind: 'state', from: e.agentId, text: e.detail, ambient: !taskRunning(s) });
        break;
      }
      case 'agent.message': {
        s.log({ kind: 'message', from: e.from, to: e.to, text: e.text, ambient: e.to !== 'user' && !taskRunning(s) });
        // A citizen answering an Explain: keep the answer on that finding's card.
        // A citizen answering a fix request without a preview (e.g. the server says they need teaching first) also ends it.
        const ex = e.to === 'user' ? Object.entries(s.careRequests).find(([id]) => s.findings[id]?.citizenId === e.from) : undefined;
        if (ex) {
          set({ explanations: { ...get().explanations, [ex[0]]: e.text } });
          get().noteCare(ex[0]);
        }
        break;
      }
      case 'task.done': {
        // A Copilot run started from a workshop step did the step in the real console.
        if (e.ok && s.copilotFor?.taskId === e.taskId) s.workshopStep(s.copilotFor.workshopId, s.copilotFor.stepId, 'real');
        // A Copilot run started from a "Click it" side job did the job.
        if (e.ok && s.copilotJob?.taskId === e.taskId) s.clientTaskDone(s.copilotJob.jobId);
        // A Copilot run on a service's console page completes that service's console quest step.
        if (e.ok && s.copilotTaskId === e.taskId && s.focus?.serviceId) s.questEvent((st) => st.kind === 'console' && st.serviceId === s.focus!.serviceId);
        const t = s.tasks[e.taskId];
        if (t) set({ tasks: { ...s.tasks, [e.taskId]: { ...t, status: e.ok ? 'done' : 'failed', result: e.result } } });
        if (!e.ok) {
          // A real failure goes on the Correction of Error board in the Day 1 Quarter.
          const entry: CoeEntry = {
            id: `coe-${e.taskId}`,
            at: Date.now(),
            taskId: e.taskId,
            prompt: t?.prompt ?? '',
            agentId: t?.agentId,
            failedStep: t?.steps.find((x) => x.status === 'failed')?.text,
            result: e.result,
          };
          const c = get().culture;
          if (!c.coe.some((x) => x.id === entry.id)) {
            const culture = { ...c, coe: [entry, ...c.coe].slice(0, COE_MAX) };
            set({ culture });
            saveCulture(culture);
          }
        }
        // A building's first TASK_PAID_A_DAY tasks a day pay their stars, later ones nothing (like chat): the stars come
        // from the server's task.done, which only reports them; this is the one place they're paid.
        const paid: { serviceId: string; stars: number }[] = [];
        for (const x of e.xp)
          if (takeDaily(`task:${x.serviceId}`, TASK_PAID_A_DAY)) {
            get().addXp(x.serviceId, x.amount);
            if (serviceById(x.serviceId) && x.amount > 0) paid.push({ serviceId: x.serviceId, stars: x.amount });
          }
        // Watch it done's result card says what was paid, or that today's paid tasks there are used up.
        const done = get().tasks[e.taskId];
        // A repeat whose stars were used up still pays a few coins, so watching isn't dead time (capped a day).
        const capped = e.xp.length > 0 && !paid.length;
        const coins = capped && e.ok && takeDaily('watch', WATCH_PAID_A_DAY) ? get().earnCoins(COIN_PAY.watch, 'watch it done') : 0;
        if (done) set({ tasks: { ...get().tasks, [e.taskId]: { ...done, paid, ...(capped ? { capped: true } : {}), ...(coins ? { coins } : {}) } } });
        // An answered request ticks an "ask" step; a deploy finishing (same event, its deployId) doesn't.
        if (e.ok && !s.deploys[e.taskId]) get().questEvent((st) => st.kind === 'ask');
        break;
      }
      case 'page.classified':
        set({ lastClassified: { serviceIds: e.serviceIds, summary: e.summary } });
        // A classified page pays each service once a day, so re-reading pages isn't a star tap.
        for (const id of e.serviceIds) if (takeDaily(`classify:${id}`)) get().addXp(id, CLASSIFY_STARS);
        break;
      case 'chat.answer': {
        const list = [...(s.chats[e.districtId] ?? [])];
        const id = `a-${e.requestId}`;
        const i = list.findIndex((m) => m.id === id);
        if (i === -1) list.push({ id, role: 'agent', agentId: e.agentId, text: e.delta, pending: !e.done });
        else list[i] = { ...list[i], text: list[i].text + e.delta, pending: !e.done };
        set({ chats: { ...s.chats, [e.districtId]: list.slice(-CHAT_MAX) } });
        // An answer pays its building for the first few questions a day, so chatting isn't a star tap.
        // Both caps count only answers that would pay: a building's own first few, then the city-wide day's total.
        if (e.done && usedToday(CHAT_DAY_KEY) < CHAT_PAID_A_DAY_TOTAL && takeDaily(`chat:${e.agentId}`, CHAT_PAID_A_DAY)) {
          countDaily(CHAT_DAY_KEY);
          get().addXp(e.agentId, CHAT_STARS);
          if (serviceById(e.agentId)) markChat(get, e.districtId, id, { stars: CHAT_STARS });
        } else if (e.done && serviceById(e.agentId)) markChat(get, e.districtId, id, { capped: true });
        break;
      }
      case 'agent.level':
        set({ agentLevels: { ...s.agentLevels, [e.agentId]: e.level } });
        s.toast('🧠', `${agentName(e.agentId)} reached level ${e.level}${e.skill ? `: ${e.skill}` : ''}`);
        break;
      case 'account.linkUrl':
        set({ account: { ...s.account, linkUrl: e.url, externalId: e.externalId } });
        break;
      case 'account.status':
        set({ account: { ...s.account, linked: e.linked, accountId: e.accountId, region: e.region, message: e.message, seq: (s.account.seq ?? 0) + 1 } });
        // A real account's findings show at once (src/state/ladder.ts: linking unlocks care); the practice account's still drip.
        if (e.linked && get().careReleased) {
          if (realAccount(get())) flushHeld();
          else drip();
        }
        if (e.linked && s.backendKind === 'mock') s.toast('🔗', 'The practice account is linked. Agents can build things there now, and you approve each one.');
        else if (e.linked) s.toast('🔗', `Your AWS account ${e.accountId} is linked. Agents can build things there now, and you approve each one.`);
        else if (e.message) s.toast('⚠️', e.message, 'error');
        break;
      case 'deploy.preview': {
        const care = e.findingId
          ? { findingId: e.findingId, rollback: e.rollback, confirmText: e.confirmText }
          : {};
        set({
          deploys: {
            ...s.deploys,
            [e.deployId]: { deployId: e.deployId, templateId: e.templateId, stackName: e.stackName, region: e.region, changes: e.changes, costNote: e.costNote, status: 'preview', ...care },
          },
        });
        if (e.findingId) get().noteCare(e.findingId);
        break;
      }
      case 'city.inventory': {
        const { type: _t, ...inventory } = e;
        set({ inventory });
        break;
      }
      case 'city.finding': {
        const f = e.finding;
        // Shown before, or a real account's: straight on. Anything new waits its turn (drip).
        if (s.findings[f.id] || realAccount(s)) get().applyFinding(f);
        else {
          heldFindings.set(f.id, f);
          drip();
        }
        break;
      }
      case 'city.bill':
        // A bill that arrives after the player turned it off (in flight) is dropped.
        if (s.billOn) set({ bill: e });
        break;
      case 'city.flow':
        if (s.flowOn) set({ flow: e });
        break;
      case 'presence.state':
        if (e.region === s.cityRegion) set({ presence: e });
        break;
      case 'leaderboard.state':
        set({ boards: { ...s.boards, [e.board]: e } });
        break;
      case 'workshop.verified':
        set({ workshopChecks: { ...s.workshopChecks, [`${e.workshopId}/${e.stepId}`]: { pending: false, ok: e.ok, detail: e.detail } } });
        if (e.ok) s.workshopStep(e.workshopId, e.stepId, 'real');
        break;
      case 'aws.health': {
        const before = new Map((s.health?.incidents ?? []).map((i) => [i.id, i.status]));
        set({ health: e });
        // Moments for the city (a citizen notices, one soft sound); not on the first event after opening.
        if (s.health)
          for (const i of e.incidents) {
            if (i.status === 'open' && before.get(i.id) !== 'open') {
              bus.emit('incidentStarted', { incident: i });
              // Said once, for this city's Region or anything AWS calls a disruption; not before AWS news opens (src/state/ladder.ts).
              // Plain words first, and an info toast, so it waits for a celebration card or a game to close (toastsHeld).
              if (newsOpen(s.progress, s.account.linked) && (i.region === s.cityRegion || i.severity === 'disruption')) s.toast(i.drill ? '🧯' : '⛈️', `${plainIncidentLead(i)}. (${incidentLine(i)})`);
            }
            if (i.status === 'resolved' && before.get(i.id) === 'open') bus.emit('incidentResolved', { incident: i });
          }
        break;
      }
      case 'aws.news':
        set({ news: e });
        break;
      case 'deploy.status': {
        const d = s.deploys[e.deployId];
        if (d) set({ deploys: { ...s.deploys, [e.deployId]: { ...d, status: e.status, outputs: e.outputs ?? d.outputs, message: e.message } } });
        s.log({ kind: 'system', text: `🏗️ ${d?.stackName ?? e.deployId}: ${e.status}${e.message ? ` — ${e.message}` : ''}` });
        if (d?.findingId) {
          // A fix: the finding's own event says how it went; only a refusal needs saying here.
          if (e.status === 'failed') s.toast('⚠️', e.message ?? 'That change didn’t go through. Nothing changed.', 'error');
        } else if (e.status === 'complete') {
          const before = get().celebration;
          if (d) get().questEvent((st) => st.kind === 'deploy' && (st.templateId === d.templateId || GUARDED_EQUIV[st.templateId] === ACTION_BLUEPRINT[d.templateId]));
          // The deploy finished a quest: its celebration card is the moment (no toast on top); the feed has the line.
          if (get().celebration === before)
            s.toast('🚀', `${d?.stackName ?? 'Your stack'} is built in ${s.backendKind === 'mock' ? 'the practice account' : 'your AWS account'}!`);
        }
        break;
      }
      case 'console.step':
        s.log({ kind: 'step', from: e.agentId, text: `🖱️ ${e.say}${e.why ? ` — 💡 ${e.why}` : ''}`, taskId: e.taskId });
        break;
      case 'screenshot.url':
      case 'progress.state':
        break;
      case 'error': {
        // A finding request that failed: stop its spinner.
        const care = e.requestId ? Object.entries(s.careRequests).find(([, r]) => r.requestId === e.requestId) : undefined;
        if (care) get().noteCare(care[0]);
        if (e.code === 'mfa_required') set({ account: { ...s.account, mfaRequired: true } });
        const text = errorText(e);
        s.log({ kind: 'system', text: `⚠️ ${text}` });
        s.toast('⚠️', text, 'error');
        if (e.taskId && s.tasks[e.taskId]) set({ tasks: { ...s.tasks, [e.taskId]: { ...s.tasks[e.taskId], status: 'failed' } } });
        // Show it in the HQ chat it belongs to (by requestId), else in the HQ the player is standing in.
        const chats = get().chats;
        const byRequest = e.requestId ? Object.keys(chats).find((d) => chats[d].some((m) => m.id === `u-${e.requestId}`)) : undefined;
        const v = get().view;
        const districtId = byRequest ?? (v.name === 'interior' && v.districtId !== 'spheres' ? v.districtId : undefined);
        if (districtId) {
          const list = (chats[districtId] ?? []).map((m) => (m.pending && (!e.requestId || m.id === `a-${e.requestId}`) ? { ...m, pending: false } : m));
          list.push({ id: `e-${nextId++}`, role: 'error', text });
          set({ chats: { ...chats, [districtId]: list } });
        }
        break;
      }
    }
  },

  addTask: (taskId, prompt) => {
    const s = get();
    set({
      tasks: { ...s.tasks, [taskId]: { taskId, prompt, steps: [], status: 'routing' } },
      taskOrder: [taskId, ...s.taskOrder].slice(0, 20),
    });
    s.log({ kind: 'user', from: 'user', to: 'concierge', text: prompt, taskId });
  },

  addUserChat: (districtId, requestId, text) => {
    const s = get();
    set({ chats: { ...s.chats, [districtId]: [...(s.chats[districtId] ?? []), { id: `u-${requestId}`, role: 'user' as const, text }].slice(-CHAT_MAX) } });
  },

  log: (item) => set((s) => ({ feed: [...s.feed, { ...item, id: nextId++, at: Date.now() }].slice(-FEED_MAX) })),

  setMfaRequired: (on) => set((s) => ({ account: { ...s.account, mfaRequired: on } })),
  setSigningIn: (signingIn) => set({ signingIn }),
  resetSession: () => {
    // Findings held for this player must not reach the next one.
    heldFindings.clear();
    stopDrip();
    set({
      progress: emptyProgress(),
      agents: {},
      tasks: {},
      taskOrder: [],
      feed: [],
      chats: {},
      selected: undefined,
      lastClassified: undefined,
      lastSnapshot: undefined,
      account: { linked: false },
      deploys: {},
      agentLevels: {},
      inventory: undefined,
      bill: undefined,
      billOn: false,
      flow: undefined,
      flowOn: false,
      findings: {},
      findingOpen: undefined,
      careReleased: false,
      careRequests: {},
      explanations: {},
      copilotTaskId: undefined,
      workshopDone: undefined,
      view: { name: 'city' },
      today: undefined,
      shift: undefined,
      // The COE board keeps the player's prompts and failure text: it leaves with them.
      culture: { badges: [], coe: [] },
    });
    try {
      globalThis.localStorage?.removeItem(TODAY_KEY);
      globalThis.localStorage?.removeItem(SHIFT_KEY);
      globalThis.localStorage?.removeItem(CULTURE_KEY);
    } catch {
      /* storage unavailable */
    }
    get().log({ kind: 'system', text: 'Signed out. Sign in to pick up where you left off.' });
  },
  toast: (icon, text, kind = 'info', merge, building, opts) => {
    const show = get().showToast;
    const visible = () => get().toasts.filter((t) => !t.leaving);
    if (kind === 'error') {
      // An error can't wait: it replaces whatever info toast is showing.
      for (const t of visible()) if (t.kind !== 'error') get().dismissToast(t.id);
      return show({ icon, text, kind, ms: 8000 });
    }
    if (merge) {
      // Merge into a showing or waiting toast of the same group (a fresh copy restarts its timer).
      const live = visible().find((t) => t.group === merge.group);
      const waiting = toastQueue.find((t) => t.group === merge.group);
      const into = live ?? waiting;
      if (into) {
        const items = [...(into.items ?? []), merge.item];
        if (waiting) Object.assign(waiting, { items, text: groupText(items) });
        else {
          clearTimeout(toastTimers.get(live!.id));
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== live!.id) }));
          show({ ...live!, items, text: groupText(items), ms: 4500 });
        }
        return;
      }
    }
    const entry = { icon, text, kind, ms: building ? 4500 : 3500, ...(merge ? { group: merge.group, items: [merge.item] } : {}), ...(building ? { serviceId: building.serviceId, detail: building.detail } : {}) };
    if (opts?.first) toastQueue.unshift(entry);
    else toastQueue.push(entry);
    // A burst never trickles on for a minute: only the latest few wait their turn (a `first` toast at the front stays).
    if (toastQueue.length > TOAST_QUEUE_MAX) toastQueue.splice(opts?.first ? 1 : 0, toastQueue.length - TOAST_QUEUE_MAX);
    if (!visible().length && !toastsHeld(get())) show(toastQueue.shift()!);
  },
  clearToasts: () => {
    toastQueue.length = 0;
    for (const t of toastTimers.values()) clearTimeout(t);
    toastTimers.clear();
    set({ toasts: [] });
  },
  showToast: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-4) }));
    toastTimers.set(id, setTimeout(() => get().dismissToast(id), t.ms));
  },
  setTourOpen: (tourOpen) => set({ tourOpen }),
  dismissToast: (id) => {
    // Slide out first, then remove.
    if (!get().toasts.some((t) => t.id === id && !t.leaving)) return;
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
    clearTimeout(toastTimers.get(id));
    toastTimers.delete(id);
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      // The next waiting toast, once nothing else shows (and no card or game holds the floor).
      nextToast(get);
    }, 180);
  },

  setView: (view) => {
    // Build mode is the city's: leaving it (a game, an HQ, the world map) ends it.
    set(view.name === 'city' ? { view } : { view, build: undefined });
    nextToast(get);
  },
  openWorld: () => {
    set({ view: { name: 'world' }, build: undefined });
    nextToast(get);
  },
  enterRegion: (code) => {
    if (!REGIONS.regions.some((r) => r.code === code)) return;
    const first = !!get().prefs.region && code !== get().cityRegion && !builtCities(get().progress)[code];
    get().setPref('region', code);
    set({ cityRegion: code, view: { name: 'city' } });
    nextToast(get);
    // Like real AWS, a new Region is empty: say so once, kindly, so an empty city doesn't look like lost progress.
    // Another city's welcome (still up, or waiting) goes: it would greet you in the wrong place.
    const isWelcome = (t: { text: string }) => t.text.includes(WELCOME_MARK);
    for (const t of get().toasts) if (isWelcome(t) && !t.leaving) get().dismissToast(t.id);
    for (let i = toastQueue.length - 1; i >= 0; i--) if (isWelcome(toastQueue[i])) toastQueue.splice(i, 1);
    const r = REGIONS.regions.find((x) => x.code === code);
    if (first) {
      const hi = FLAVOUR.regions[code]?.hello;
      get().toast('🏗️', `${hi ? `${hi}! ` : ''}Welcome to ${r?.city ?? code}! ${WELCOME_MARK}, so this city is brand new. What you've learned comes with you.`, 'info');
    }
  },
  select: (selected) => {
    set({ selected });
    if (!selected) return;
    // A quest pointing at a landmark the city hasn't built yet builds it, so "Go →" never lands on an empty plot
    // and the step's flashcard deck is open.
    if (!isDiscovered(get().progress, selected, get().cityRegion) && questTargets(get().progress).has(selected)) get().discover(selected);
  },
  arrive: (id) => get().questEvent((st) => st.kind === 'visit' && st.serviceId === id),
  collectFind: (id) => {
    const p = get().progress;
    if (p.finds?.[id]) return false;
    set({ progress: { ...p, finds: { ...p.finds, [id]: dayKey() }, updatedAt: new Date().toISOString() } });
    return true;
  },
  setFocusPuzzle: (focusPuzzle) => set({ focusPuzzle }),
  setAutoSnap: (autoSnap) => set({ autoSnap }),
  setCopilot: (copilotTaskId) => set({ copilotTaskId }),
  setSnap: (snap, lastSnapshot) => set(lastSnapshot ? { snap, lastSnapshot } : { snap }),

  reviewCard: (cardId, grade, opts) => {
    const { progress } = get();
    const prev = progress.cards?.[cardId];
    const practice = !!opts?.practice && !!prev;
    const next = review(prev, grade);
    // The first time a card is remembered for a week pays a bonus, once ever (the flag survives an Again).
    const remembered = !practice && firstRemembered(prev, next);
    if (!practice) {
      const card = prev?.remembered || remembered ? { ...next, remembered: true as const } : next;
      set({ progress: { ...progress, cards: { ...progress.cards, [cardId]: card }, updatedAt: new Date().toISOString() } });
    }
    const serviceId = serviceOfCard(cardId);
    const stars = xpFor(prev, grade) + (remembered ? REMEMBERED_STARS : 0);
    get().addXp(serviceId, stars);
    if (remembered) get().log({ kind: 'system', text: `🧠 Remembered for a week: a ${placeFor(serviceId)?.place ?? serviceId} card. +${REMEMBERED_STARS} ⭐` });
    const p = get().progress;
    get().awardCitizens(
      citizensForService(serviceId).map((c) => ({
        citizenId: c.id,
        amount: CITIZEN_XP.card,
        reason: `you’ve reviewed ${cardReviewsFor(p, c)} ${PILLAR_LABEL[c.pillar].toLowerCase()} flashcards`,
      })),
    );
    get().noteLearning('cards');
    // Every graded card counts toward a cards step: Again is still a card looked at (only grading Good counted, so a
    // quest could stall on a deck the player was still learning).
    get().questEvent((st) => st.kind === 'cards' && st.serviceId === serviceId, true);
    return { stars, remembered };
  },

  recordPuzzle: (puzzleId, score, passed, pillars) => {
    const { progress } = get();
    // `best` is the best PASSING score: a failed try (say 83 with a service missing) must never stand in the way of
    // the stars for a later pass, nor show as done (✓, featuredPuzzle, the ladder all read best ≥ the pass mark).
    const prevBest = progress.puzzles?.[puzzleId]?.best ?? 0;
    if (passed && score > prevBest) set({ progress: { ...progress, puzzles: { ...progress.puzzles, [puzzleId]: { best: score } }, updatedAt: new Date().toISOString() } });
    // A better passing design teaches the citizens whose pillars it got right (re-checking the same answer doesn't).
    if (passed && pillars && score > prevBest) get().awardCitizens(
        citizensForPuzzle(pillars).map((c) => ({ citizenId: c.id, amount: CITIZEN_XP.puzzle, reason: `your design scored ${pillars[c.pillar]} on ${PILLAR_LABEL[c.pillar].toLowerCase()}` })),
      );
    if (passed) get().noteLearning('puzzles');
    if (passed) get().questEvent((st) => st.kind === 'puzzle' && st.puzzleId === puzzleId);
  },

  recordGame: (game, score, opts) => {
    const { progress } = get();
    const g = progress.games?.[game] ?? { best: 0, plays: 0 };
    // An old save (before v2.12) has no `scored`: its plays stand in for it from here on.
    const next = { ...g, best: Math.max(g.best, score), plays: g.plays + 1, scored: (g.scored ?? g.plays) + (score > 0 ? 1 : 0) };
    if (opts?.timed !== false) {
      const week = isoWeekUtc(); // the boards' (UTC) week, so the best submitted is the one the server files
      if (g.bestWeek !== week || (g.bestTimed ?? 0) < score) Object.assign(next, { bestTimed: g.bestWeek === week ? Math.max(g.bestTimed ?? 0, score) : score, bestWeek: week });
    }
    set({ progress: { ...progress, games: { ...progress.games, [game]: next }, updatedAt: new Date().toISOString() } });
    if (score <= 0) return 0;
    // The scene counted this round (countRound) before recording it: full coins for the first rounds or a new best,
    // half for the next few, then none (src/state/wallet.ts roundCoins).
    return get().earnCoins(roundCoins(usedToday(`round:${game}`), score > g.best), 'a mini-game round');
  },
  earnCoins: (n, reason) => {
    const before = get().progress;
    const after = earnPure(before, n, dayKey());
    if (after === before) return 0;
    set({ progress: after });
    void reason;
    const added = after.wallet!.earned - (before.wallet?.earned ?? 0);
    bus.emit('coins', { n: added });
    return added;
  },
  spendCoins: (n) => {
    const after = spendPure(get().progress, n);
    if (!after) return false;
    set({ progress: after });
    return true;
  },
  payShift: () => {
    const before = get().progress;
    const after = payShiftPure(before, dayKey());
    if (after === before) return 0;
    set({ progress: after });
    get().log({ kind: 'system', text: `🎉 Shift done! +${COIN_PAY.shift} 🪙 City Coins.` });
    return COIN_PAY.shift;
  },

  // ── Loops that bring you back (v2.15, round 3 step 2) ──
  lightDay: () => {
    const p = get().progress;
    const before = lightsOf(p);
    const lights = lightDayPure(before, dayKey());
    if (lights === before && p.lights) return false;
    set({ progress: { ...p, lights, updatedAt: new Date().toISOString() } });
    if (lights === before) return false;
    get().log({ kind: 'system', text: '💡 A new window lights up in your city tonight.' });
    bus.emit('windowLit');
    return true;
  },
  fillSeason: (grew) => {
    const p = get().progress;
    const day = dayKey();
    const id = seasonById(get().prefs.road ?? '') ? get().prefs.road! : seasonFor(day).id;
    const after = fillSeasonPure(p, id, day, grew);
    if (after === p) return 0;
    set({ progress: after });
    const added = (after.seasons?.[id]?.points ?? 0) - (p.seasons?.[id]?.points ?? 0);
    get().log({ kind: 'system', text: `${seasonById(id)?.icon ?? '🌸'} ${seasonById(id)?.name ?? 'Season'} road +${added}.` });
    return added;
  },
  claimSeason: (i, id) => {
    const sid = id ?? (seasonById(get().prefs.road ?? '') ? get().prefs.road! : seasonFor(dayKey()).id);
    const p0 = get().progress;
    // A freeze step with the freezes full gives a crate item instead (src/state/season.ts claimStep).
    const r = claimStep(p0, sid, i, undefined, { freezesFull: heldFreezes(lightsOf(p0)) >= MAX_FREEZES, owned: ownedCosmetics(p0) });
    if (!r) return undefined;
    let progress = r.progress;
    if (r.reward.kind === 'freeze') {
      const f = addFreeze(lightsOf(progress));
      progress = { ...progress, lights: f.lights };
      get().toast('🧊', f.full ? 'Your City Lights freezes are full (3): this one waits for none, but the step is yours.' : 'A City Lights freeze: a missed day keeps its window lit.');
    } else get().toast('🎁', `${rewardName(r.reward)} is yours. Place it free in Decorate.`);
    set({ progress });
    return r.reward;
  },
  openDrop: (opts) => {
    const r = openDropPure(get().progress, dayKey(), undefined, opts);
    if (!r) return undefined;
    set({ progress: r.progress });
    const crate = opts?.overtime ? 'Overtime crate' : 'Supply Drop';
    const what = !r.item ? 'confetti! You own every crate item and every spare.' : r.spare ? `a spare ${r.item.icon} ${r.item.name}: one more may stand in each city.` : `${r.item.icon} ${r.item.name} (${RARITY_NAME[r.item.rarity]}).`;
    get().log({ kind: 'system', text: `🎁 ${crate}: ${what}` });
    return { item: r.item, ...(r.spare ? { spare: true } : {}) };
  },
  discoverCombo: (id, opts) => {
    const p = get().progress;
    const after = findCombo(p, id, dayKey());
    if (after === p) return false;
    set({ progress: after });
    // Found while the city slept (or standing when it loads): the coins are paid all the same, quietly.
    // Simple mode (src/state/simple.ts): the combo stands in the city and pays, quietly (no toast).
    if (opts?.quiet || !shows('comboToast', get().prefs)) return (set({ progress: earnPure(get().progress, COIN_PAY.combo, dayKey()) }), true);
    const c = comboById(id);
    const coins = get().earnCoins(COIN_PAY.combo, 'a combo found');
    get().toast('🧩', `Combo found: ${c?.name ?? id}! ${c?.simple ?? ''} +${coins} 🪙`.replace(/\s+/g, ' '));
    return true;
  },

  startQuest: (questId) => {
    const q = questById(questId);
    const { progress } = get();
    if (!q || progress.quests?.[questId]?.status === 'active') return;
    set({ progress: { ...progress, quests: { ...progress.quests, [questId]: { status: 'active', step: 0, count: 0 } }, updatedAt: new Date().toISOString() } });
    get().log({ kind: 'system', text: `📜 ${q.title}: ${q.intro}` });
    // Already standing at the first step's landmark (console page or selected place): that visit counts now.
    const { focus, selected } = get();
    const here = new Set([focus?.serviceId, selected].filter(Boolean));
    get().questEvent((st) => st.kind === 'visit' && here.has(st.serviceId));
  },

  questEvent: (match, countable) => {
    const { progress } = get();
    const quests = { ...progress.quests };
    let changed = false;
    for (const [id, st] of Object.entries(quests)) {
      if (st.status !== 'active') continue;
      const q = questById(id);
      const step = q?.steps[st.step];
      if (!q || !step || !match(step)) continue;
      changed = true;
      if (countable && step.kind === 'cards' && (st.count ?? 0) + 1 < step.count) {
        quests[id] = { ...st, count: (st.count ?? 0) + 1 };
        continue;
      }
      const next = st.step + 1;
      if (next >= q.steps.length) {
        quests[id] = { status: 'done', step: next };
        // One big moment: the celebration card (no toast on top of it); the feed keeps a line.
        set({ celebration: id });
        get().log({ kind: 'system', text: `🏆 Quest complete: ${q.title}! +${q.rewardXp} ⭐` });
        bus.emit('questDone', { questId: id });
        const share = Math.ceil(q.rewardXp / q.serviceIds.length);
        setTimeout(() => q.serviceIds.forEach((sid) => get().addXp(sid, share)), 0);
      } else {
        quests[id] = { status: 'active', step: next, count: 0 };
        get().log({ kind: 'system', text: `📜 ${q.title} — next: ${q.steps[next].text}` });
        // A step done is a moment: a ✓ toast and its building bumps (CityScene), every time.
        // First in line: a walk that also discovers the building (its toast, a greeting) never buries it.
        get().toast('✓', `Step ${next} of ${q.steps.length} done: ${step.text}`, 'info', undefined, undefined, { first: true });
        bus.emit('questStep', { questId: id, step: st.step, serviceId: stepService(id, step) });
      }
    }
    if (changed) set({ progress: { ...get().progress, quests, updatedAt: new Date().toISOString() } });
  },
}));

/** Notes on a finished chat answer what it paid (or that today's paid answers are used up), for the chat's line under it. */
function markChat(get: () => CityState, districtId: string, id: string, note: { stars?: number; capped?: boolean }) {
  const chats = get().chats;
  const list = chats[districtId];
  if (!list?.some((m) => m.id === id)) return;
  useCity.setState({ chats: { ...chats, [districtId]: list.map((m) => (m.id === id ? { ...m, ...note } : m)) } });
}

/** A linked account the server reads (the demo's practice account is pretend, so its findings still drip). */
const realAccount = (s: Pick<CityState, 'account' | 'backendKind'>) => s.account.linked && s.backendKind !== 'mock';

/** Shows the next held finding if care is unlocked, nothing is waiting to be looked at, and fewer than 3 are open. */
function drip() {
  const s = useCity.getState();
  if (!s.careReleased || dripTimer) return;
  const seasoned = Object.values(s.progress.quests ?? {}).some((q) => q.status === 'done');
  const held = heldOpen();
  const next = held.find((f) => seasoned || !advanced(f));
  // Resolved before it was ever shown: nothing to say about it.
  for (const f of heldFindings.values()) if (f.status !== 'open') heldFindings.delete(f.id);
  if (!next) {
    // Only advanced advice is left and no quest is finished yet: look again later.
    if (held.length)
      dripTimer = setTimeout(() => {
        dripTimer = undefined;
        drip();
      }, DRIP_MS);
    return;
  }
  if (openFindings(s.findings).length >= MAX_OPEN_FINDINGS) {
    // Full: try again later (a fixed or resolved finding makes room).
    dripTimer = setTimeout(() => {
      dripTimer = undefined;
      drip();
    }, DRIP_MS);
    return;
  }
  heldFindings.delete(next.id);
  dripWaitingFor = next.id;
  dripTimer = setTimeout(() => {
    stopDrip();
    drip();
  }, DRIP_MS);
  s.applyFinding(next);
}

/** Everything held, at once (a linked account's findings are real). */
function flushHeld() {
  stopDrip();
  const all = heldOpen();
  heldFindings.clear();
  for (const f of all) useCity.getState().applyFinding(f);
}
