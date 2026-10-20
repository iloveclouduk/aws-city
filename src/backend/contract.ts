// ─────────────────────────────────────────────────────────────────────────────
// AWS City ⇄ backend contract v2.16. SOURCE OF TRUTH — docs/backend-contract.md mirrors this, and the
// server (server/) imports it, so drift breaks its build.
//
// Transport: ONE WebSocket to the AWS City server (server/src/http.ts): ws://127.0.0.1:<port>/ws locally,
// wss://<api host>/ws hosted. REST beside it: /progress, /screenshots, /me.
// Auth (hosted): the Cognito access token in the Sec-WebSocket-Protocol header (never the URL, which ends
// up in logs):
//   protocols = ['base64UrlBearerAuthorization.<base64url(jwt)>', 'base64UrlBearerAuthorization']
// Client → server frames are ClientCommand JSON (`action`); server → client are ServerEvent JSON
// (`type`), one event or an array per frame, each frame ≤ 64 KB (the server's maxPayload).
//
// Rule for the backend: every time an agent is about to call a real AWS service, emit
// `agent.state {state:'working'}` first and `agent.state {state:'idle'}` after. That is what makes
// the pixel agents visibly work.
// ─────────────────────────────────────────────────────────────────────────────

/** A string since v2.10 (the number 2.10 is 2.1, which reads as older than 2.9). */
export const CONTRACT_VERSION = '2.16';

// ── Console Copilot shapes (also used by the content script in src/console/) ──
export type ConsoleAction = 'click' | 'type' | 'select' | 'point' | 'done';

/** One interactive thing on the console page, as the agent sees it (labels only — never secrets). */
export interface SnapshotItem {
  id: string;
  role: string;
  name: string;
  /** Nearest heading/section label, to tell apart two "Create" buttons. */
  context?: string;
  /** Current value for non-sensitive inputs (truncated); omitted for secrets. */
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  sensitive?: boolean;
}

export interface PageSnapshot {
  url: string;
  title: string;
  heading?: string;
  items: SnapshotItem[];
}

export interface ConsoleTarget {
  id?: string;
  role?: string;
  name: string;
}

export type AgentId = string; // service id (e.g. 's3', 'lambda') or 'concierge' | 'lookout'
export type DistrictId = string;

export interface PageContext {
  url?: string;
  title?: string;
  /** Service the frontend matched from the URL, if any. */
  serviceId?: string;
  /** S3 key returned by screenshot.presign, if the Lookout snapped this page. */
  screenshotKey?: string;
}

// ── Client → server ──────────────────────────────────────────────────────────

export interface TaskSubmit {
  action: 'task.submit';
  taskId: string;
  prompt: string;
  context: PageContext;
  /** Quest this task belongs to, if any. */
  questId?: string;
}

export interface ChatAsk {
  action: 'chat.ask';
  requestId: string;
  districtId: DistrictId;
  question: string;
  context: PageContext;
}

export interface PageClassify {
  action: 'page.classify';
  requestId: string;
  context: PageContext; // must include screenshotKey or url+title
}

export interface ScreenshotPresign {
  action: 'screenshot.presign';
  requestId: string;
  contentType: 'image/jpeg';
}

export interface ProgressGet {
  action: 'progress.get';
  requestId: string;
}

export interface ProgressPut {
  action: 'progress.put';
  progress: Progress;
}

/** Ask for the CloudFormation quick-create link that connects the player's AWS account. */
export interface AccountLink {
  action: 'account.link';
  requestId: string;
  region: string;
}

/** Player finished the quick-create stack; backend verifies it can assume the role. */
export interface AccountVerify {
  action: 'account.verify';
  requestId: string;
  /** The stack's RoleArn output, or just the 12-digit account id (the role name is fixed per region). */
  roleArn: string;
}

export interface QuestStart {
  action: 'quest.start';
  questId: string;
  taskId: string;
}

/** Ask the Builder to create a change set for a curated template in the linked account (nothing is created yet). */
export interface DeployPlan {
  action: 'deploy.plan';
  requestId: string;
  templateId: string;
  taskId?: string;
  params?: Record<string, string>;
}

/** Player approved/rejected a change set shown via deploy.preview. Nothing is created without approve. */
export interface DeployDecision {
  action: 'deploy.approve' | 'deploy.reject';
  deployId: string;
  /** v2.3: the text the player typed when the preview asked for `confirmText` (a fix outside the city's own resources). */
  confirm?: string;
}

