// The practice console's pages (src/entrypoints/practice/): a local stand-in for the AWS console with Cloudscape-like
// markup (hashed `awsui_` class names, form fields labelled by id, radio tiles, a custom select that opens on mousedown
// and picks on mouseup, a form footer in an open shadow root), enough of S3, EC2, DynamoDB, Lambda, RDS, CloudFront,
// SQS and IAM for each service's scripted Copilot flow (src/backend/consoleMock.ts) to run end to end. Nothing here
// touches AWS: "creating" adds a row to this page's memory. Controls marked data-risky record a click on
// <body data-risky> (the smoke run proves the agent never pressed one), and a finished create sets <body data-created>.
// Text the player or the agent typed only ever lands through textContent.
import { PRACTICE_SERVICES, practiceRoute, type PracticeService } from './practice';

export const PRACTICE_NOTE = 'Practice console: nothing here touches AWS. It runs inside AWS City, on this computer, and forgets everything when you close it.';

interface Created {
  name: string;
  detail: string;
}

interface Form {
  /** The create button's own label (its click, or the footer's, submits). */
  submit: string;
  /** Validates and returns what was "created", or an error to show. */
  read: (root: ParentNode, kept: Record<string, string>) => Created | { error: string };
}

interface Page {
  id: PracticeService;
  service: string;
  /** The list page's heading noun, e.g. "Buckets". */
  list: string;
  /** "Create bucket": the list page's button and the form's heading. */
  create: string;
  empty: string;
  /** Risky controls on the list page (recorded if pressed). */
  danger: string[];
  /** The form's markup (static), rendered under the h1. */
  form: () => string;
  /** After the markup is in: custom selects and shadow-root footers. */
  wire?: (root: HTMLElement) => void;
  submit: Form;
  /** The success flash. */
  flash: (c: Created) => string;
  /** Multi-page wizards (IAM): the form's pages, each with a heading. */
  wizard?: { heading: string; body: () => string; wire?: (root: HTMLElement) => void; keep?: (root: HTMLElement) => Record<string, string> }[];
}

// ── markup helpers (static text only) ───────────────────────────────────────

