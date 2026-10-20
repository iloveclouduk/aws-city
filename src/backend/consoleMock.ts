// The mock backend's Console Copilot brain: decides the next console step from the live page snapshot.
// Scripted, snapshot-driven demo flows (reliable offline demos) for S3 "Create bucket", EC2 "Launch
// instance", DynamoDB "Create table", Lambda "Create function", RDS "Create database", CloudFront "Create
// distribution", SQS "Create queue" and IAM "Create role" (each runs end to end on the practice console,
// src/console/practicePage.ts); for anything else it points at a few relevant controls, explains them and ends as
// practice only (`ok: false`), so the offline demo never claims it did a task it can't script. The server (server/)
// uses Claude on Bedrock for any page.
import type { ConsoleStepEvent, PageSnapshot, ServerEvent, SnapshotItem } from './contract';
import { placeFor } from '@/world/places';

type Step = Omit<ConsoleStepEvent, 'type' | 'taskId' | 'index' | 'agentId'>;
export type FlowId = 's3' | 'ec2' | 'dynamodb' | 'lambda' | 'rds' | 'cloudfront' | 'sqs' | 'iam';
interface Task {
  goal: string;
  agentId: string;
  flow?: FlowId;
  index: number;
  did: Set<string>;
  misses: number;
  /** The resource name this run creates (random suffix so repeated demos don't collide). */
  name: string;
}

const MAX_STEPS = 25;
const find = (s: PageSnapshot, re: RegExp, role?: string) => s.items.find((i) => re.test(i.name) && (!role || i.role === role));
const target = (i: SnapshotItem) => ({ id: i.id, name: i.name });
const suffix = () => Math.random().toString(36).slice(2, 6);

/**
 * One scripted step: fires once (key), when its control is on screen. Rules run in order; `onForm`
 * tells the flow whether the create form is showing (the list page's "Create" button opens it).
 */
interface Rule {
  key: string;
  find: (s: PageSnapshot) => SnapshotItem | undefined;
  step: (i: SnapshotItem, t: Task) => Step;
  /** Only when the form is open (default) or only when it isn't. */
  page?: 'form' | 'list';
}
interface Flow {
  onForm: (s: PageSnapshot) => boolean;
  rules: Rule[];
  /** The rule whose success means the resource was created. */
  finalKey: string;
  done: (t: Task) => Step;
}

const S3: Flow = {
  onForm: (s) => !!find(s, /^bucket name/i, 'textbox'),
  finalKey: 'create',
  rules: [
    { key: 'open', page: 'list', find: (s) => find(s, /^create bucket$/i), step: (i) => ({ action: 'click', target: target(i), say: 'Opening the “Create bucket” form for you.', why: 'A bucket is the top-level container for your S3 objects, like a lake that holds all your fish.', risk: 'safe' }) },
    { key: 'name', find: (s) => find(s, /^bucket name/i, 'textbox'), step: (i, t) => ({ action: 'type', target: target(i), value: t.name, say: `Naming it ${t.name}.`, why: 'Bucket names are 3–63 lowercase letters, numbers, dots or hyphens, starting and ending with a letter or number. They appear in URLs and must be unique across the whole AWS partition. Names ending in your account ID, Region and -an are reserved for your account.', risk: 'safe' }) },
    { key: 'bpa', find: (s) => find(s, /block all public access/i), step: (i) => ({ action: 'point', target: target(i), say: 'Leaving “Block all public access” switched ON.', why: 'Public buckets are a leading cause of S3 data leaks. Only turn this off for content you mean to make public, and use CloudFront for websites.', risk: 'safe' }) },
    { key: 'enc', find: (s) => find(s, /(server-side encryption|sse-s3|encryption type)/i), step: (i) => ({ action: 'point', target: target(i), say: 'Default encryption stays on (SSE-S3).', why: 'S3 encrypts every new object at rest by default. Choose SSE-KMS when you need your own key and an audit trail in CloudTrail.', risk: 'safe' }) },
    { key: 'create', find: (s) => find(s, /^create bucket$/i), step: () => ({ action: 'click', target: { name: 'Create bucket' }, say: 'Creating the bucket now.', why: 'S3 creates it in the Region you picked. You pay only for what you store and request, so an empty bucket costs nothing.', risk: 'safe' }) },
  ],
  done: (t) => ({ action: 'done', say: `Done! ${t.name} is ready. Try uploading a file to it.`, why: 'Next up: storage classes and lifecycle rules. Ask Sally at S3 Lake.', risk: 'safe' }),
};