export interface DeployTeardown {
  action: 'deploy.teardown';
  deployId: string;
}

// ── Console Copilot (v2.1): agents act in the player's live AWS console, one visible step at a time ──

/** Start a Copilot task on the player's console tab. `snapshot` = what's clickable on the page (labels only). */
export interface ConsoleStart {
  action: 'console.start';
  taskId: string;
  goal: string;
  context: PageContext;
  snapshot: PageSnapshot;
}

/** Result of the last console.step, plus a fresh snapshot of the page after it. */
export interface ConsoleObserve {
  action: 'console.observe';
  taskId: string;
  index: number;
  ok: boolean;
  /** e.g. "player did it", "not found", "refused: risky". */
  note?: string;
  snapshot: PageSnapshot;
}

export interface ConsoleStop {
  action: 'console.stop';
  taskId: string;
}

// ── City care (v2.3): citizens find Well-Architected issues in the account and fix them with your OK ──

/** Ask the finding's citizen to explain it (answered with agent.message from that citizen). */
export interface FindingExplain {
  action: 'finding.explain';
  requestId: string;
  findingId: string;
}

/** Ask for the fix. Nothing changes yet: the server re-reads the resource and sends deploy.preview to approve. */
export interface FindingFixCommand {
  action: 'finding.fix';
  requestId: string;
  findingId: string;
}

/** Undoing a fix: fixes only tighten things, so the server answers with how to undo it in the AWS console (agent.message). */
export interface FindingUndo {
  action: 'finding.undo';
  requestId: string;
  findingId: string;
}

// ── The city's bill (v2.5): month-to-date cost from Cost Explorer, off until the player turns it on ──

/**
 * Turn the bill on or off. Cost Explorer charges $0.01 per request, so the server reads it only while it's on, at most
 * once a day per player (and once when it's turned on); it answers with city.bill. Also kept as Progress.bill.
 */
export interface BillEnable {
  action: 'bill.enable';
  on: boolean;
}

/**
 * v2.8: turn live traffic on or off. The server reads a few request counts from the account's CloudWatch (one
 * Metrics Insights query per GetMetricData call; CloudWatch charges per metric analyzed, about a cent a day for a
 * learner's account), at most every 5 minutes while the switch is on and the city is open; it answers with city.flow.
 * Also kept as Progress.flow.
 */
export interface FlowEnable {
  action: 'flow.enable';
  on: boolean;
}

/**
 * v2.10: check that a workshop step really happened in the player's account (shared/workshops/*.json). The server runs
 * the step's one read-only check (server/src/workshops/checks.ts, a fixed registry: no writes, no CLI) with the values
 * the player typed for the step's placeholders (a table or function name), and answers with workshop.verified.
 */
export interface WorkshopVerify {
  action: 'workshop.verify';
  workshopId: string;
  stepId: string;
  /** The step's placeholder values (`<table>` → "orders"); each checked against the check's own pattern. */
  values?: Record<string, string>;
}

/**
 * v2.11: the player is in this Region's city now (sent on connect, on arriving in a city, and every 30 s while a tab is
 * open and visible). The server answers with presence.state. A public profile is shown by its Mayor name; a private
 * one is only counted.
 */
export interface PresenceBeat {
  action: 'presence.beat';
  region: string;
  /** The city's rank name (src/state/rank.ts), shown beside a public Mayor's name. v2.12: adds 'Global City'. */
  rank?: 'Village' | 'Town' | 'City' | 'Metropolis' | 'Megacity' | 'Global City';
}
/**
 * v2.11: a score for a leaderboard: a mini-game id, or `mayors:<region>` (the city's rank points). Kept only for a
 * public profile, clamped to what a real round can score, best of the ISO week. Answered with leaderboard.state.
 */
export interface ScoreSubmit {
  action: 'score.submit';
  board: string;
  score: number;
}
/** v2.11: this week's top of a board. */
export interface LeaderboardGet {
  action: 'leaderboard.get';
  board: string;
}

export type ClientCommand =
  | TaskSubmit
  | ChatAsk
  | PageClassify
  | ScreenshotPresign
  | ProgressGet
  | ProgressPut
  | AccountLink
  | AccountVerify
  | QuestStart
  | DeployPlan
  | DeployDecision
  | DeployTeardown
  | ConsoleStart
  | ConsoleObserve
  | ConsoleStop
  | FindingExplain
  | FindingFixCommand
  | FindingUndo
  | BillEnable
  | FlowEnable
  | WorkshopVerify
  | PresenceBeat
  | ScoreSubmit
  | LeaderboardGet;

