// The free monthly season roads (contract v2.15 Progress.seasons). Twelve themes, one per calendar month ("Serverless
// Spring", "Data Lake Summer"…): a road of SEASON_ROAD steps filled by finished shifts, ending in the season's own
// landmark (a monument for Decorate). Nothing to buy, ever: every step is a look (a decoration, a window colour) or an
// earned City Lights freeze (v2.16: a freeze step reached with the freezes full gives a crate item instead). Every
// season's road is open to everyone, any time: the player picks which road a shift fills in My City (the current
// month's by default), and a finished road's points flow into the next unfinished one, so no shift is wasted.
// Pure (tests/season.test.ts).
import type { Progress, SeasonProgress } from '@/backend/contract';
import { cosmeticById, DROP_POOL } from './cosmetics';

export interface Season {
  id: string;
  /** 1–12: the calendar month it's featured. */
  month: number;
  name: string;
  icon: string;
  /** Services the theme is about: a shift that grew one of them pays THEME_BONUS more. */
  services: string[];
  /** Cosmetic ids: two small decorations, a rare one, the window colour and the landmark (the last step). */
  decor: [string, string, string];
  glow: string;
  landmark: string;
}

export const SEASONS: Season[] = [
  { id: 'snowy-security', month: 1, name: 'Snowy Security', icon: '❄️', services: ['iam', 'kms', 'guardduty', 'shield'], decor: ['snowman', 'snowy-pine', 'garden-gazebo'], glow: 'glow-ice', landmark: 'mon-gate-columns' },
  { id: 'data-hearts', month: 2, name: 'Database Hearts', icon: '💞', services: ['dynamodb', 'rds', 'aurora', 'elasticache'], decor: ['snowy-pine', 'blossom', 'garden-gazebo'], glow: 'glow-rose', landmark: 'mon-dome-stone' },
  { id: 'serverless-spring', month: 3, name: 'Serverless Spring', icon: '🌱', services: ['lambda', 'apigateway', 'eventbridge', 'stepfunctions'], decor: ['blossom', 'summer-tree', 'hedge-maze'], glow: 'glow-mint', landmark: 'mon-pavilion-green' },
  { id: 'blossom-networks', month: 4, name: 'Blossom Networks', icon: '🌸', services: ['vpc', 'route53', 'transitgateway', 'cloudfront'], decor: ['blossom', 'maple', 'garden-gazebo'], glow: 'glow-lilac', landmark: 'mon-bridge' },
  { id: 'container-may', month: 5, name: 'Container May', icon: '📦', services: ['ecs', 'eks', 'fargate', 'apprunner'], decor: ['summer-tree', 'blossom', 'amphitheatre'], glow: 'glow-teal', landmark: 'mon-harbour' },
  { id: 'data-lake-summer', month: 6, name: 'Data Lake Summer', icon: '🏖️', services: ['s3', 'athena', 'glue', 'lakeformation'], decor: ['beach-umbrella', 'summer-tree', 'hedge-maze'], glow: 'glow-sky', landmark: 'mon-shells' },
  { id: 'edge-summer', month: 7, name: 'Edge of Summer', icon: '🌞', services: ['cloudfront', 'globalaccelerator', 'route53', 's3'], decor: ['beach-umbrella', 'summer-tree', 'amphitheatre'], glow: 'glow-coral', landmark: 'mon-windtower' },
  { id: 'ai-holiday', month: 8, name: 'AI Holiday', icon: '🤖', services: ['bedrock', 'sagemaker', 'agentcore', 'q'], decor: ['beach-umbrella', 'summer-tree', 'garden-gazebo'], glow: 'glow-violet', landmark: 'mon-dome-glass' },
  { id: 'back-to-builders', month: 9, name: 'Back to Builders', icon: '🛠️', services: ['ec2', 'cloudformation', 'systemsmanager', 'batch'], decor: ['maple', 'summer-tree', 'hedge-maze'], glow: 'glow-ember', landmark: 'mon-modernist' },
  { id: 'harvest-streams', month: 10, name: 'Harvest of Streams', icon: '🍂', services: ['kinesis', 'sqs', 'eventbridge', 'cloudwatch'], decor: ['maple', 'snowy-pine', 'amphitheatre'], glow: 'glow-gold', landmark: 'mon-lattice-bronze' },
  { id: 'observability-autumn', month: 11, name: 'Observability Autumn', icon: '🔭', services: ['cloudwatch', 'config', 'securityhub', 'inspector'], decor: ['maple', 'garden-gazebo', 'hedge-maze'], glow: 'glow-lime', landmark: 'mon-spire-clock' },
  { id: 'winter-lights', month: 12, name: 'Winter Lights', icon: '✨', services: ['backup', 'organizations', 'cognito', 'secretsmanager'], decor: ['snowman', 'snowy-pine', 'amphitheatre'], glow: 'glow-rainbow', landmark: 'mon-needle-white' },
];