/** This file's own static markup (never typed text) into an element: parsed inert, then adopted. */
function setMarkup(el: Element, markup: string) {
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${markup}</body>`, 'text/html');
  el.replaceChildren(...[...parsed.body.childNodes].map((n) => el.ownerDocument.importNode(n, true)));
}

const box = (title: string, inner: string, extra = '') => `<div class="awsui_container_x1"${extra}><h2>${title}</h2>${inner}</div>`;
const field = (id: string, label: string, opts: { placeholder?: string; value?: string; hint?: string; textarea?: boolean } = {}) =>
  `<div class="awsui_form-field_x2"><label id="${id}-label" for="${id}">${label}</label>` +
  (opts.textarea
    ? `<textarea class="awsui_input_x3" id="${id}" aria-labelledby="${id}-label" rows="2">${opts.value ?? ''}</textarea>`
    : `<input class="awsui_input_x3" id="${id}" aria-labelledby="${id}-label"${opts.placeholder ? ` placeholder="${opts.placeholder}"` : ''}${opts.value ? ` value="${opts.value}"` : ''} />`) +
  (opts.hint ? `<span class="awsui_constraint_xg">${opts.hint}</span>` : '') +
  `</div>`;
const tiles = (group: string, name: string, opts: { label: string; desc?: string; checked?: boolean; risky?: boolean }[], wide = false) =>
  `<div class="awsui_tiles_xa" role="radiogroup" aria-label="${group}">` +
  opts
    .map(
      (o) =>
        `<label class="awsui_tile-container_xb${wide ? ' wide' : ''}"${o.risky ? ' data-risky' : ''}><input class="awsui_radio-native_xc" type="radio" name="${name}"${o.checked ? ' checked' : ''} /> ${o.label}` +
        (o.desc ? ` <span class="awsui_description_x9">${o.desc}</span>` : '') +
        `</label>`,
    )
    .join('') +
  `</div>`;
const check = (label: string, checked: boolean, desc = '', risky = false) =>
  `<label class="awsui_checkbox_xh"${risky ? ' data-risky' : ''}><input type="checkbox"${checked ? ' checked' : ''} /> ${label}${desc ? ` <span class="awsui_description_x9">${desc}</span>` : ''}</label>`;
const kv = (pairs: [string, string][]) => `<dl class="awsui_kv_xi">${pairs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
const valueOf = (root: ParentNode, id: string) => ((root.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? '').trim();
const checkedLabel = (root: ParentNode, name: string) => {
  const r = [...root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].find((i) => i.checked);
  return r?.nextSibling?.textContent?.trim() ?? '';
};

/**
 * A Cloudscape-like select: the trigger opens its list on mousedown after a frame (the Copilot has to wait for it),
 * an option picks on mouseup (as in Cloudscape's select/utils/use-select.ts). Risky options record a pick.
 */
export function customSelect(
  host: HTMLElement,
  { id, label, options, value, delay = selectDelay }: { id: string; label: string; options: { label: string; description?: string; risky?: boolean }[]; value: string; delay?: number },
) {
  const doc = host.ownerDocument;
  setMarkup(host, `
    <div class="awsui_form-field_x2">
      <label id="${id}-label" for="${id}-trigger">${label}</label>
      <div class="awsui_select_x5">
        <button type="button" class="awsui_button-trigger_x6" id="${id}-trigger" aria-haspopup="listbox" aria-expanded="false"
          aria-labelledby="${id}-label ${id}-value"><span id="${id}-value"></span> <span aria-hidden="true">▾</span></button>
      </div>
    </div>`);
  const trigger = host.querySelector('button')!;
  const wrap = host.querySelector('.awsui_select_x5')!;
  const shown = host.querySelector(`#${id}-value`)!;
  shown.textContent = value;
  host.dataset.value = value;
  let list: HTMLElement | undefined;
  const close = () => {
    list?.remove();
    list = undefined;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-controls');
  };
  trigger.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (list) return close();
    setTimeout(() => {
      if (list || !trigger.isConnected) return;
      const box = doc.createElement('div');
      box.className = 'awsui_dropdown_x7';
      const ul = doc.createElement('ul');
      ul.setAttribute('role', 'listbox');
      ul.id = `${id}-list`;
      ul.setAttribute('aria-labelledby', `${id}-label`);
      options.forEach((o, i) => {
        const li = doc.createElement('li');
        li.setAttribute('role', 'option');
        li.className = 'awsui_selectable-item_x8';
        li.setAttribute('aria-selected', String(o.label === value));
        li.dataset.i = String(i);
        if (o.risky) li.setAttribute('data-risky', '');
        const l = doc.createElement('span');
        l.className = 'awsui_label_xe';
        l.textContent = o.label;
        li.append(l);
        if (o.description) {
          const d = doc.createElement('span');
          d.className = 'awsui_description_x9';
          d.textContent = o.description;
          li.append(d);
        }
        ul.append(li);
      });
      ul.addEventListener('mouseup', (ev) => {
        const li = (ev.target as Element).closest('[role=option]') as HTMLElement | null;
        if (!li) return;
        const o = options[Number(li.dataset.i)];
        if (o.risky) noteRisky(doc, o.label);
        value = o.label;
        shown.textContent = value;
        host.dataset.value = value;
        close();
      });
      box.append(ul);
      wrap.append(box);
      list = box;
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-controls', ul.id);
    }, delay);
  });
}

/** How long a custom select takes to open (mountPractice sets it; tests use 0). */
let selectDelay = 120;

const noteRisky = (doc: Document, what: string) => {
  doc.body.dataset.risky = `${doc.body.dataset.risky ?? ''}${what};`;
};

// ── the services ────────────────────────────────────────────────────────────

const PAGES: Record<PracticeService, Page> = {
  s3: {
    id: 's3',
    service: 'Amazon S3',
    list: 'General purpose buckets',
    create: 'Create bucket',
    empty: 'Buckets are containers for data stored in S3. You have none yet.',
    danger: ['Empty', 'Delete'],
    form: () =>
      box('General configuration', field('bn', 'Bucket name', { placeholder: 'myawsbucket', hint: '3 to 63 lowercase letters, numbers, dots or hyphens. Unique across all of AWS.' }) + kv([['AWS Region', 'US West (Oregon) us-west-2']])) +
      box('Object Ownership', tiles('Object Ownership', 'own', [{ label: 'ACLs disabled (recommended)', desc: 'All objects in this bucket are owned by this account.', checked: true }, { label: 'ACLs enabled', desc: 'Objects can be owned by other AWS accounts.' }], true)) +
      box('Block Public Access settings for this bucket', check('Block all public access', true, 'Turning this on is the same as turning on all four settings below.')) +
      box('Default encryption', tiles('Encryption type', 'enc', [{ label: 'Server-side encryption with Amazon S3 managed keys (SSE-S3)', checked: true }, { label: 'Server-side encryption with AWS Key Management Service keys (SSE-KMS)' }], true)),
    submit: {
      submit: 'Create bucket',
      read: (r) => {
        const name = valueOf(r, 'bn');
        if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)) return { error: 'Bucket name must be 3 to 63 lowercase letters, numbers, dots or hyphens.' };
        return { name, detail: 'SSE-S3 · Block all public access on' };
      },
    },
    flash: (c) => `Successfully created bucket "${c.name}"`,
  },
  ec2: {
    id: 'ec2',
    service: 'Amazon EC2',
    list: 'Instances',
    create: 'Launch instances',
    empty: 'You don’t have any instances in this Region.',
    danger: ['Terminate (delete) instance'],
    form: () =>
      box('Name and tags', field('nm', 'Name', { placeholder: 'e.g. My Web Server' })) +
      box(
        'Application and OS Images (Amazon Machine Image)',
        tiles('Quick Start', 'os', [
          { label: 'Amazon Linux', desc: 'Amazon Linux 2023 AMI · Free tier eligible', checked: true },
          { label: 'Ubuntu', desc: 'Ubuntu Server 24.04 LTS' },
          { label: 'Windows', desc: 'Microsoft Windows Server 2025' },
        ]),
      ) +
      box('Instance type', '<div id="type-field"></div>') +
      box('Key pair (login)', '<div id="kp-field"></div><button class="awsui_button_x4 secondary" type="button">Create new key pair</button>') +
      box('Network settings', tiles('Firewall (security groups)', 'sg', [{ label: 'Create security group', checked: true }, { label: 'Select existing security group' }])) +
      box('Summary', '<p>Number of instances: 1</p><button class="awsui_button_x4 secondary" type="button" data-risky>Purchase a Savings Plan</button>'),
    wire: (root) => {
      customSelect(root.querySelector('#type-field')!, {
        id: 'it',
        label: 'Instance type',
        value: 't2.micro',
        options: [
          { label: 't2.micro', description: 'Family: t2 · 1 vCPU · 1 GiB Memory · Free tier eligible' },
          { label: 't3.micro', description: 'Family: t3 · 2 vCPU · 1 GiB Memory · Free tier eligible' },
          { label: 't4g.micro', description: 'Family: t4g · 2 vCPU · 1 GiB Memory · Arm (Graviton) · Free tier eligible' },
          { label: 'm5.large', description: 'Family: m5 · 2 vCPU · 8 GiB Memory' },
          { label: 'p5.48xlarge', description: 'Reserved Instance purchase required', risky: true },
        ],
      });
      customSelect(root.querySelector('#kp-field')!, {
        id: 'kp',
        label: 'Key pair name',
        value: 'Select',
        options: [{ label: 'Proceed without a key pair (Not recommended)', description: 'Use EC2 Instance Connect or Session Manager' }],
      });
    },
    submit: {
      submit: 'Launch instance',
      read: (r) => ({ name: valueOf(r, 'nm') || 'unnamed', detail: (r.querySelector('#type-field') as HTMLElement).dataset.value ?? '' }),
    },
    flash: (c) => `Success: launching instance "${c.name}" (${c.detail})`,
  },
  dynamodb: {
    id: 'dynamodb',
    service: 'Amazon DynamoDB',
    list: 'Tables',
    create: 'Create table',
    empty: 'You have no tables in this account in this AWS Region.',
    danger: ['Delete'],
    form: () =>
      box('Table details', field('tn', 'Table name', { hint: 'Between 3 and 255 characters: letters, numbers, underscores, hyphens and dots.' }) + `<div class="row">${field('pk', 'Partition key', { placeholder: 'Enter the partition key name' })}<div id="pk-type"></div></div>` + field('sk', 'Sort key - optional', { placeholder: 'Enter the sort key name' })) +
      box(
        'Table settings',
        tiles('Table settings', 'ts', [
          { label: 'Default settings', desc: 'The fastest way to create your table. On-demand capacity; you can modify most settings later.', checked: true },
          { label: 'Customize settings', desc: 'Use advanced features to fit your needs.' },
        ], true) + kv([['Capacity mode', 'On-demand'], ['Encryption', 'Owned by Amazon DynamoDB'], ['Deletion protection', 'Off']]),
      ),
    wire: (root) => customSelect(root.querySelector('#pk-type')!, { id: 'pkt', label: 'Partition key type', value: 'String', options: [{ label: 'String' }, { label: 'Number' }, { label: 'Binary' }] }),
    submit: {
      submit: 'Create table',
      read: (r) => {
        const name = valueOf(r, 'tn');
        const pk = valueOf(r, 'pk');
        if (!name || !pk) return { error: 'Table name and partition key are required.' };
        return { name, detail: `pk ${pk}` };
      },
    },
    flash: (c) => `The ${c.name} table was created successfully.`,
  },
  lambda: {
    id: 'lambda',
    service: 'AWS Lambda',
    list: 'Functions',
    create: 'Create function',
    empty: 'There is no data to display.',
    danger: ['Delete'],
    form: () =>
      box(
        'Choose one of the following options to create your function.',
        tiles('Create function options', 'how', [
          { label: 'Author from scratch', desc: 'Start with a simple Hello World example.' },
          { label: 'Use a blueprint', desc: 'Build a Lambda application from sample code.', checked: true },
          { label: 'Container image', desc: 'Select a container image to deploy.' },
        ], true),
      ) +
      box('Basic information', field('fn', 'Function name', { placeholder: 'myFunctionName' }) + '<div id="rt-field"></div>' + tiles('Architecture', 'arch', [{ label: 'x86_64', checked: true }, { label: 'arm64' }])) +
      // The footer lives in an open shadow root, like parts of the real console: the Copilot has to find it there.
      '<practice-form-footer></practice-form-footer>',
    wire: (root) =>
      customSelect(root.querySelector('#rt-field')!, {
        id: 'rt',
        label: 'Runtime',
        value: 'Python 3.13',
        options: [{ label: 'Node.js 24.x', description: 'Latest supported' }, { label: 'Node.js 22.x' }, { label: 'Python 3.13' }, { label: 'Python 3.12' }, { label: 'Java 21' }, { label: 'Ruby 3.3' }],
      }),
    submit: {
      submit: 'Create function',
      read: (r) => {
        const name = valueOf(r, 'fn');
        if (!name) return { error: 'Function name is required.' };
        const how = [...r.querySelectorAll<HTMLInputElement>('input[name=how]')].findIndex((i) => i.checked);
        const runtime = (r.querySelector('#rt-field') as HTMLElement).dataset.value;
        return { name, detail: `${runtime}, ${how === 0 ? 'from scratch' : 'NOT from scratch'}` };
      },
    },
    flash: (c) => `Successfully created the function ${c.name}. You can now change its code and configuration.`,
  },
  rds: {
    id: 'rds',
    service: 'Amazon RDS',
    list: 'Databases',
    create: 'Create database',
    empty: 'You don’t have any databases in this Region.',
    danger: ['Delete', 'Stop temporarily'],
    form: () =>
      box('Choose a database creation method', tiles('Database creation method', 'method', [
        { label: 'Standard create', desc: 'You set all of the configuration options, including ones for availability, security, backups and maintenance.', checked: true },
        { label: 'Easy create', desc: 'Use recommended best-practice configurations. Some options can be changed after the database is created.' },
      ], true)) +
      box('Configuration', tiles('Engine type', 'engine', [
        { label: 'Aurora (PostgreSQL Compatible)' },
        { label: 'MySQL', checked: true },
        { label: 'PostgreSQL' },
        { label: 'MariaDB' },
      ])) +
      box('DB instance size', tiles('DB instance size', 'size', [
        { label: 'Production', desc: 'db.r6g.xlarge · 4 vCPUs · 32 GiB RAM' },
        { label: 'Dev/Test', desc: 'db.r6g.large · 2 vCPUs · 16 GiB RAM' },
        { label: 'Free tier', desc: 'db.t4g.micro · 2 vCPUs · 1 GiB RAM. Use RDS Free Tier to develop and test applications.' },
      ])) +
      box('Settings', field('dbid', 'DB instance identifier', { placeholder: 'database-1', hint: '1 to 63 letters, numbers or hyphens. Unique in this Region.' }) + field('mu', 'Master username', { value: 'postgres' }) +
        check('Manage master credentials in AWS Secrets Manager', true, 'RDS creates the database’s sign-in in Secrets Manager and rotates it: nobody has to type or store it.')),
    submit: {
      submit: 'Create database',
      read: (r) => {
        const name = valueOf(r, 'dbid');
        if (!/^[a-zA-Z][a-zA-Z0-9-]{0,62}$/.test(name)) return { error: 'The DB instance identifier must start with a letter and use only letters, numbers and hyphens.' };
        return { name, detail: `${checkedLabel(r, 'engine')}, ${checkedLabel(r, 'size')}` };
      },
    },
    flash: (c) => `Creating database ${c.name}. It can take a few minutes to become available.`,
  },
  cloudfront: {
    id: 'cloudfront',
    service: 'Amazon CloudFront',
    list: 'Distributions',
    create: 'Create distribution',
    empty: 'No distributions yet. A distribution serves your content from edge locations near your viewers.',
    danger: ['Disable', 'Delete'],
    form: () =>
      box('Origin', '<div id="origin-field"></div>' + tiles('Origin access', 'oa', [
        { label: 'Public', desc: 'Bucket must allow public access.', checked: true },
        { label: 'Origin access control settings (recommended)', desc: 'Bucket can restrict access to only CloudFront.' },
        { label: 'Legacy access identities', desc: 'Use a CloudFront origin access identity (OAI).' },
      ], true)) +
      box('Default cache behavior', tiles('Viewer protocol policy', 'vpp', [{ label: 'HTTP and HTTPS', checked: true }, { label: 'Redirect HTTP to HTTPS' }, { label: 'HTTPS only' }])) +
      box('Settings', tiles('Price class', 'pc', [
        { label: 'Use all edge locations (best performance)', checked: true },
        { label: 'Use only North America and Europe' },
        { label: 'Use North America, Europe, Asia, Middle East, and Africa' },
      ], true)),
    wire: (root) =>
      customSelect(root.querySelector('#origin-field')!, {
        id: 'od',
        label: 'Origin domain',
        value: 'Choose origin domain',
        options: [
          { label: 'city-site.s3.us-west-2.amazonaws.com', description: 'Amazon S3 · city-site' },
          { label: 'city-demo-alb-1234.us-west-2.elb.amazonaws.com', description: 'Elastic Load Balancer' },
        ],
      }),
    submit: {
      submit: 'Create distribution',
      read: (r) => {
        const origin = (r.querySelector('#origin-field') as HTMLElement).dataset.value ?? '';
        if (!origin.includes('.')) return { error: 'Choose an origin domain first.' };
        const oac = /origin access control/i.test(checkedLabel(r, 'oa'));
        return { name: origin, detail: `${oac ? 'OAC' : 'public bucket'}, ${checkedLabel(r, 'vpp').toLowerCase()}` };
      },
    },
    flash: (c) => `Successfully created a distribution for ${c.name}. It’s deploying to the edge (a few minutes).`,
  },
  sqs: {
    id: 'sqs',
    service: 'Amazon SQS',
    list: 'Queues',
    create: 'Create queue',
    empty: 'No queues. A queue holds messages until a consumer is ready for them.',
    danger: ['Purge', 'Delete'],
    form: () =>
      box('Details', tiles('Type', 'qt', [
        { label: 'Standard', desc: 'At-least-once delivery, message ordering isn’t preserved. Nearly unlimited throughput.', checked: true },
        { label: 'FIFO', desc: 'First-in-first-out delivery, message ordering is preserved. Exactly-once processing.' },
      ], true) + field('qn', 'Name', { placeholder: 'Enter a name', hint: 'Up to 80 letters, numbers, hyphens and underscores.' })) +
      box('Configuration', field('vt', 'Visibility timeout', { value: '30', hint: 'Seconds a message stays hidden after a consumer receives it: 0 seconds to 12 hours.' }) + field('rp', 'Message retention period', { value: '4', hint: 'Days: 1 minute to 14 days.' })) +
      box('Encryption', tiles('Encryption key type', 'qenc', [{ label: 'Amazon SQS key (SSE-SQS)', checked: true }, { label: 'AWS Key Management Service key (SSE-KMS)' }], true)),
    submit: {
      submit: 'Create queue',
      read: (r) => {
        const name = valueOf(r, 'qn');
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(name)) return { error: 'Queue names use up to 80 letters, numbers, hyphens and underscores.' };
        return { name, detail: checkedLabel(r, 'qt') };
      },
    },
    flash: (c) => `Queue ${c.name} created successfully. You can now send and receive messages.`,
  },
  iam: {
    id: 'iam',
    service: 'AWS IAM',
    list: 'Roles',
    create: 'Create role',
    empty: 'An IAM role is an identity with permissions that a service or person can take on for a while.',
    danger: ['Delete'],
    form: () => '',
    wizard: [
      {
        heading: 'Select trusted entity',
        body: () =>
          box('Trusted entity type', tiles('Trusted entity type', 'te', [
            { label: 'AWS service', desc: 'Allow AWS services like EC2, Lambda, or others to perform actions in this account.', checked: true },
            { label: 'AWS account', desc: 'Allow entities in other AWS accounts belonging to you or a 3rd party to perform actions in this account.' },
            { label: 'Web identity', desc: 'Allows users federated by a web identity provider to assume this role.' },
          ], true)) + box('Use case', '<div id="uc-field"></div>'),
        wire: (root) =>
          customSelect(root.querySelector('#uc-field')!, {
            id: 'uc',
            label: 'Service or use case',
            value: 'Choose a service or use case',
            options: [{ label: 'EC2' }, { label: 'Lambda' }, { label: 'ECS' }, { label: 'Glue' }],
          }),
        keep: (root) => ({ useCase: (root.querySelector('#uc-field') as HTMLElement).dataset.value ?? '' }),
      },
      {
        heading: 'Add permissions',
        body: () =>
          box(
            'Permissions policies (4)',
            `<div class="policy-list">` +
              check('AdministratorAccess', false, 'Provides full access to AWS services and resources.', true) +
              check('AmazonS3FullAccess', false, 'Provides full access to all buckets.', true) +
              check('AWSLambdaBasicExecutionRole', false, 'Provides write permissions to CloudWatch Logs.') +
              check('CloudWatchLogsReadOnlyAccess', false, 'Provides read only access to CloudWatch Logs.') +
              `</div>`,
          ),
        keep: (root) => ({
          policies: [...root.querySelectorAll<HTMLInputElement>('.policy-list input:checked')].map((i) => i.nextSibling?.textContent?.trim() ?? '').join(', '),
        }),
      },
      {
        heading: 'Name, review, and create',
        body: () =>
          box('Role details', field('rn', 'Role name', { placeholder: 'Enter a meaningful name', hint: 'Up to 64 letters, numbers and +=,.@-_ characters.' }) + field('rd', 'Description', { value: 'Allows Lambda functions to call AWS services on your behalf.', textarea: true })) +
          box('Step 1: Select trusted entities', '<pre class="awsui_code_xj">{\n  "Version": "2012-10-17",\n  "Statement": [{\n    "Effect": "Allow",\n    "Principal": { "Service": "lambda.amazonaws.com" },\n    "Action": "sts:AssumeRole"\n  }]\n}</pre>'),
      },
    ],
    submit: {
      submit: 'Create role',
      read: (r, kept) => {
        const name = valueOf(r, 'rn');
        if (!/^[\w+=,.@-]{1,64}$/.test(name)) return { error: 'Role names use up to 64 letters, numbers and +=,.@-_ characters.' };
        return { name, detail: [kept.useCase, kept.policies || 'no policies'].filter(Boolean).join(', ') };
      },
    },
    flash: (c) => `Role ${c.name} created.`,
  },
};