// ── Server → client ──────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

/** The orchestrator decided which agent handles a task and what it will do. */
export interface TaskPlanEvent {
  type: 'task.plan';
  taskId: string;
  agentId: AgentId;
  /** Landmark the agent walks to (usually = agentId). */
  targetServiceId: string;
  steps: string[];
}

/** Progress on one step. Drives the speech bubble + activity feed. `skipped` = agent remembered you know this. */
export interface TaskStepEvent {
  type: 'task.step';
  taskId: string;
  index: number;
  text: string;
  status: StepStatus;
}

/** A real AWS call is (or stopped) running for this agent. Drives idle vs working animation. */
export interface AgentStateEvent {
  type: 'agent.state';
  agentId: AgentId;
  state: 'idle' | 'working';
  /** AWS service actually being called, e.g. 's3', 'bedrock'. */
  service?: string;
  /** Human-readable detail, e.g. "PutObject screenshots/abc.jpg". */
  detail?: string;
}

/** Agents talking to each other (or to the user when `to` is 'user'). */
export interface AgentMessageEvent {
  type: 'agent.message';
  from: AgentId;
  to: AgentId | 'user';
  text: string;
}

export interface TaskDoneEvent {
  type: 'task.done';
  taskId: string;
  ok: boolean;
  result: string;
  /** XP awarded to the landmark(s). */
  xp: { serviceId: string; amount: number }[];
  /** v2.2, optional: AWS documentation pages the agent used. */
  sources?: DocSource[];
}

/** An AWS documentation page an answer was grounded in (https, AWS domains only). */
export interface DocSource {
  title: string;
  url: string;
}

export interface PageClassifiedEvent {
  type: 'page.classified';
  requestId: string;
  url?: string;
  serviceIds: string[];
  summary: string;
}

/** Streamed answer from a district HQ. Send chunks with done=false, finish with done=true. */
export interface ChatAnswerEvent {
  type: 'chat.answer';
  requestId: string;
  districtId: DistrictId;
  agentId: AgentId;
  delta: string;
  done: boolean;
  /** v2.2, optional, on the final (done) chunk: AWS documentation pages used. */
  sources?: DocSource[];
}

export interface ScreenshotUrlEvent {
  type: 'screenshot.url';
  requestId: string;
  /** Presigned S3 PUT URL, valid ~60 s. Client PUTs the JPEG bytes directly. */
  uploadUrl: string;
  screenshotKey: string;
}

export interface ProgressStateEvent {
  type: 'progress.state';
  requestId?: string;
  /** null = new player, nothing stored yet. */
  progress: Progress | null;
}

export interface AccountLinkUrlEvent {
  type: 'account.linkUrl';
  requestId: string;
  /** CloudFormation quick-create URL for infra/player-role/player-role.yaml with a per-player ExternalId. */
  url: string;
  externalId: string;
}

export interface AccountStatusEvent {
  type: 'account.status';
  requestId?: string;
  linked: boolean;
  accountId?: string;
  region?: string;
  message?: string;
}

export interface DeployChange {
  action: 'Add' | 'Modify' | 'Remove';
  logicalId: string;
  resourceType: string; // e.g. AWS::S3::Bucket
  replacement?: boolean;
}

/** A change set is ready. The client shows it and sends deploy.approve / deploy.reject. */
export interface DeployPreviewEvent {
  type: 'deploy.preview';
  requestId?: string;
  deployId: string;
  taskId?: string;
  templateId: string;
  stackName: string;
  region: string;
  changes: DeployChange[];
  /** Rough monthly cost note for the player, e.g. "Free tier: ~$0". */
  costNote?: string;
  /** v2.3: a fix for this finding (shown with its rollback; approve runs it). */
  findingId?: string;
  rollback?: string;
  /** v2.3: the player must type this exactly (a resource the city didn't build, or an account-wide change). */
  confirmText?: string;
}

export interface DeployStatusEvent {
  type: 'deploy.status';
  deployId: string;
  status: 'creating' | 'complete' | 'failed' | 'rejected' | 'deleting' | 'deleted';
  message?: string;
  /** Stack outputs, e.g. { WebsiteURL: 'https://…' }. */
  outputs?: Record<string, string>;
}

/** An agent got better at its job (from repeated work / memory). */
export interface AgentLevelEvent {
  type: 'agent.level';
  agentId: AgentId;
  level: number;
  skill?: string;
}

