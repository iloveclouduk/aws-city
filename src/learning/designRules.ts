// A Well-Architected review of a sandbox design (src/ui/diagram/Sandbox.tsx): rules only, no model. Each rule looks at
// what's on the board and how it's wired, and names the official best practice behind it, using only best-practice ids
// already verified in shared/wa-rules.json and shared/puzzles.json (looked up by id, so none is typed in twice).
import type { PillarKey, SavedDesign } from '@/backend/contract';
import puzzlesJson from '../../shared/puzzles.json' with { type: 'json' };
import rulesJson from '../../shared/wa-rules.json' with { type: 'json' };
import flowsJson from '../../shared/flows.json' with { type: 'json' };
import type { WaBestPractice } from '@/world/content';

type Node = SavedDesign['nodes'][number];

const KNOWN: Record<string, WaBestPractice> = {};
for (const r of (rulesJson as unknown as { rules: { bp?: WaBestPractice }[] }).rules) if (r.bp) KNOWN[r.bp.id] = r.bp;
for (const p of (puzzlesJson as unknown as { puzzles: { pillarBonus: Record<string, { bp?: WaBestPractice }> }[] }).puzzles)
  for (const b of Object.values(p.pillarBonus)) if (b.bp) KNOWN[b.bp.id] = b.bp;
/** A verified best practice by id (throws on an unknown id, so a typo fails the tests, not the player). */
export const bp = (id: string): WaBestPractice => {
  const b = KNOWN[id];
  if (!b) throw new Error(`No verified best practice ${id} in shared/wa-rules.json or shared/puzzles.json`);
  return b;
};

export interface DesignFinding {
  id: string;
  pillar: PillarKey;
  severity: 'low' | 'medium' | 'high';
  title: string;
  fix: string;
  bp: WaBestPractice;
}

const COMPUTE = ['ec2', 'ecs', 'eks', 'beanstalk'];
const IN_VPC_DATA = ['rds', 'aurora', 'elasticache', 'redshift', 'neptune'];
const DATA = [...IN_VPC_DATA, 'dynamodb', 's3', 'efs', 'ebs'];
const FRONT_DOORS = ['cloudfront', 'apigateway'];
const isGroup = (n: Node, kind: string) => n.kind === `group:${kind}`;
const inside = (n: Node, g: Node) => n.x >= g.x && n.y >= g.y && n.x < g.x + (g.w ?? 1) && n.y < g.y + (g.h ?? 1);