const EC2: Flow = {
  onForm: (s) => !!find(s, /^instance type/i) || /launch an instance/i.test(s.heading ?? ''),
  finalKey: 'launch',
  rules: [
    { key: 'open', page: 'list', find: (s) => find(s, /^launch instances?$/i), step: (i) => ({ action: 'click', target: target(i), say: 'Opening the “Launch an instance” wizard.', why: 'An EC2 instance is a virtual server you rent by the second: you pick its OS image, size, login and firewall.', risk: 'safe' }) },
    { key: 'name', find: (s) => find(s, /^name$/i, 'textbox'), step: (i, t) => ({ action: 'type', target: target(i), value: t.name, say: `Naming it ${t.name}.`, why: 'The name is just a “Name” tag. Tags help you find, group and track the cost of resources, so tag everything from day one.', risk: 'safe' }) },
    { key: 'ami', find: (s) => find(s, /^amazon linux/i, 'radio'), step: (i) => ({ action: 'point', target: target(i), say: 'Keeping Amazon Linux as the operating system.', why: 'An AMI (Amazon Machine Image) is the disk image the server boots from. Amazon Linux 2023 has no license fee, gets AWS security updates and is tuned for EC2.', risk: 'safe' }) },
    { key: 'type', find: (s) => find(s, /^instance type/i, 'combobox'), step: (i) => ({ action: 'select', target: target(i), value: 't3.micro', say: 'Choosing the t3.micro instance type.', why: 't3.micro is Free Tier eligible on both the old plan and the July 2025 plan, and it runs the default x86 AMI. The “t” means burstable CPU, good for light workloads.', risk: 'safe' }) },
    { key: 'key', find: (s) => find(s, /^key pair/i, 'combobox'), step: (i) => ({ action: 'point', target: target(i), say: 'We can proceed without a key pair.', why: 'Key pairs are for SSH logins. EC2 Instance Connect lets you log in from the console without long-lived keys to lose, which is safer for a demo.', risk: 'safe' }) },
    { key: 'sg', find: (s) => find(s, /^create security group/i, 'radio'), step: (i) => ({ action: 'point', target: target(i), say: 'Keeping the default: a new security group.', why: 'A security group is the instance’s firewall. This new one allows SSH from anywhere. Fine for a brief test, but for real projects allow SSH only from your own IP address. If you connect from the console, allow the EC2 Instance Connect prefix list instead.', risk: 'safe' }) },
    { key: 'launch', find: (s) => find(s, /^launch instance$/i), step: () => ({ action: 'click', target: { name: 'Launch instance' }, say: 'Launching the instance now.', why: 'You pay per second while it runs. Stop or terminate it when you’re done. A stopped instance still bills for its EBS disk and any Elastic IP.', risk: 'confirm' }) },
  ],
  done: (t) => ({ action: 'done', say: `Done! ${t.name} is launching on a t3.micro.`, why: 'Next: connect with EC2 Instance Connect, then stop it when you’re finished so it doesn’t keep costing money.', risk: 'safe' }),
};

const DYNAMODB: Flow = {
  onForm: (s) => !!find(s, /^table name/i, 'textbox'),
  finalKey: 'create',
  rules: [
    { key: 'open', page: 'list', find: (s) => find(s, /^create table$/i), step: (i) => ({ action: 'click', target: target(i), say: 'Opening the “Create table” form.', why: 'DynamoDB is a serverless key-value database: no servers to size, single-digit-millisecond reads at any scale.', risk: 'safe' }) },
    { key: 'name', find: (s) => find(s, /^table name/i, 'textbox'), step: (i, t) => ({ action: 'type', target: target(i), value: t.name, say: `Naming the table ${t.name}.`, why: 'Table names are unique per account and Region. AWS advises few tables: design keys around the queries you’ll run.', risk: 'safe' }) },
    { key: 'pk', find: (s) => find(s, /^partition key/i, 'textbox'), step: (i) => ({ action: 'type', target: target(i), value: 'id', say: 'Using “id” as the partition key.', why: 'The partition key decides which storage partition holds each item. Pick something with many distinct values, like an id, so load spreads evenly.', risk: 'safe' }) },
    { key: 'defaults', find: (s) => find(s, /^default settings/i, 'radio'), step: (i) => ({ action: 'point', target: target(i), say: 'Keeping the default settings (on-demand capacity).', why: 'On-demand capacity bills per request and scales automatically, so it suits traffic you can’t predict yet. Switch to provisioned later for steady loads.', risk: 'safe' }) },
    { key: 'create', find: (s) => find(s, /^create table$/i), step: () => ({ action: 'click', target: { name: 'Create table' }, say: 'Creating the table now.', why: 'An empty on-demand table costs nothing; you pay for reads, writes and storage as you use them.', risk: 'safe' }) },
  ],
  done: (t) => ({ action: 'done', say: `Done! ${t.name} is ready. Try “Explore table items” to add one.`, why: 'Next: add a sort key or a global secondary index when you need new query patterns.', risk: 'safe' }),
};