/**
 * The agent's next move in the console. The extension shows it (highlight + bubble with say/why),
 * performs it — unless it's risky, then the player does it — and replies with console.observe.
 * `done` ends the task. The content script's safety rules win over `risk`.
 */
export interface ConsoleStepEvent {
  type: 'console.step';
  taskId: string;
  index: number;
  agentId: AgentId;
  action: ConsoleAction;
  target?: ConsoleTarget;
  value?: string;
  say: string;
  why?: string;
  risk: 'safe' | 'confirm';
}

/** Well-Architected pillar ids (same as the puzzles' PillarId). */
export type PillarKey = 'operational' | 'security' | 'reliability' | 'performance' | 'cost' | 'sustainability';

/** One thing in the account. `serviceId` null = a type the city has no landmark for (drawn as a "?" lot). */
export interface InventoryItem {
  arn: string;
  type: string;
  name: string;
  serviceId: string | null;
  districtId: string | null;
  managedByGame: boolean;
  /** v2.3: the item's Region (from its ARN; 'global' for global resources). Absent = the city's home Region. */
  region?: string;
  /** v2.3: Availability Zone, for zonal resources the server can place (instances, DB instances). */
  az?: string;
}

/** One end of a data link: a Region, optionally narrowed to an AZ. */
export interface LinkEnd {
  region: string;
  az?: string;
}

/**
 * v2.3: data that really moves between Regions or AZs in the account (drawn as arcs on the world map and as
 * packets over the AZ bridges): global table replication, a Multi-AZ standby, cross-Region S3 replication…
 */
export interface DataLink {
  id: string;
  serviceId: string;
  from: LinkEnd;
  to: LinkEnd;
  kind: 'replication' | 'standby' | 'traffic';
  /** Both directions (multi-active replicas). */
  twoWay?: boolean;
  /** Short label, e.g. "Global table city-orders". */
  label: string;
}

/** v2.5: one Availability Zone: its name in this account (names are mapped per account) and its AZ ID (the same everywhere). */
export interface AzInfo {
  name: string;
  id: string;
}

/** v2.3: what's in the account, so the city can mirror it. Sent on connect and when it changes. */
export interface CityInventoryEvent {
  type: 'city.inventory';
  takenAt: string;
  region: string;
  /** Where the list came from; anything but resource-explorer may miss resources, so `complete` is false. */
  source: 'resource-explorer' | 'tagging' | 'collectors' | 'mock';
  complete: boolean;
  /** Resources per serviceId ('other' = unmapped types). */
  counts: Record<string, number>;
  /** Up to ~300 items (frames stay under 64 KB); `truncated` when there were more. */
  items: InventoryItem[];
  truncated: boolean;
  /** v2.3: the city's home Region (fully mirrored; other Regions show what the listing could see). */
  homeRegion?: string;
  /** v2.3: every Region with resources, with how many. */
  regions?: Record<string, number>;
  /** v2.3: data moving between Regions or AZs. */
  links?: DataLink[];
  /**
   * v2.5: the account's Availability Zones per Region (zone type availability-zone only, sorted by name): the home
   * Region and every Region with resources. A Region the server couldn't read is left out.
   */
  zones?: Record<string, AzInfo[]>;
  /** v2.5: every Region the account knows about: enabled (opt-in not required, or opted in) or not-enabled (an opt-in Region it hasn't turned on). */
  regionStatus?: Record<string, 'enabled' | 'not-enabled'>;
}

/**
 * v2.5: the account's month-to-date bill (Cost Explorer UnblendedCost, as AWS reports it: an estimate until the month
 * closes). Sent on connect while the bill is on, and after each read (at most daily).
 */
export interface CityBillReadyEvent {
  type: 'city.bill';
  /** YYYY-MM (UTC, like Cost Explorer). */
  month: string;
  /** e.g. 'USD'. */
  currency: string;
  /** Rounded to cents. */
  total: number;
  /** Per serviceId ('other' = a service the city has no landmark for, tax, support…). */
  byService: Record<string, number>;
  /** Per Region code ('global' = charges with no Region). */
  byRegion: Record<string, number>;
  takenAt: string;
  estimated: true;
  unavailable?: never;
}

/** v2.5: the bill couldn't be read; `unavailable` is one plain sentence for the player. */
export interface CityBillUnavailableEvent {
  type: 'city.bill';
  unavailable: string;
  takenAt: string;
}

/** Narrow with `e.unavailable !== undefined`. */
export type CityBillEvent = CityBillReadyEvent | CityBillUnavailableEvent;

