// Launch Day: build a stack from the services you've learned, then live through a launch's traffic, ten seconds of the
// day per tick. Pure and deterministic (the same stack and day always play out the same), so it's tested without a
// browser; src/ui/launch/LaunchDay.tsx draws it. Numbers are game-sized; each part's behaviour is a real one, cited in
// shared/launch.json (`rule`, `source`), and each failure names the part and the best practice that would have held.
import data from '../../shared/launch.json' with { type: 'json' };
import { bp } from './designRules';
import type { WaBestPractice } from '@/world/content';

export type PartId = keyof typeof data.parts;
export type SlotId = 'edge' | 'guard' | 'door' | 'compute' | 'buffer' | 'cache' | 'data';
export type Stack = Record<SlotId, PartId>;
export interface Part {
  serviceId: string | null;
  name: string;
  cost: number;
  rule: string;
  source: string;
}
export interface Day {
  id: string;
  name: string;
  budget: number;
  simple: string;
  events: string[];
  /** Buildings at Practitioner in this city to open it. */
  unlock: number;
}

export const SLOTS = data.slots as { id: SlotId; label: string; options: PartId[] }[];
export const PARTS = data.parts as Record<PartId, Part>;
export const DAYS = data.days as Day[];
export const TICKS = 60;
export const BASE = { reads: 100, writes: 30 };

export const costOf = (s: Stack) => SLOTS.reduce((n, slot) => n + PARTS[s[slot.id]].cost, 0);
export const servicesOf = (s: Stack) => [...new Set(SLOTS.map((slot) => PARTS[s[slot.id]].serviceId).filter((x): x is string => !!x))];
export const cheapest = (): Stack => Object.fromEntries(SLOTS.map((s) => [s.id, s.options[0]])) as Stack;

/** What the day throws at you, tick by tick. */
export function traffic(day: Day, t: number) {
  const on = (e: string) => day.events.includes(e);
  let mult = 1;
  if (on('spike') && t >= 12 && t < 22) mult = 4;
  if (on('viral') && t >= 38 && t < 50) mult = 8;
  return {
    reads: Math.round(BASE.reads * mult),
    writes: Math.round(BASE.writes * Math.min(mult, 4)),
    bots: on('bots') && t >= 44 && t < 56 ? 1500 : 0,
    blip: on('blip') && t >= 26 && t < 32,
    /** The first tick of the blip (an RDS Multi-AZ failover is still under way). */
    blipStart: on('blip') && t === 26,
  };
}

export type Reason = 'compute-blip' | 'data-blip' | 'compute-full' | 'data-full' | 'bots' | 'writes-dropped' | 'throttled';
export interface Tick {
  t: number;
  real: number;
  served: number;
  failed: number;
  queue: number;
  blip: boolean;
  bots: number;
}
export interface Result {
  ticks: Tick[];
  real: number;
  served: number;
  /** 0–100, one decimal. */
  availability: number;
  grade: 'A' | 'B' | 'C' | 'D';
  score: number;
  cost: number;
  /** Bot requests your stack served (and paid for): a firewall keeps this down (the cost pillar). */
  botsServed: number;
  /** Requests lost, by why, most first. */
  reasons: { reason: Reason; lost: number }[];
  queueMax: number;
}

const CAP = { ec2: 600, rds: 500, dynamoStart: 1500, lambdaStart: 1000, lambdaStep: 1000, throttle: 2500 };
const CACHE_MISS = 0.2;
const EDGE_MISS = 0.35;
const BOT_PASS = 0.05;