const LAMBDA: Flow = {
  onForm: (s) => !!find(s, /^function name/i, 'textbox'),
  finalKey: 'create',
  rules: [
    { key: 'open', page: 'list', find: (s) => find(s, /^create function$/i), step: (i) => ({ action: 'click', target: target(i), say: 'Opening the “Create function” form.', why: 'Lambda runs your code without servers: you upload a function, AWS runs it on each event and bills per millisecond.', risk: 'safe' }) },
    {
      key: 'scratch',
      find: (s) => find(s, /^author from scratch/i, 'radio'),
      step: (i) =>
        i.checked
          ? { action: 'point', target: target(i), say: '“Author from scratch” is already selected.', why: 'Starting from scratch gives you a tiny Hello World handler — the clearest way to see how a function works.', risk: 'safe' }
          : { action: 'click', target: target(i), say: 'Picking “Author from scratch”.', why: 'Starting from scratch gives you a tiny Hello World handler — the clearest way to see how a function works.', risk: 'safe' },
    },
    { key: 'name', find: (s) => find(s, /^function name/i, 'textbox'), step: (i) => ({ action: 'type', target: target(i), value: 'city-hello', say: 'Naming it city-hello.', why: 'The name becomes part of the function’s ARN, which other services use to invoke it.', risk: 'safe' }) },
    { key: 'runtime', find: (s) => find(s, /^runtime/i, 'combobox'), step: (i) => ({ action: 'select', target: target(i), value: 'Node.js 24.x', say: 'Choosing the Node.js 24.x runtime.', why: 'The runtime is the language environment Lambda starts for your code. Use the newest non-preview version for security patches and speed.', risk: 'safe' }) },
    { key: 'create', find: (s) => find(s, /^create function$/i), step: () => ({ action: 'click', target: { name: 'Create function' }, say: 'Creating the function now.', why: 'Lambda also creates a basic execution role that only lets the function write its logs to CloudWatch.', risk: 'safe' }) },
  ],
  done: () => ({ action: 'done', say: 'Done! city-hello is live. Press “Test” to run it once.', why: 'Next: add a trigger (API Gateway, S3, EventBridge) so something calls your function.', risk: 'safe' }),
};