/** v2.8: one live rate from CloudWatch: how much of something happened per minute, over the last `windowMin`. */
export interface FlowRate {
  /** 'alb', 'lambda', 'apigateway', 'dynamodb' (one per allow-listed query). */
  id: string;
  /** The landmark it belongs to. */
  serviceId: string;
  kind: 'requests' | 'invocations' | 'writes';
  /** Average per minute, rounded. */
  perMin: number;
  /** Per Availability Zone name (the load balancer's requests), when the metric has one. */
  byAz?: Record<string, number>;
  /** Plain words, built by the server: "Load balancer requests". */
  label: string;
}

/** v2.8: live traffic from the account (CloudWatch). Sent on connect while it's on, and after each read. */
export interface CityFlowReadyEvent {
  type: 'city.flow';
  region: string;
  windowMin: number;
  rates: FlowRate[];
  takenAt: string;
  unavailable?: never;
}
export interface CityFlowUnavailableEvent {
  type: 'city.flow';
  unavailable: string;
  takenAt: string;
}
export type CityFlowEvent = CityFlowReadyEvent | CityFlowUnavailableEvent;

/**
 * v2.6: one event on the public AWS Health Dashboard (health.aws.amazon.com), the same for every player. It's AWS's
 * own words, trimmed: a fact about AWS, not about the player's account.
 */
export interface AwsIncident {
  /** Stable while the event lasts (its Health ARN, or the status feed's guid). */
  id: string;
  /** Region code, e.g. 'me-south-1'; 'global' for services with no Region. */
  region: string;
  /** AWS's name for it, e.g. 'Bahrain'. */
  regionName?: string;
  /** Availability Zone IDs named in the updates, e.g. ['mes1-az2'] (zone IDs, not your account's zone names). */
  azIds?: string[];
  severity: 'informational' | 'degradation' | 'disruption';
  /** resolved = gone from the dashboard; shown for a day after. */
  status: 'open' | 'resolved';
  title: string;
  /** Impacted services as AWS names them (the first few), and how many there are in all. */
  services: string[];
  serviceCount: number;
  /** The city's landmarks among them. */
  serviceIds: string[];
  started: string;
  updated: string;
  /** AWS's updates, newest first (a few, each trimmed). */
  log: { at: string; text: string }[];
  /** Demo city only: a practice event the game made up, never AWS's. */
  drill?: true;
}

/** v2.6: the public AWS Health Dashboard. Sent on connect and whenever it changes. */
export interface AwsHealthEvent {
  type: 'aws.health';
  asOf: string;
  incidents: AwsIncident[];
  /** Set when the dashboard couldn't be read just now (the last known incidents are kept). */
  stale?: boolean;
}

/** v2.6: one AWS What's New announcement. */
export interface AwsNewsItem {
  id: string;
  title: string;
  /** Always an https://aws.amazon.com/ page. */
  url: string;
  date: string;
  serviceIds: string[];
}

/** v2.6: the latest AWS What's New announcements. Sent on connect and whenever they change. */
export interface AwsNewsEvent {
  type: 'aws.news';
  asOf: string;
  items: AwsNewsItem[];
}

export interface FindingFix {
  fixId: string;
  title: string;
  preview: string;
  rollback: string;
  costNote?: string;
  /** game = a resource the city built; account = anything else, or an account-wide setting. */
  scope: 'game' | 'account';
}

export interface CityFinding {
  /** Stable for the same rule on the same resource. */
  id: string;
  ruleId: string;
  serviceId: string;
  districtId: string;
  /** The citizen who looks after this pillar, e.g. 'citizen:security'. */
  citizenId: string;
  pillar: PillarKey;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  resource: { id: string; name: string; arn?: string; gameOwned: boolean };
  title: string;
  text: string;
  /** v2.3: why it matters, in plain words (with any jargon explained). */
  why?: string;
  /** docs.aws.amazon.com page behind the rule. */
  url: string;
  /** Present when the citizens can fix it (with your approval). */
  fix?: FindingFix;
  /** ISO time until which `finding.undo` works, after a fix. */
  undoUntil?: string;
}

/** v2.3: a finding opened, changed or resolved. Sent one per change, and all open ones on connect. */
export interface CityFindingEvent {
  type: 'city.finding';
  finding: CityFinding;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  taskId?: string;
  requestId?: string;
  /**
   * v2.2, optional: why, so the UI can explain it kindly. quota = the player's daily AI calls are used up;
   * paused = the city's AI is switched off (kill switch or global cap); auth = sign in again;
   * unlinked = connect an AWS account first; mfa_required = turn on an authenticator app before linking an
   * AWS account, approving a write (deploy.approve) or applying a fix (finding.fix) (hosted).
   */
  code?: 'quota' | 'paused' | 'auth' | 'unlinked' | 'mfa_required';
}