export const seasonById = (id: string) => SEASONS.find((s) => s.id === id);
/** The month's season for a local day (YYYY-MM-DD). */
export const seasonFor = (day: string) => SEASONS.find((s) => s.month === Number(day.slice(5, 7)))!;

/** Points a finished shift pays the road it fills, and the bonus when the shift grew one of the theme's services. */
export const SHIFT_POINTS = 10;
export const THEME_BONUS = 5;

export type RoadReward = { kind: 'cosmetic'; id: string } | { kind: 'freeze' };
export interface RoadStep {
  at: number;
  reward: RoadReward;
}

/** The road: 8 steps to 100 points (about ten finished shifts, so a month has room to miss days). */
export const ROAD_AT = [10, 20, 30, 40, 55, 70, 85, 100] as const;
export const SEASON_ROAD = ROAD_AT.length;

export function roadOf(s: Season): RoadStep[] {
  const r: RoadReward[] = [
    { kind: 'freeze' },
    { kind: 'cosmetic', id: s.decor[0] },
    { kind: 'cosmetic', id: s.glow },
    { kind: 'freeze' },
    { kind: 'cosmetic', id: s.decor[1] },
    { kind: 'freeze' },
    { kind: 'cosmetic', id: s.decor[2] },
    { kind: 'cosmetic', id: s.landmark },
  ];
  return ROAD_AT.map((at, i) => ({ at, reward: r[i]! }));
}

export const rewardName = (r: RoadReward) => (r.kind === 'freeze' ? '🧊 A City Lights freeze' : `${cosmeticById(r.id)?.icon ?? '🎁'} ${cosmeticById(r.id)?.name ?? r.id}`);

const EMPTY: SeasonProgress = { points: 0, claimed: [] };
export const seasonOf = (p: Progress, id: string): SeasonProgress => p.seasons?.[id] ?? EMPTY;

/** Steps reached and not yet claimed. */
export const claimable = (p: Progress, id: string) => {
  const s = seasonById(id);
  if (!s) return [];
  const sp = seasonOf(p, id);
  return roadOf(s).flatMap((st, i) => (sp.points >= st.at && !sp.claimed.includes(i) ? [i] : []));
};

/** The points that finish a road (its last step). */
export const ROAD_END = ROAD_AT[ROAD_AT.length - 1]!;
export const roadDone = (p: Progress, id: string) => seasonOf(p, id).points >= ROAD_END;

/**
 * Seasons the player may fill: every one, any time (v2.16: no road waits for City Hall), this month's first, then the
 * months before it, most recent first. `_hallLevel` is kept for callers from v2.15.
 */
export function openSeasons(_p: Progress, today: string, _hallLevel?: number): Season[] {
  const now = seasonFor(today);
  const back = Array.from({ length: 11 }, (_, i) => SEASONS.find((s) => s.month === ((now.month - 2 - i + 24) % 12) + 1)!);
  return [now, ...back];
}

/**
 * The progress after today's finished shift fills season `id`: SHIFT_POINTS (+THEME_BONUS if `grew` names a theme
 * service), once a day across every road (`last` on any road is today → unchanged). Points past a road's end flow into
 * the next unfinished road (this month's, then the months before it), so a finished road never wastes a shift.
 */