const RDS: Flow = {
  onForm: (s) => !!find(s, /^db instance identifier/i, 'textbox'),
  finalKey: 'create',
  rules: [
    { key: 'open', page: 'list', find: (s) => find(s, /^create database$/i), step: (i) => ({ action: 'click', target: target(i), say: 'Opening the “Create database” form.', why: 'Amazon RDS runs a relational database for you: AWS handles the hardware, patching and backups, and you keep using SQL.', risk: 'safe' }) },
    {
      key: 'easy',
      find: (s) => find(s, /^easy create/i, 'radio'),
      step: (i) =>
        i.checked
          ? { action: 'point', target: target(i), say: '“Easy create” is already picked.', why: 'Easy create uses recommended best-practice settings, and you can change most of them after the database exists.', risk: 'safe' }
          : { action: 'click', target: target(i), say: 'Picking “Easy create”.', why: 'Easy create uses recommended best-practice settings, and you can change most of them after the database exists.', risk: 'safe' },
    },
    { key: 'engine', find: (s) => find(s, /^postgresql/i, 'radio'), step: (i) => ({ action: 'click', target: target(i), say: 'Choosing the PostgreSQL engine.', why: 'The engine is the database software. PostgreSQL is open source and popular; RDS also runs MySQL, MariaDB, Oracle, SQL Server and Db2.', risk: 'safe' }) },
    { key: 'size', find: (s) => find(s, /^free tier/i, 'radio'), step: (i) => ({ action: 'click', target: target(i), say: 'Choosing the Free tier size.', why: 'A small burstable instance is enough to learn on. Production sizes cost more per hour, so pick them only for real traffic.', risk: 'safe' }) },
    { key: 'name', find: (s) => find(s, /^db instance identifier/i, 'textbox'), step: (i, t) => ({ action: 'type', target: target(i), value: t.name, say: `Naming it ${t.name}.`, why: 'The identifier names the database instance in this account and Region. It becomes part of its endpoint address.', risk: 'safe' }) },
    { key: 'creds', find: (s) => find(s, /^manage master credentials/i, 'checkbox'), step: (i) => ({ action: 'point', target: target(i), say: 'Leaving the sign-in to AWS Secrets Manager.', why: 'RDS creates the database password in Secrets Manager and can rotate it, so nobody types it or keeps it in a note. I never type passwords for you.', risk: 'safe' }) },
    { key: 'create', find: (s) => find(s, /^create database$/i), step: () => ({ action: 'click', target: { name: 'Create database' }, say: 'Ready to create the database.', why: 'A database instance bills by the hour while it runs, even when nobody uses it. Delete it when you finish practising.', risk: 'confirm' }) },
  ],
  done: (t) => ({ action: 'done', say: `Done! ${t.name} is being created. It takes a few minutes to become available.`, why: 'Next: connect to it from an app in the same VPC, and keep it private: no public access.', risk: 'safe' }),
};

const CLOUDFRONT: Flow = {
  onForm: (s) => !!find(s, /^origin domain/i, 'combobox'),
  finalKey: 'create',
  rules: [
    { key: 'open', page: 'list', find: (s) => find(s, /^create distribution$/i), step: (i) => ({ action: 'click', target: target(i), say: 'Opening the “Create distribution” form.', why: 'A CloudFront distribution serves your content from edge locations near your viewers, so pages load faster and your origin gets fewer requests.', risk: 'safe' }) },
    { key: 'origin', find: (s) => find(s, /^origin domain/i, 'combobox'), step: (i) => ({ action: 'select', target: target(i), value: 'city-site.s3.us-west-2.amazonaws.com', say: 'Picking the city-site bucket as the origin.', why: 'The origin is where CloudFront fetches content it doesn’t have cached yet: here, an S3 bucket.', risk: 'safe' }) },
    { key: 'oac', find: (s) => find(s, /^origin access control/i, 'radio'), step: (i) => ({ action: 'click', target: target(i), say: 'Choosing origin access control.', why: 'With origin access control the bucket stays private and only this distribution can read it. Viewers can’t go around CloudFront.', risk: 'safe' }) },
    { key: 'https', find: (s) => find(s, /^redirect http to https/i, 'radio'), step: (i) => ({ action: 'click', target: target(i), say: 'Redirecting HTTP to HTTPS.', why: 'Viewers who type http:// are sent to the encrypted https:// address, so nothing travels in plain text.', risk: 'safe' }) },
    { key: 'price', find: (s) => find(s, /^use all edge locations/i, 'radio'), step: (i) => ({ action: 'point', target: target(i), say: 'Keeping all edge locations.', why: 'The price class decides which edge locations serve your content. Fewer locations cost a little less per request but are slower for faraway viewers.', risk: 'safe' }) },
    { key: 'create', find: (s) => find(s, /^create distribution$/i), step: () => ({ action: 'click', target: { name: 'Create distribution' }, say: 'Creating the distribution now.', why: 'You pay for data sent to viewers and for requests, so an unused distribution costs next to nothing.', risk: 'safe' }) },
  ],
  done: () => ({ action: 'done', say: 'Done! The distribution is deploying to the edge.', why: 'Next: update the bucket policy CloudFront suggests, so the distribution can read the bucket.', risk: 'safe' }),
};