/** v2.10: the answer to workshop.verify. `detail` is one plain sentence (what was found, or what to try). */
export interface WorkshopVerifiedEvent {
  type: 'workshop.verified';
  workshopId: string;
  stepId: string;
  ok: boolean;
  detail: string;
}

/** v2.11: who's in this Region's city now. `practice`: the demo's made-up mayors, never real players. */
export interface PresenceStateEvent {
  type: 'presence.state';
  region: string;
  online: number;
  mayors: { name: string; rank: string }[];
  practice?: boolean;
}
/** v2.11: this week's top of a board. `you` marks the player's own row; `practice` the demo's made-up board. */
export interface LeaderboardStateEvent {
  type: 'leaderboard.state';
  board: string;
  week: string;
  entries: { name: string; score: number; you?: boolean }[];
  practice?: boolean;
}

export type ServerEvent =
  | TaskPlanEvent
  | TaskStepEvent
  | AgentStateEvent
  | AgentMessageEvent
  | TaskDoneEvent
  | PageClassifiedEvent
  | ChatAnswerEvent
  | ScreenshotUrlEvent
  | ProgressStateEvent
  | AccountLinkUrlEvent
  | AccountStatusEvent
  | DeployPreviewEvent
  | DeployStatusEvent
  | AgentLevelEvent
  | ConsoleStepEvent
  | CityInventoryEvent
  | CityFindingEvent
  | CityBillEvent
  | CityFlowEvent
  | AwsHealthEvent
  | AwsNewsEvent
  | WorkshopVerifiedEvent
  | PresenceStateEvent
  | LeaderboardStateEvent
  | ErrorEvent;

// ── Progress (stored by the backend per Cognito user) ─────────────────────────

export interface LandmarkProgress {
  discovered: boolean;
  xp: number;
}

/** Spaced-repetition state for one flashcard (SM-2 lite). */
export interface CardState {
  /** Days until next review. */
  interval: number;
  ease: number;
  /** Epoch ms of next review. */
  due: number;
  reps: number;
  /** v2.12: the card was remembered for a week once (its one-time bonus is paid). Never unset, even after an Again. */
  remembered?: true;
}

/**
 * Rounds played of one mini-game. v2.12: `scored`, the rounds that scored above 0 (the crown counts these; absent on an
 * older save, where `plays` stands in); `bestTimed`, the best round played against the clock in the ISO week `bestWeek`
 * of the UTC date, the week the boards file it under (`isoWeekUtc`); relaxed rounds never count: it's what the
 * leaderboard is sent.
 */
export interface GameProgress {
  best: number;
  plays: number;
  scored?: number;
  bestTimed?: number;
  bestWeek?: string;
}