/** Everything the review flags, most severe first. An empty board gets nothing (there's nothing to review yet). */
export function reviewDesign(d: Pick<SavedDesign, 'nodes' | 'edges'>): DesignFinding[] {
  const services = d.nodes.filter((n) => !n.kind.includes(':'));
  if (!services.length) return [];
  const has = (...ids: string[]) => services.some((n) => ids.includes(n.kind));
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const from = (n: Node) => d.edges.filter((e) => e.from === n.id).map((e) => byId.get(e.to)).filter((x): x is Node => !!x);
  const into = (n: Node) => d.edges.filter((e) => e.to === n.id).map((e) => byId.get(e.from)).filter((x): x is Node => !!x);
  const users = d.nodes.filter((n) => n.kind === 'actor:users');
  const out: DesignFinding[] = [];

  const azs = d.nodes.filter((n) => isGroup(n, 'az'));
  if (has(...COMPUTE, ...IN_VPC_DATA) && azs.length < 2)
    out.push({ id: 'single-az', pillar: 'reliability', severity: 'high', title: 'Everything is in one Availability Zone', fix: 'Draw two AZ boxes and put a copy of your servers and database in each, so one going dark keeps you running.', bp: bp('REL10-BP01') });

  const publicNets = d.nodes.filter((n) => isGroup(n, 'public'));
  const exposedDb = services.filter((n) => IN_VPC_DATA.includes(n.kind) && (publicNets.some((g) => inside(n, g)) || into(n).some((x) => x.kind === 'actor:users')));
  if (exposedDb.length)
    out.push({ id: 'public-database', pillar: 'security', severity: 'high', title: 'A database can be reached from the internet', fix: 'Keep databases in a private subnet, reached only by your app, never straight from users.', bp: bp('SEC05-BP01') });

  const queues = services.filter((n) => n.kind === 'sqs');
  if (queues.length && !queues.some((q) => from(q).some((x) => x.kind === 'sqs')))
    out.push({ id: 'queue-no-dlq', pillar: 'reliability', severity: 'medium', title: 'The queue has no dead-letter queue', fix: 'Add a second SQS queue and an arrow to it: messages that keep failing park there instead of blocking the line.', bp: bp('REL05-BP04') });

  const doors = services.filter((n) => FRONT_DOORS.includes(n.kind) && into(n).some((x) => x.kind === 'actor:users'));
  if (doors.length && !has('shield'))
    out.push({ id: 'no-waf', pillar: 'security', severity: 'medium', title: 'Your public front door has no web firewall', fix: 'Put Shield & WAF in front of CloudFront or API Gateway to filter bad requests before they reach your app.', bp: bp('SEC05-BP03') });

  if (services.some((n) => n.kind === 'apigateway' && into(n).some((x) => x.kind === 'actor:users')) && !has('cognito', 'iam'))
    out.push({ id: 'no-auth', pillar: 'security', severity: 'medium', title: 'Anyone can call your API', fix: 'Add Cognito (or IAM) so only signed-in users get in, each with just the access they need.', bp: bp('SEC03-BP02') });

  if (!has('cloudwatch'))
    out.push({ id: 'no-logging', pillar: 'security', severity: 'medium', title: 'Nothing records what happened', fix: 'Add CloudWatch & CloudTrail: logs and metrics from every part, and a record of who changed what.', bp: bp('SEC04-BP01') });

  if (has(...COMPUTE) && !has('cloudwatch'))
    out.push({ id: 'no-alarms', pillar: 'operational', severity: 'low', title: 'No alarms tell you when something breaks', fix: 'With CloudWatch in the design, set alarms on errors and latency so you hear about a problem first.', bp: bp('OPS08-BP04') });

  if (services.some((n) => DATA.includes(n.kind)) && !has('kms'))
    out.push({ id: 'keys', pillar: 'security', severity: 'low', title: 'No keys you control for your data', fix: 'S3 and DynamoDB encrypt at rest by default; add KMS to use keys you control and can audit.', bp: bp('SEC08-BP01') });

  if (users.length && services.some((n) => ['ec2', 'ecs', 'eks', 'lambda'].includes(n.kind) && into(n).some((x) => x.kind === 'actor:users')))
    out.push({ id: 'direct-compute', pillar: 'reliability', severity: 'low', title: 'Users reach your servers directly', fix: 'Put API Gateway or CloudFront in front, so servers can change, scale or fail behind one steady front door.', bp: bp('REL02-BP01') });

  if (has('rds', 'aurora') && !has('elasticache') && into(services.find((n) => ['rds', 'aurora'].includes(n.kind))!).length > 1)
    out.push({ id: 'no-cache', pillar: 'performance', severity: 'low', title: 'Every read goes to the database', fix: 'An ElastiCache cache in front of a busy database answers repeat reads in microseconds.', bp: bp('PERF03-BP05') });

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ── Arrow direction (shared/flows.json) ──
// Each flow lists its services in the order a request travels (Route 53 → CloudFront → API Gateway → Lambda → DynamoDB).
// An arrow is backwards when a flow has the two services next to each other the other way round and no flow ever has
// them this way round. Queues, topics, event buses and streams are left out: work flows into and out of them both ways
// (Lambda sends to SQS, SQS invokes Lambda), so the flows can't say which way is wrong.
const FLOWS = (flowsJson as unknown as { flows: { name: string; serviceIds: string[] }[] }).flows;
const BOTH_WAYS = new Set(['sqs', 'sns', 'eventbridge', 'kinesis', 'stepfunctions', 'msk', 'mq']);

export interface BackwardArrow {
  from: string;
  to: string;
  /** The flow that shows the right way (`to` → `from`). */
  flow: string;
}

/** The arrows that point against every flow that wires those two services (see above). */
export function backwardArrows(d: Pick<SavedDesign, 'nodes' | 'edges'>): BackwardArrow[] {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const out: BackwardArrow[] = [];
  for (const e of d.edges) {
    const a = byId.get(e.from)?.kind;
    const b = byId.get(e.to)?.kind;
    if (!a || !b || a === b || a.includes(':') || b.includes(':') || BOTH_WAYS.has(a) || BOTH_WAYS.has(b)) continue;
    if (FLOWS.some((f) => f.serviceIds.includes(a) && f.serviceIds.includes(b) && f.serviceIds.indexOf(a) < f.serviceIds.indexOf(b))) continue;
    const right = FLOWS.find((f) => f.serviceIds.indexOf(a) - f.serviceIds.indexOf(b) === 1 && f.serviceIds.includes(b));
    if (right) out.push({ from: a, to: b, flow: right.name });
  }
  return out;
}

/** Services on the board that at least one arrow touches. */
const wired = (d: Pick<SavedDesign, 'nodes' | 'edges'>) => {
  const ends = new Set(d.edges.flatMap((e) => [e.from, e.to]));
  return d.nodes.filter((n) => !n.kind.includes(':') && ends.has(n.id));
};

/** Why a design doesn't pass yet, in plain words (empty: it passes). */
export function passGaps(d: Pick<SavedDesign, 'nodes' | 'edges'>, findings = reviewDesign(d)): string[] {
  const gaps: string[] = [];
  const n = wired(d).length;
  if (n < 3) gaps.push(`Wire at least 3 services together with arrows (${n} so far).`);
  if (d.edges.length < 2) gaps.push(`Draw at least 2 arrows (${d.edges.length} so far).`);
  const back = backwardArrows(d).length;
  if (back) gaps.push(`Turn round ${back === 1 ? 'the arrow' : `the ${back} arrows`} pointing the wrong way.`);
  const red = findings.filter((f) => f.severity === 'high').length;
  if (red) gaps.push(`Fix ${red === 1 ? 'the red issue' : `the ${red} red issues`}.`);
  return gaps;
}

/**
 * A design passes when at least three services are wired together with two or more arrows, every arrow points the way
 * requests travel (backwardArrows), and nothing high is flagged.
 */
export const designPasses = (d: Pick<SavedDesign, 'nodes' | 'edges'>, findings = reviewDesign(d)) => passGaps(d, findings).length === 0;