const SQS: Flow = {
  onForm: (s) => /^create queue$/i.test(s.heading ?? ''),
  finalKey: 'create',
  rules: [
    { key: 'open', page: 'list', find: (s) => find(s, /^create queue$/i), step: (i) => ({ action: 'click', target: target(i), say: 'Opening the “Create queue” form.', why: 'An SQS queue holds messages between parts of an app, so a busy producer never has to wait for a slow consumer.', risk: 'safe' }) },
    { key: 'type', find: (s) => find(s, /^standard/i, 'radio'), step: (i) => ({ action: 'point', target: target(i), say: 'Keeping a Standard queue.', why: 'Standard queues deliver each message at least once with nearly unlimited throughput. Choose FIFO when order and exactly-once processing matter.', risk: 'safe' }) },
    { key: 'name', find: (s) => find(s, /^name$/i, 'textbox'), step: (i, t) => ({ action: 'type', target: target(i), value: t.name, say: `Naming it ${t.name}.`, why: 'Queue names are unique in your account and Region. A FIFO queue’s name has to end in .fifo.', risk: 'safe' }) },
    { key: 'vt', find: (s) => find(s, /^visibility timeout/i, 'textbox'), step: (i) => ({ action: 'point', target: target(i), say: 'Leaving the visibility timeout at 30 seconds.', why: 'After a consumer takes a message, it stays hidden this long. Set it longer than your consumer needs to process one message, or it may be handled twice.', risk: 'safe' }) },
    { key: 'enc', find: (s) => find(s, /^amazon sqs key/i, 'radio'), step: (i) => ({ action: 'point', target: target(i), say: 'Encryption stays on (SSE-SQS).', why: 'Messages are encrypted at rest with a key SQS manages. Pick SSE-KMS when you need your own key and an audit trail.', risk: 'safe' }) },
    { key: 'create', find: (s) => find(s, /^create queue$/i), step: () => ({ action: 'click', target: { name: 'Create queue' }, say: 'Creating the queue now.', why: 'You pay per request, and the first million requests each month are free, so an idle queue costs nothing.', risk: 'safe' }) },
  ],
  done: (t) => ({ action: 'done', say: `Done! ${t.name} is ready. Try “Send and receive messages”.`, why: 'Next: add a dead-letter queue so messages that keep failing are set aside instead of retried forever.', risk: 'safe' }),
};

const IAM_PAGES = /^(select trusted entity|add permissions|name, review, and create)$/i;
const onIamPage = (s: PageSnapshot, page: RegExp) => page.test(s.heading ?? '');
const IAM: Flow = {
  onForm: (s) => IAM_PAGES.test(s.heading ?? ''),
  finalKey: 'create',
  rules: [
    { key: 'open', page: 'list', find: (s) => find(s, /^create role$/i), step: (i) => ({ action: 'click', target: target(i), say: 'Opening the “Create role” wizard.', why: 'An IAM role is an identity with permissions that a service can take on for a while, with short-term credentials instead of stored keys.', risk: 'safe' }) },
    { key: 'entity', find: (s) => onIamPage(s, /^select trusted entity$/i) ? find(s, /^aws service/i, 'radio') : undefined, step: (i) => ({ action: 'point', target: target(i), say: 'Keeping “AWS service” as the trusted entity.', why: 'The trusted entity is who may take on the role. Here it’s an AWS service, so nobody outside your account can use it.', risk: 'safe' }) },
    { key: 'usecase', find: (s) => onIamPage(s, /^select trusted entity$/i) ? find(s, /^service or use case/i, 'combobox') : undefined, step: (i) => ({ action: 'select', target: target(i), value: 'Lambda', say: 'Choosing Lambda as the use case.', why: 'This writes the trust policy: only the Lambda service may assume the role, for your functions.', risk: 'safe' }) },
    { key: 'next1', find: (s) => onIamPage(s, /^select trusted entity$/i) ? find(s, /^next$/i, 'button') : undefined, step: (i) => ({ action: 'click', target: target(i), say: 'On to permissions.', why: 'Trust says who can use the role; permissions say what it can do once they have.', risk: 'safe' }) },
    {
      key: 'policy',
      find: (s) => (onIamPage(s, /^add permissions$/i) ? find(s, /^awslambdabasicexecutionrole/i, 'checkbox') : undefined),
      step: (i) =>
        i.checked
          ? { action: 'point', target: target(i), say: 'AWSLambdaBasicExecutionRole is already ticked.', why: 'It only lets the function write its logs to CloudWatch: least privilege, nothing more.', risk: 'safe' }
          : { action: 'click', target: target(i), say: 'Ticking AWSLambdaBasicExecutionRole.', why: 'It only lets the function write its logs to CloudWatch: least privilege. Full-access policies like AdministratorAccess are never the place to start, so I leave them alone.', risk: 'safe' },
    },
    { key: 'next2', find: (s) => onIamPage(s, /^add permissions$/i) ? find(s, /^next$/i, 'button') : undefined, step: (i) => ({ action: 'click', target: target(i), say: 'On to naming the role.', why: 'You can add or remove policies later; start small and add what the function turns out to need.', risk: 'safe' }) },
    { key: 'name', find: (s) => onIamPage(s, /^name, review, and create$/i) ? find(s, /^role name/i, 'textbox') : undefined, step: (i, t) => ({ action: 'type', target: target(i), value: t.name, say: `Naming it ${t.name}.`, why: 'Role names are unique in your account. A clear name says what uses it and why, which helps the next person who reviews access.', risk: 'safe' }) },
    { key: 'create', find: (s) => onIamPage(s, /^name, review, and create$/i) ? find(s, /^create role$/i) : undefined, step: () => ({ action: 'click', target: { name: 'Create role' }, say: 'Ready to create the role.', why: 'A role changes who can do what in your account, so you press this one yourself after reading the trust policy above it.', risk: 'confirm' }) },
  ],
  done: (t) => ({ action: 'done', say: `Done! ${t.name} is ready for a Lambda function.`, why: 'Next: pick it as the execution role when you create a function, and check IAM Access Analyzer for unused permissions later.', risk: 'safe' }),
};

