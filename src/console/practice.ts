// The practice console: a safe, local page inside the extension (practice.html) that looks like the AWS console.
// Nothing on it touches AWS. Pure helpers shared by the background (focus), the runtime (the demo's Copilot and
// Lookout target it) and the page itself. Routes are hash routes: practice.html#/s3, #/s3/create, #/s3/done.

/** The services the practice console has pages for: each one's scripted Copilot flow runs end to end there. */
export const PRACTICE_SERVICES = ['s3', 'ec2', 'dynamodb', 'lambda', 'rds', 'cloudfront', 'sqs', 'iam'] as const;
export type PracticeService = (typeof PRACTICE_SERVICES)[number];

/** The page's path in the built extension (src/entrypoints/practice/index.html). */
export const PRACTICE_PATH = '/practice.html';

const EXTENSION_SCHEMES = ['chrome-extension:', 'moz-extension:', 'safari-web-extension:'];

export const isPracticeService = (id: string | undefined): id is PracticeService => !!id && (PRACTICE_SERVICES as readonly string[]).includes(id);

/**
 * The practice console of this extension: `base` is its own `runtime.getURL(PRACTICE_PATH)`, so another
 * extension's page of the same name never counts.
 */
export function isPracticeUrl(raw: string | undefined, base: string): boolean {
  if (!raw || !base) return false;
  try {
    const u = new URL(raw);
    const b = new URL(base);
    return EXTENSION_SCHEMES.includes(u.protocol) && u.protocol === b.protocol && u.host === b.host && u.pathname === b.pathname;
  } catch {
    return false;
  }
}

/** The route a practice URL (or a bare hash) shows: its service and page. */
export function practiceRoute(rawOrHash: string): { service?: PracticeService; page: 'list' | 'create' | 'done' | 'home' } {
  const hash = rawOrHash.includes('#') ? rawOrHash.slice(rawOrHash.indexOf('#') + 1) : '';
  const [svc, page] = hash.replace(/^\/+/, '').split(/[/?]/);
  if (!isPracticeService(svc)) return { page: 'home' };
  return { service: svc, page: page === 'create' ? 'create' : page === 'done' ? 'done' : 'list' };
}

/** The service a practice URL's page belongs to (undefined on its home page). */
export const practiceServiceOf = (raw: string) => practiceRoute(raw).service;

/** The practice console opened at a service's list page (its home when the service has no page there). */
export const practiceUrl = (base: string, serviceId?: string) => (isPracticeService(serviceId) ? `${base}#/${serviceId}` : base);