export interface Progress {
  version: 1 | 2;
  /** Global services' landmarks (IAM, Route 53, CloudFront), shared by every city. Before v2.7: every landmark. */
  landmarks: Record<string, LandmarkProgress>;
  /** v2.7: each Region is its own city, with its own landmarks (src/state/cities.ts). */
  cities?: Record<string, { landmarks: Record<string, LandmarkProgress> }>;
  cards?: Record<string, CardState>;
  quests?: Record<string, { status: 'active' | 'done'; step: number; count?: number }>;
  puzzles?: Record<string, { best: number }>;
  /** Games played per mini-game id (v2.12: GameProgress's scored rounds and this week's timed best). */
  games?: Record<string, GameProgress>;
  /** v2.3: what each citizen has learned from you (see shared/citizens.json levels). */
  citizens?: Record<string, { xp: number }>;
  /** v2.3: findings fixed, by finding id → ISO time. */
  fixes?: Record<string, string>;
  /**
   * v2.4: the learning streak. `last` is the player's local date (YYYY-MM-DD); `best` the longest run. v2.11: `frozen`,
   * the day the weekly streak freeze last covered a missed day.
   */
  streak?: { days: number; last: string; best: number; frozen?: string };
  /** v2.5: the player turned the bill on (Cost Explorer reads, at most daily). Absent = off. */
  bill?: boolean;
  /** v2.8: the player turned live traffic on (CloudWatch reads, at most every 5 minutes while open). Absent = off. */
  flow?: boolean;
  /** v2.9: golden tokens found around the cities (src/world/tokens.ts), by token id → the local date found (YYYY-MM-DD). */
  finds?: Record<string, string>;
  /**
   * v2.10: hands-on workshops, by workshop id: each step done, in practice (the simulated terminal) or for real (checked
   * in the account by workshop.verify), and the local date the whole workshop was finished.
   */
  workshops?: Record<string, WorkshopProgress>;
  /** v2.10: AWS North Hall talks whose check was passed, by talk id → the local date (YYYY-MM-DD). */
  talks?: Record<string, string>;
  /**
   * v2.11: badges earned at a moment the rest of Progress doesn't record (the re:Invent quiz), by badge id → local date.
   * Most badges are read from Progress itself (src/state/badges.ts) and aren't stored.
   */
  badges?: Record<string, string>;
  /** v2.11: the public profile. Off by default; the name is generated from word lists (no free text). */
  profile?: PlayerProfile;
  /** v2.11: architecture sandbox designs, by design id (at most 20). */
  designs?: Record<string, SavedDesign>;
  /** v2.13: City Clients side jobs, by business id (shared/clients.json): levels finished and tasks done (each pays once ever). */
  clients?: Record<string, ClientProgress>;
  /** v2.13: build mode's decorations, by Region city: the props placed there (at most 120 a city). */
  decor?: Record<string, CityDecor>;
  /** v2.14: City Coins (🪙), the one thing the player spends (src/state/wallet.ts). Stars (⭐) are knowledge and are never spent. */
  wallet?: Wallet;
  /** v2.15: City Lights, the forgiving streak (src/state/lights.ts): each learning day lights a window on the skyline. */
  lights?: CityLights;
  /** v2.15: the free monthly season roads (src/state/season.ts), by season id: points from finished shifts and the steps claimed. */
  seasons?: Record<string, SeasonProgress>;
  /** v2.15: the Daily Supply Drop (src/state/drops.ts): the last day a crate was opened and the cosmetics it gave. */
  drops?: SupplyDrops;
  /** v2.15: the Service Codex (src/state/codex.ts): combos found, by combo id (shared/combos.json) → the local date first found. */
  codex?: CodexProgress;
  updatedAt: string; // ISO; newest wins between server and chrome.storage
}

/**
 * v2.15: City Lights. `days`: the local dates (YYYY-MM-DD) the player learned something, the last 60, sorted; `total`:
 * learning days ever (a window each, never taken away); `freezes`: earned freezes held now (one per 7 learning days, at
 * most 3), each covering one missed day so its window stays lit; `usedFreezes`: the missed days a freeze covered (the
 * last 60). A missed day that no freeze covers dims one window until a later learning day relights it: nothing is lost.
 */
export interface CityLights {
  days: string[];
  total?: number;
  freezes: number;
  usedFreezes?: string[];
  /**
   * v2.16: freezes as counters that only go up: earned ever and used ever (held = earned − used, at most 3; `freezes`
   * is kept equal to it for older clients). A merge takes the higher of each, so a freeze earned on one surface and one
   * spent on the other both count. Absent: `freezes` counts as earned.
   */
  freezesEarned?: number;
  freezesUsed?: number;
}

/**
 * v2.15: one season road: `points` from finished shifts (v2.16: at most the road's end, the rest flows into the next
 * unfinished road), `claimed` the road's step indexes taken, `last` the last day that paid. v2.16 `extra`: crate
 * cosmetic ids a freeze step gave instead while the freezes were full.
 */
export interface SeasonProgress {
  points: number;
  claimed: number[];
  last?: string;
  extra?: string[];
}

/**
 * v2.15: the Daily Supply Drop: `last` the local day a crate was last opened (one a day); `owned` the cosmetic ids it
 * gave. v2.16: `overtime` the local day the overtime goal's bonus crate was opened; `bought` crate cosmetics bought with
 * City Coins in Decorate; `spares` extra copies of an owned decoration a city may place (cosmetic id → count, at most 3),
 * what a crate holds once every crate item is owned.
 */
export interface SupplyDrops {
  last?: string;
  owned: string[];
  overtime?: string;
  bought?: string[];
  spares?: Record<string, number>;
}

/** v2.15: the Service Codex's stored part (service cards and sets are read from the rest of Progress). */
export interface CodexProgress {
  combos: Record<string, string>;
}