const FLOWS: Record<FlowId, Flow> = { s3: S3, ec2: EC2, dynamodb: DYNAMODB, lambda: LAMBDA, rds: RDS, cloudfront: CLOUDFRONT, sqs: SQS, iam: IAM };

export const isFlow = (id: string): id is FlowId => id in FLOWS;
const BY_PATH: Record<string, FlowId> = { s3: 's3', ec2: 'ec2', dynamodbv2: 'dynamodb', dynamodb: 'dynamodb', lambda: 'lambda', rds: 'rds', cloudfront: 'cloudfront', sqs: 'sqs', iam: 'iam', iamv2: 'iam' };

/**
 * The scripted flow for a task, by the task's service: the service it names (a workshop step's, or the console page's),
 * else the service in the console URL's path, else a service named outright in the goal. Never by loose words: "an RDS
 * instance" isn't EC2 and "CloudFront functions" aren't Lambda. A named service without a flow has none (practice only).
 */
export function flowFor(serviceId: string | undefined, url = '', goal = ''): FlowId | undefined {
  if (serviceId) return isFlow(serviceId) ? serviceId : undefined;
  let path = '';
  try {
    path = new URL(url).pathname.split('/')[1]?.toLowerCase() ?? '';
  } catch {
    /* no url */
  }
  if (path && path !== 'console') return BY_PATH[path];
  const named = [...goal.toLowerCase().matchAll(/\b(s3|ec2|dynamo(?:db)?|lambda|rds|cloudfront|sqs|iam)\b/g)].map((m) => (m[1].startsWith('dynamo') ? 'dynamodb' : m[1]) as FlowId);
  return new Set(named).size === 1 ? named[0] : undefined;
}

/** A scripted flow, as a function of what's on screen. */
function flowStep(flow: Flow, t: Task, s: PageSnapshot): Step | undefined {
  if (t.did.has(flow.finalKey)) return flow.done(t);
  const onForm = flow.onForm(s);
  for (const r of flow.rules) {
    if (t.did.has(r.key)) continue;
    if ((r.page ?? 'form') === 'list' ? onForm : !onForm) continue;
    const item = r.find(s);
    if (!item) continue;
    t.did.add(r.key);
    const step = r.step(item, t);
    // Acting steps always carry the exact snapshot id (the page acts on nothing else).
    if (step.target && !step.target.id) step.target = target(item);
    return step;
  }
  return undefined;
}

/** What the offline demo says when it can't script a task (the task ends `ok: false`: nothing was done for real). */
export const PRACTICE_ONLY = 'The offline demo can’t click this one; try it in the practice terminal.';