export function simulate(stack: Stack, day: Day): Result {
  const ticks: Tick[] = [];
  const lost: Partial<Record<Reason, number>> = {};
  let lostNow = 0;
  const lose = (r: Reason, n: number) => {
    if (n <= 0) return;
    lost[r] = (lost[r] ?? 0) + n;
    lostNow += n;
  };
  let queue = 0;
  let queueMax = 0;
  let lambdaCap = CAP.lambdaStart;
  let dynamoPeak = CAP.dynamoStart / 2;
  let real = 0;
  let served = 0;
  let botsServed = 0;
  for (let t = 0; t < TICKS; t++) {
    const tr = traffic(day, t);
    lostNow = 0;
    real += tr.reads + tr.writes;
    // Edge: cached reads never reach you; the firewall stops most of a bot flood.
    let reads = stack.edge === 'cloudfront' ? Math.round(tr.reads * EDGE_MISS) : tr.reads;
    const cachedAtEdge = tr.reads - reads;
    let bots = stack.guard === 'shield' ? Math.round(tr.bots * BOT_PASS) : tr.bots;
    let writes = tr.writes;
    // Front door: throttling turns away what's over the steady rate (it protects what's behind, but those are lost).
    if (stack.door === 'apigateway') {
      const total = reads + writes + bots;
      if (total > CAP.throttle) {
        const keep = CAP.throttle / total;
        lose('throttled', Math.round((reads + writes) * (1 - keep)));
        reads = Math.round(reads * keep);
        writes = Math.round(writes * keep);
        bots = Math.round(bots * keep);
      }
    }
    // Compute: what it can take this tick.
    let cap: number;
    if (stack.compute === 'lambda') cap = lambdaCap;
    else if (stack.compute === 'ec2-2az') cap = tr.blip ? CAP.ec2 / 2 : CAP.ec2;
    else cap = tr.blip ? 0 : CAP.ec2;
    lambdaCap = Math.min(lambdaCap + CAP.lambdaStep, 50_000);
    // Writes go to the queue when there is one; the queue drains with whatever room is left.
    const buffered = stack.buffer === 'sqs';
    if (buffered) queue += writes;
    const demand = reads + bots + (buffered ? 0 : writes);
    const take = Math.min(demand, cap);
    const share = demand ? take / demand : 1;
    const readsDone = Math.round(reads * share);
    const botsDone = Math.round(bots * share);
    botsServed += botsDone;
    let writesDone = buffered ? 0 : Math.round(writes * share);
    // Lost at compute: in the dark zone, crowded out by bots, or just more than it could take (and writes with no queue).
    const cause: Reason = tr.blip && stack.compute !== 'lambda' ? 'compute-blip' : bots > 0 ? 'bots' : 'compute-full';
    lose(cause, reads - readsDone);
    if (!buffered) lose(cause === 'compute-full' ? 'writes-dropped' : cause, writes - writesDone);
    if (buffered) {
      const room = Math.max(0, cap - take);
      const drained = Math.min(queue, room);
      queue -= drained;
      writesDone = drained;
    }
    queueMax = Math.max(queueMax, queue);
    // Data: reads (most from the cache when there is one) and writes.
    const dbReads = Math.round(readsDone * (stack.cache === 'elasticache' ? CACHE_MISS : 1));
    const dbDemand = dbReads + writesDone + Math.round(botsDone * 0.5);
    let dbCap: number;
    if (stack.data === 'dynamodb') {
      dbCap = Math.max(CAP.dynamoStart, dynamoPeak * 2);
    } else if (stack.data === 'rds-multiaz') dbCap = tr.blipStart ? 0 : CAP.rds;
    else dbCap = tr.blip ? 0 : CAP.rds;
    const dbTake = Math.min(dbDemand, dbCap);
    if (stack.data === 'dynamodb') dynamoPeak = Math.max(dynamoPeak, dbTake);
    const dbShare = dbDemand ? dbTake / dbDemand : 1;
    // A request the database couldn't answer is lost too (a cached read still counts: it never needed the database).
    const readsOk = readsDone - Math.round(dbReads * (1 - dbShare));
    const writesOk = Math.round(writesDone * dbShare);
    lose(tr.blip && stack.data !== 'dynamodb' ? 'data-blip' : 'data-full', readsDone - readsOk + (writesDone - writesOk));
    const ok = cachedAtEdge + readsOk + writesOk;
    served += ok;
    ticks.push({ t, real: tr.reads + tr.writes, served: ok, failed: lostNow, queue, blip: tr.blip, bots: tr.bots });
  }
  // Writes still waiting at the end of the day were never lost (they'll be worked through); count them as served late.
  served += queue;
  const availability = Math.round((served / Math.max(1, real)) * 1000) / 10;
  const grade = availability >= 99.5 ? 'A' : availability >= 97 ? 'B' : availability >= 90 ? 'C' : 'D';
  const cost = costOf(stack);
  // Serving bots costs real money (every request is billed): each 100 served takes a point off.
  const score = Math.max(0, Math.round(availability * 10) + Math.max(0, day.budget - cost) * 5 - Math.round(botsServed / 100));
  const reasons = (Object.entries(lost) as [Reason, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({ reason, lost: n }));
  return { ticks, real, served, availability, grade, score, cost, reasons, queueMax, botsServed };
}

/** What would have held, for each way requests were lost. */
export const ADVICE: Record<Reason, { text: string; part: PartId; bp: () => WaBestPractice }> = {
  'compute-blip': { text: 'Your servers were all in the zone that went dark. Spread them over two zones, or use Lambda.', part: 'ec2-2az', bp: () => bp('REL10-BP01') },
  'data-blip': { text: 'Your database was in the zone that went dark. A Multi-AZ standby (or DynamoDB) keeps answering.', part: 'rds-multiaz', bp: () => bp('REL11-BP02') },
  'compute-full': { text: 'The rush was more than your servers could take. Lambda scales out on its own.', part: 'lambda', bp: () => bp('PERF02-BP05') },
  'data-full': { text: 'The database couldn’t keep up. A cache takes repeat reads off it, or DynamoDB on-demand grows with the traffic.', part: 'elasticache', bp: () => bp('PERF03-BP05') },
  bots: { text: 'Bot traffic used up your servers. A firewall rule blocks floods before they reach you.', part: 'shield', bp: () => bp('SEC05-BP03') },
  'writes-dropped': { text: 'Writes failed when servers were busy. A queue holds them until there’s room.', part: 'sqs', bp: () => bp('REL04-BP02') },
  throttled: { text: 'Throttling turned customers away to protect what’s behind it. Edge caching and a firewall lower what reaches the door.', part: 'cloudfront', bp: () => bp('REL05-BP02') },
};