/**
 * v2.14: the City Coins wallet. Coins to spend = `earned` − `spent`. Both only ever go up (a refund adds to `earned`),
 * so a merge takes the higher of each and nothing earned or spent on either surface goes negative. `log`: coins earned
 * on each of the last 14 local days (YYYY-MM-DD), for "today" lines. `refunded`: stars spent on decorations before
 * v2.14 (CityDecor.spent), given back once as coins; kept so the refund is never paid twice. `shift`: the last local day
 * (YYYY-MM-DD) whose finished shift paid its coins, so a day's shift pays once across surfaces. v2.16 `refundedBy`: those
 * refunded stars city by city (Region → stars), so an older client still buying with stars in one city is refunded only
 * what's new there; `refunded` stays their total.
 */
export interface Wallet {
  earned: number;
  spent: number;
  log?: { day: string; coins: number }[];
  refunded?: number;
  refundedBy?: Record<string, number>;
  shift?: string;
}

/**
 * v2.13: one business's side jobs (src/world/clients.ts). `level`: levels finished (0..3); `done`: the ids of tasks done
 * (any level; a task pays its stars once ever); `at`: level → the local date (YYYY-MM-DD) it was finished. Merged as
 * the higher level, the union of `done` and the earlier date per level.
 */
export interface ClientProgress {
  level: number;
  done: string[];
  at?: Record<string, string>;
}

/** v2.13: one decoration placed in build mode: an id, the prop's kind (its atlas sprite), its tile and the local date placed. */
export interface DecorProp {
  id: string;
  kind: string;
  x: number;
  y: number;
  at: string;
}

/**
 * v2.13: a city's decorations. v2.16: merged prop by prop: every prop in either copy unless either lists it in `gone`
 * (prop ids removed, the last 200), a prop in both where the copy with the later `updatedAt` has it. A copy without
 * `gone` (before v2.16) can't say what it removed, so then the later copy wins whole, city by city, as in v2.13.
 */
export interface CityDecor {
  updatedAt: string;
  props: DecorProp[];
  gone?: string[];
  /**
   * Before v2.14: stars spent on this city's decorations, net of refunds. v2.14 decorations cost City Coins (Progress.wallet)
   * and a client moves this into the wallet once (refunded as coins) and drops it; an older client may still send it.
   */
  spent?: number;
}

/** v2.11: what other players may see: a generated Mayor name, only while `public` is on. */
export interface PlayerProfile {
  public: boolean;
  /** Two words from src/state/names.ts lists, e.g. "Kind Otter" (shown as "Mayor Kind Otter"). */
  name: string;
}

/** v2.11: one sandbox drawing (src/ui/diagram/Sandbox.tsx): icons and groups on a grid, and the arrows between them. */
export interface SavedDesign {
  name: string;
  updatedAt: string;
  nodes: { id: string; kind: string; x: number; y: number; w?: number; h?: number }[];
  edges: { from: string; to: string }[];
}

export interface WorkshopProgress {
  steps: Record<string, 'practice' | 'real'>;
  done?: string;
}

export const SERVER_EVENT_TYPES: ServerEvent['type'][] = [
  'task.plan',
  'task.step',
  'agent.state',
  'agent.message',
  'task.done',
  'page.classified',
  'chat.answer',
  'screenshot.url',
  'progress.state',
  'account.linkUrl',
  'account.status',
  'deploy.preview',
  'deploy.status',
  'agent.level',
  'console.step',
  'city.inventory',
  'city.finding',
  'city.bill',
  'city.flow',
  'aws.health',
  'aws.news',
  'workshop.verified',
  'presence.state',
  'leaderboard.state',
  'error',
];

/** Minimal runtime guard for frames coming off the socket. */
export function isServerEvent(x: unknown): x is ServerEvent {
  return !!x && typeof x === 'object' && SERVER_EVENT_TYPES.includes((x as { type: ServerEvent['type'] }).type);
}

/**
 * WebSocket close codes the server uses. `reauth`: reconnect with a fresh token. `deleted`: the player deleted their
 * account (here or on another device): sign out, never reconnect (the server also refuses that player for a while).
 * `tooMany`: too many tabs. `restarting`: a deploy is rolling; reconnect with jitter.
 */
export const CLOSE_CODES = { reauth: 4401, deleted: 4403, tooMany: 4429, restarting: 1012 } as const;

/** WebSocket subprotocols that carry the bearer JWT (the token never goes in the URL). */
export function bearerSubprotocols(jwt: string): string[] {
  const b64url = btoa(jwt).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return [`base64UrlBearerAuthorization.${b64url}`, 'base64UrlBearerAuthorization'];
}