/** Any other page: point at the most relevant visible control and explain it (the server does real planning). */
function genericStep(t: Task, s: PageSnapshot): Step {
  const words = t.goal.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const scored = s.items
    .filter((i: SnapshotItem) => !i.disabled && !t.did.has(i.id))
    .map((i) => ({ i, score: words.reduce((n, w) => n + (i.name.toLowerCase().includes(w) ? w.length : 0), 0) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ? scored[0].i : undefined;
  if (!best || t.index >= 3) {
    return { action: 'done', say: PRACTICE_ONLY, why: 'Connect to the AWS City server and Claude on Bedrock will plan every step for any console page.', risk: 'safe' };
  }
  t.did.add(best.id);
  return { action: 'point', target: { id: best.id, name: best.name }, say: `This is “${best.name}”${best.context ? ` in ${best.context}` : ''}.`, why: 'It’s the closest match to what you asked for. The full Copilot would take it from here.', risk: 'safe' };
}

const NAMES: Record<FlowId, () => string> = {
  s3: () => `city-demo-${suffix()}${suffix()}`,
  ec2: () => `city-web-${suffix()}`,
  dynamodb: () => `city-demo-${suffix()}`,
  lambda: () => 'city-hello',
  rds: () => `city-db-${suffix()}`,
  cloudfront: () => 'city-site',
  sqs: () => `city-orders-${suffix()}`,
  iam: () => `city-lambda-role-${suffix()}`,
};

export class ConsoleMock {
  private tasks = new Map<string, Task>();
  constructor(private emit: (e: ServerEvent) => void) {}

  start(taskId: string, goal: string, snapshot: PageSnapshot, serviceId?: string) {
    const flow = flowFor(serviceId, snapshot.url, goal);
    const agentId = flow ?? serviceId ?? 'concierge';
    const t: Task = { goal, agentId, flow, index: 0, did: new Set(), misses: 0, name: flow ? NAMES[flow]() : '' };
    this.tasks.set(taskId, t);
    const who = placeFor(agentId)?.agentName ?? 'the right agent';
    this.emit({ type: 'agent.message', from: 'concierge', to: 'user', text: `I’ll ask ${who} to do it in your console, step by step.` });
    this.emit({ type: 'task.plan', taskId, agentId, targetServiceId: flow ?? serviceId ?? 's3', steps: ['Working in your AWS console'] });
    this.next(taskId, snapshot);
  }

  observe(taskId: string, ok: boolean, note: string | undefined, snapshot: PageSnapshot) {
    const t = this.tasks.get(taskId);
    if (!t) return;
    this.emit({ type: 'agent.state', agentId: t.agentId, state: 'idle' });
    if (!ok) {
      t.misses++;
      this.emit({ type: 'agent.message', from: t.agentId, to: 'user', text: note === 'player did not act' ? 'No rush — I’ll wait here.' : `Hmm: ${note ?? 'that didn’t work'}.` });
      if (t.misses >= 3) return this.finish(taskId, false, 'I got stuck after a few tries, so I stopped before anything unexpected happened.');
    }
    setTimeout(() => this.next(taskId, snapshot), 350);
  }

  stop(taskId: string) {
    const t = this.tasks.get(taskId);
    if (t) this.finish(taskId, false, 'Stopped.');
  }

  private next(taskId: string, s: PageSnapshot) {
    const t = this.tasks.get(taskId);
    if (!t) return;
    if (t.index >= MAX_STEPS) return this.finish(taskId, false, 'Step budget reached — stopping.');
    const step = (t.flow ? flowStep(FLOWS[t.flow], t, s) : undefined) ?? genericStep(t, s);
    const index = t.index++;
    this.emit({ type: 'agent.state', agentId: t.agentId, state: 'working', service: 'console', detail: `${step.action} ${step.target?.name ?? ''}`.trim() });
    this.emit({ type: 'console.step', taskId, index, agentId: t.agentId, ...step });
    // Done for real only when the scripted flow reached its final click; the practice-only path never is.
    if (step.action === 'done') this.finish(taskId, !!t.flow && t.did.has(FLOWS[t.flow].finalKey), step.say);
  }

  private finish(taskId: string, ok: boolean, text: string) {
    const t = this.tasks.get(taskId);
    if (!t) return;
    this.tasks.delete(taskId);
    this.emit({ type: 'agent.state', agentId: t.agentId, state: 'idle' });
    this.emit({ type: 'task.done', taskId, ok, result: text, xp: ok && t.flow ? [{ serviceId: t.flow, amount: 20 }] : [] });
  }
}