export const practicePage = (id: PracticeService) => PAGES[id];

// ── the shell and routing ───────────────────────────────────────────────────

const SHELL = `
<header class="topnav">
  <span class="brand" aria-hidden="true">▣</span><span class="brand-name">Practice console</span>
  <span class="search" aria-hidden="true">Search for services, features and docs</span>
  <span class="spacer"></span>
  <span class="chip-region">Oregon (practice)</span>
</header>
<div class="practice-note" role="note"><b>🧪 Practice console:</b> <span></span></div>
<div class="layout">
  <nav class="sidenav" aria-label="Services"><h2 class="nav-title">Services</h2><ul></ul></nav>
  <main id="app" class="content"></main>
</div>`;

export interface MountOptions {
  /** The "loading" spinner after a create, like the real console (tests pass 0). */
  delay?: number;
  /** The custom selects' open delay (tests pass 0). */
  selectDelay?: number;
}

/** Renders the practice console into `doc.body` and keeps it in step with the URL hash. Returns a re-render. */
export function mountPractice(doc: Document, opts: MountOptions = {}) {
  const delay = opts.delay ?? 800;
  selectDelay = opts.selectDelay ?? 120;
  const win = doc.defaultView!;
  doc.body.classList.add('practice');
  setMarkup(doc.body, SHELL);
  doc.querySelector('.practice-note span')!.textContent = PRACTICE_NOTE.replace(/^Practice console: /, '');
  const nav = doc.querySelector('.sidenav ul')!;
  for (const id of PRACTICE_SERVICES) {
    const li = doc.createElement('li');
    const a = doc.createElement('a');
    a.href = `#/${id}`;
    a.textContent = PAGES[id].service;
    a.dataset.service = id;
    li.append(a);
    nav.append(li);
  }
  const app = doc.getElementById('app')!;
  const created = new Map<PracticeService, Created[]>();
  let flash: string | undefined;

  // Any click on a risky control is recorded (the smoke run proves the agent never pressed one).
  doc.addEventListener(
    'click',
    (e) => {
      const r = (e.target as Element | null)?.closest?.('[data-risky]');
      if (r) noteRisky(doc, (r.textContent ?? '').trim().split('\n')[0].trim());
    },
    true,
  );

  const go = (hash: string) => {
    if (win.location.hash !== hash) win.history.pushState(null, '', hash);
    render();
  };

  const button = (label: string, cls = '', risky = false) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = `awsui_button_x4${cls ? ` ${cls}` : ''}`;
    if (risky) b.setAttribute('data-risky', '');
    b.textContent = label;
    return b;
  };

  const crumbs = (parts: string[]) => {
    const p = doc.createElement('p');
    p.className = 'crumbs';
    p.textContent = parts.join(' › ');
    return p;
  };

  function renderHome() {
    doc.title = 'Console Home | Practice console';
    setMarkup(app, `<h1>Console Home</h1><p class="lead">Pick a service to practise in. AWS City’s Copilot can show you around any of these pages, step by step.</p><div class="cards"></div>`);
    const cards = app.querySelector('.cards')!;
    for (const id of PRACTICE_SERVICES) {
      const a = doc.createElement('a');
      a.className = 'card';
      a.href = `#/${id}`;
      const b = doc.createElement('b');
      b.textContent = PAGES[id].service;
      const s = doc.createElement('span');
      s.textContent = PAGES[id].create;
      a.append(b, s);
      cards.append(a);
    }
  }

  function renderList(p: Page) {
    doc.title = `${p.list} | ${p.service} | Practice console`;
    const rows = created.get(p.id) ?? [];
    app.replaceChildren(crumbs([p.service, p.list]));
    if (flash) {
      const f = doc.createElement('div');
      f.className = 'awsui_flash_xd';
      f.setAttribute('role', 'status');
      f.textContent = flash;
      app.append(f);
      flash = undefined;
    }
    const c = doc.createElement('div');
    c.className = 'awsui_container_x1';
    const h = doc.createElement('h1');
    h.textContent = `${p.list} (${rows.length})`;
    const bar = doc.createElement('div');
    bar.className = 'actions';
    for (const d of p.danger) bar.append(button(d, 'secondary', true));
    const start = button(p.create);
    start.addEventListener('click', () => go(`#/${p.id}/create`));
    bar.append(start);
    c.append(h, bar);
    if (rows.length) {
      const t = doc.createElement('table');
      t.className = 'awsui_table_xk';
      const head = t.createTHead().insertRow();
      for (const th of ['Name', 'Details', 'Status']) head.append(Object.assign(doc.createElement('th'), { textContent: th }));
      t.createTBody();
      for (const r of rows) {
        const tr = doc.createElement('tr');
        for (const v of [r.name, r.detail, '✅ Practice only']) {
          const td = doc.createElement('td');
          td.textContent = v;
          tr.append(td);
        }
        t.tBodies[0].append(tr);
      }
      c.append(t);
    } else {
      const e = doc.createElement('p');
      e.className = 'empty';
      e.textContent = p.empty;
      c.append(e);
    }
    app.append(c);
  }

  function footer(p: Page, onSubmit: () => void, extra: HTMLElement[] = []) {
    const f = doc.createElement('div');
    f.className = 'form-footer';
    const cancel = button('Cancel', 'secondary');
    cancel.addEventListener('click', () => go(`#/${p.id}`));
    const submit = button(p.submit.submit);
    submit.id = 'submit';
    submit.addEventListener('click', onSubmit);
    f.append(cancel, ...extra, submit);
    return f;
  }

  /** What a wizard's earlier pages chose (their markup is gone by the last page). */
  let kept: Record<string, string> = {};

  function submitForm(p: Page) {
    const res = p.submit.read(app, kept);
    const err = app.querySelector('.form-error');
    if ('error' in res) {
      const e = err ?? doc.createElement('p');
      e.className = 'form-error';
      e.setAttribute('role', 'alert');
      e.textContent = res.error;
      if (!err) app.append(e);
      return;
    }
    err?.remove();
    setMarkup(app, '<div class="awsui_container_x1"><span class="awsui_spinner_xf" aria-hidden="true">⏳</span> Working on it…</div>');
    win.setTimeout(() => {
      created.set(p.id, [...(created.get(p.id) ?? []), res]);
      doc.body.dataset.created = res.detail ? `${res.name} (${res.detail})` : res.name;
      flash = p.flash(res);
      go(`#/${p.id}`);
    }, delay);
  }

  function renderForm(p: Page) {
    doc.title = `${p.create} | ${p.service} | Practice console`;
    kept = {};
    if (p.wizard) return renderWizard(p, 0);
    app.replaceChildren(crumbs([p.service, p.list, p.create]));
    const h = doc.createElement('h1');
    h.textContent = p.id === 'ec2' ? 'Launch an instance' : p.create;
    const body = doc.createElement('div');
    setMarkup(body, p.form());
    app.append(h, body);
    p.wire?.(body);
    const host = body.querySelector('practice-form-footer');
    const f = footer(p, () => submitForm(p));
    if (host) {
      // An open shadow root, as some console widgets use: the Copilot finds and presses the button inside it.
      const root = host.attachShadow({ mode: 'open' });
      const style = doc.createElement('style');
      style.textContent = SHADOW_CSS;
      root.append(style, f);
    } else app.append(f);
  }

  function renderWizard(p: Page, step: number) {
    const w = p.wizard![step];
    app.replaceChildren(crumbs([p.service, p.list, p.create]));
    const steps = doc.createElement('ol');
    steps.className = 'wizard-steps';
    p.wizard!.forEach((s, i) => {
      const li = doc.createElement('li');
      li.textContent = `Step ${i + 1}: ${s.heading}`;
      if (i === step) li.className = 'current';
      steps.append(li);
    });
    const h = doc.createElement('h1');
    h.textContent = w.heading;
    const body = doc.createElement('div');
    setMarkup(body, w.body());
    app.append(steps, h, body);
    w.wire?.(body);
    const last = step === p.wizard!.length - 1;
    const f = doc.createElement('div');
    f.className = 'form-footer';
    const cancel = button('Cancel', 'secondary');
    cancel.addEventListener('click', () => go(`#/${p.id}`));
    f.append(cancel);
    if (step > 0) {
      const prev = button('Previous', 'secondary');
      prev.addEventListener('click', () => renderWizard(p, step - 1));
      f.append(prev);
    }
    const next = button(last ? p.submit.submit : 'Next');
    next.addEventListener('click', () => {
      if (last) return submitForm(p);
      if (step === 0 && !/lambda|ec2|ecs|glue/i.test((body.querySelector('#uc-field') as HTMLElement)?.dataset.value ?? '')) {
        const e = doc.createElement('p');
        e.className = 'form-error';
        e.setAttribute('role', 'alert');
        e.textContent = 'Choose a service or use case first.';
        if (!app.querySelector('.form-error')) app.append(e);
        return;
      }
      kept = { ...kept, ...w.keep?.(body) };
      renderWizard(p, step + 1);
    });
    f.append(next);
    app.append(f);
  }

  function render() {
    const r = practiceRoute(win.location.href);
    for (const a of doc.querySelectorAll<HTMLAnchorElement>('.sidenav a')) {
      if (a.dataset.service === r.service) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    if (!r.service) return renderHome();
    const p = PAGES[r.service];
    if (r.page === 'create') renderForm(p);
    else renderList(p);
    doc.documentElement.scrollTop = 0;
  }

  win.addEventListener('hashchange', render);
  render();
  return render;
}

const SHADOW_CSS = `
.form-footer{display:flex;gap:8px;justify-content:flex-end;max-width:820px;margin-top:8px}
.awsui_button_x4{font:700 14px/1.2 "Open Sans","Helvetica Neue",Roboto,Arial,sans-serif;background:#ff9900;color:#0f141a;border:2px solid #ff9900;border-radius:20px;padding:6px 18px;cursor:pointer}
.awsui_button_x4.secondary{background:#fff;color:#0972d3;border-color:#0972d3}
`;
