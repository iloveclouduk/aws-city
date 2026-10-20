import workshopData from '../../../shared/workshops.json' with { type: 'json' };
import type { ResourceKind, WorldSnapshot } from '../state/model.js';

/**
 * Workshop steps checked in the player's account (contract v2.10 workshop.verify). A fixed registry: each check reads
 * the poller's snapshot (the same read-only calls the player role already grants: DescribeInstances, ListTables,
 * ListFunctions, ListAllMyBuckets, apigateway:GET), so a workshop adds no IAM and no writes, and nothing here runs a
 * command. The step names its check and which of its placeholders holds the resource name (shared/workshops.json).
 */
export interface CheckDef {
  kind: ResourceKind;
  /** true: the resource must be there (and in `state`, when given); false: it must be gone (a cleanup step). */
  present: boolean;
  state?: string[];
  /** What a name may look like before it's compared (AWS's own naming rules, a little stricter). */
  name: RegExp;
  what: string;
}

const TABLE = /^[A-Za-z0-9_.-]{3,255}$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const FUNCTION = /^[A-Za-z0-9_-]{1,64}$/;
const TAG_NAME = /^[A-Za-z0-9 _.:/=+@-]{1,128}$/;

export const CHECKS: Record<string, CheckDef> = {
  'table-exists': { kind: 'table', present: true, name: TABLE, what: 'DynamoDB table' },
  'table-active': { kind: 'table', present: true, state: ['ACTIVE'], name: TABLE, what: 'DynamoDB table' },
  'table-gone': { kind: 'table', present: false, name: TABLE, what: 'DynamoDB table' },
  'bucket-exists': { kind: 'bucket', present: true, name: BUCKET, what: 'S3 bucket' },
  'bucket-gone': { kind: 'bucket', present: false, name: BUCKET, what: 'S3 bucket' },
  'function-exists': { kind: 'function', present: true, name: FUNCTION, what: 'Lambda function' },
  'function-gone': { kind: 'function', present: false, name: FUNCTION, what: 'Lambda function' },
  'instance-running': { kind: 'instance', present: true, state: ['running'], name: TAG_NAME, what: 'EC2 instance' },
  'instance-stopped': { kind: 'instance', present: true, state: ['stopped'], name: TAG_NAME, what: 'EC2 instance' },
  'instance-gone': { kind: 'instance', present: false, name: TAG_NAME, what: 'EC2 instance' },
};

interface StepRef {
  id: string;
  verify?: { check?: string; value?: string; manual?: boolean };
}
const WORKSHOPS = (workshopData as { workshops: { id: string; steps: StepRef[] }[] }).workshops;

export interface VerifyResult {
  ok: boolean;
  detail: string;
}

/** A terminated instance still lists for a while: it doesn't count as being there. */
const alive = (state: string) => state !== 'terminated' && state !== 'shutting-down' && state !== 'DELETING';

/**
 * Checks one step. `snapshot` is a fresh poll, or undefined when no account is linked. Unknown workshops, steps and
 * checks, and names that don't look like names, are refused before anything is compared.
 */
export function verifyStep(snapshot: WorldSnapshot | undefined, workshopId: string, stepId: string, values: Record<string, string> = {}): VerifyResult {
  const step = WORKSHOPS.find((w) => w.id === workshopId)?.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, detail: "That workshop step doesn't exist." };
  const check = step.verify?.check ? CHECKS[step.verify.check] : undefined;
  if (!check || !step.verify?.value) return { ok: false, detail: "This step is checked by you, not the city: tick it when it's done." };
  if (!snapshot) return { ok: false, detail: 'Connect your AWS account first, so the city can check this step.' };
  const name = values[step.verify.value]?.trim() ?? '';
  if (!check.name.test(name)) return { ok: false, detail: `Type the ${check.what} name you used, so the city can look for it.` };
  const status = snapshot.services[snapshotService(check.kind)];
  if (status === 'locked') return { ok: false, detail: `The city isn't allowed to read your ${check.what}s. Update the player role, then try again.` };
  const found = snapshot.resources.find((r) => r.kind === check.kind && (r.name === name || r.id === name) && alive(r.state));
  if (!check.present) return found ? { ok: false, detail: `${name} is still there. Delete it, then check again.` } : { ok: true, detail: `${name} is gone. Nothing left running.` };
  if (!found) return { ok: false, detail: `No ${check.what} called ${name} in ${snapshot.region} yet. Check the name and the Region, then try again.` };
  if (check.state && !check.state.includes(found.state)) return { ok: false, detail: `${name} is ${found.state.toLowerCase()}. Give it a moment, then check again.` };
  return { ok: true, detail: `Found ${name} in ${snapshot.region}.` };
}

const snapshotService = (kind: ResourceKind) =>
  (({ instance: 'ec2', 'security-group': 'ec2', table: 'dynamodb', bucket: 's3', function: 'lambda', 'db-instance': 'rds', api: 'apigateway' }) as const)[kind];