export function fillSeason(p: Progress, id: string, today: string, grew: readonly string[] = [], now = new Date().toISOString()): Progress {
  const s = seasonById(id);
  if (!s) return p;
  if (Object.values(p.seasons ?? {}).some((x) => x.last === today)) return p;
  let pts = SHIFT_POINTS + (grew.some((g) => s.services.includes(g)) ? THEME_BONUS : 0);
  const order = [s, ...openSeasons(p, today).filter((x) => x.id !== s.id)];
  const seasons = { ...p.seasons };
  for (const x of order) {
    const sp = seasons[x.id] ?? EMPTY;
    const room = ROAD_END - sp.points;
    if (room <= 0) continue;
    const add = Math.min(room, pts);
    seasons[x.id] = { ...sp, points: sp.points + add, last: today };
    pts -= add;
    if (pts <= 0) break;
  }
  // Every road finished: the picked one keeps the day (nothing more to fill).
  if (pts > 0 && !Object.values(seasons).some((x) => x.last === today)) seasons[s.id] = { ...seasonOf(p, s.id), last: today };
  return { ...p, seasons, updatedAt: now };
}

/**
 * The progress after claiming step `i` of season `id`, or undefined when it isn't reached or is already claimed. A
 * freeze step claimed while the freezes are full (`freezesFull`) gives a crate item the player doesn't own instead
 * (`owned`: every cosmetic owned, src/state/rewards.ts), kept in the road's `extra`.
 */
export function claimStep(
  p: Progress,
  id: string,
  i: number,
  now = new Date().toISOString(),
  opts: { freezesFull?: boolean; owned?: ReadonlySet<string> } = {},
): { progress: Progress; reward: RoadReward } | undefined {
  const s = seasonById(id);
  const st = s && roadOf(s)[i];
  if (!st || !claimable(p, id).includes(i)) return undefined;
  const sp = seasonOf(p, id);
  const claimed = [...sp.claimed, i].sort((a, b) => a - b);
  if (st.reward.kind === 'freeze' && opts.freezesFull) {
    const owned = opts.owned ?? new Set<string>();
    // A crate item not owned and not on this road (its own steps give those), a decoration before a colour; the pick
    // is seeded by the season and step, so every surface gives the same one.
    const road = new Set([s.glow, ...s.decor, s.landmark]);
    const pool = DROP_POOL.filter((c) => !owned.has(c.id) && !road.has(c.id));
    const decor = pool.filter((c) => c.kind === 'decor');
    const from = decor.length ? decor : pool;
    const pick = from.length ? from[(s.month * 7 + i) % from.length]!.id : undefined;
    if (pick) {
      const extra = [...(sp.extra ?? []), pick];
      return { progress: { ...p, seasons: { ...p.seasons, [id]: { ...sp, claimed, extra } }, updatedAt: now }, reward: { kind: 'cosmetic', id: pick } };
    }
  }
  return { progress: { ...p, seasons: { ...p.seasons, [id]: { ...sp, claimed } }, updatedAt: now }, reward: st.reward };
}

/** Cosmetics claimed on every road (and the crate items freeze steps gave while the freezes were full). */
export function seasonCosmetics(p: Progress): string[] {
  const out: string[] = [];
  for (const [id, sp] of Object.entries(p.seasons ?? {})) {
    const s = seasonById(id);
    if (!s) continue;
    const road = roadOf(s);
    for (const i of sp.claimed) {
      const r = road[i]?.reward;
      if (r?.kind === 'cosmetic') out.push(r.id);
    }
    out.push(...(sp.extra ?? []));
  }
  return out;
}

/** Two copies of the roads: per season the higher points, every step claimed in either, the later day paid, every extra item. */
export function mergeSeasons(a: Progress['seasons'], b: Progress['seasons']): Progress['seasons'] {
  if (!a || !b) return a ?? b;
  const out: Record<string, SeasonProgress> = { ...a };
  for (const [id, y] of Object.entries(b)) {
    const x = out[id];
    if (!x) {
      out[id] = y;
      continue;
    }
    const last = [x.last, y.last].filter(Boolean).sort().at(-1);
    const extra = [...new Set([...(x.extra ?? []), ...(y.extra ?? [])])].sort();
    out[id] = { points: Math.max(x.points, y.points), claimed: [...new Set([...x.claimed, ...y.claimed])].sort((m, n) => m - n), ...(last ? { last } : {}), ...(extra.length ? { extra } : {}) };
  }
  return out;
}
