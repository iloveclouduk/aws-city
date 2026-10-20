// Learning traffic (plan round 3, Step 3): couriers that drive the real flows of shared/flows.json between buildings the
// player has put up (CloudFront → S3, API Gateway → Lambda…), each a "how data flows" lesson you can tap. They're the
// third thing on the roads that means something (CLAUDE.md "City life is ambience"): never the account's own data (the
// data carriers in carriers.ts are), drawn apart from those (a plain car with a dashed trail, never a roof beacon) and
// inside the vehicle cap. Pure: which legs exist, what each one says, how many drive, and the city's rush hour.
import { comboById, COMBOS } from './combos';
import type { Flow } from './culture';
import { serviceById } from './taxonomy';
import type { Surface } from './traffic';

/** One leg of a flow: from one put-up building to the next one the request reaches. */
export interface CourierLeg {
  flowId: string;
  from: string;
  to: string;
  /** "Static website · CloudFront → S3". */
  title: string;
  /** The plain sentence a tapped courier shows. */
  text: string;
  source: string;
}

const short = (id: string) => (serviceById(id)?.name ?? id).replace(/^(Amazon|AWS) /, '');

/**
 * Every leg of every flow whose two ends are both put up here (`built`), consecutive in the flow, once per pair. A
 * combo of exactly that pair explains the leg (its sentence is about those two); else the flow's own explanation does.
 */
export function courierLegs(flows: readonly Flow[], built: (serviceId: string) => boolean): CourierLeg[] {
  const out: CourierLeg[] = [];
  const seen = new Set<string>();
  for (const f of flows)
    for (let i = 0; i + 1 < f.serviceIds.length; i++) {
      const from = f.serviceIds[i];
      const to = f.serviceIds[i + 1];
      const pair = [from, to].sort().join('+');
      if (from === to || seen.has(pair) || !built(from) || !built(to)) continue;
      seen.add(pair);
      const combo = COMBOS.find((c) => c.services.length === 2 && c.services.includes(from) && c.services.includes(to));
      out.push({
        flowId: f.id,
        from,
        to,
        title: `${f.name} · ${short(from)} → ${short(to)}`,
        text: combo?.simple ?? f.explain,
        source: combo ? comboById(combo.id)!.source : f.source,
      });
    }
  return out;
}

/** Learning couriers on the roads at once, at most; more at rush hour. Well inside VEHICLE_CAP beside DATA_CAP. */
export const LEARN_CAP: Record<Surface, number> = { panel: 2, tab: 3 };
export const LEARN_RUSH_CAP: Record<Surface, number> = { panel: 3, tab: 5 };
/** How often a courier sets off (ms), normally and at rush hour. */
export const LEARN_EVERY_MS = 9_000;
export const LEARN_RUSH_EVERY_MS = 3_500;

/** The city's rush hours, local time: 8–9 in the morning and 17–18 in the evening. */
export const RUSH_HOURS: readonly [number, number][] = [
  [8, 9],
  [17, 18],
];
/** Is it rush hour at this hour of the day (0–24, fractions allowed)? */
export const isRushHour = (hour: number) => RUSH_HOURS.some(([a, b]) => hour >= a && hour < b);

/** How many couriers drive now: none without a leg, else the cap for the surface and the hour (never more legs × 2). */
export const learnTarget = (legs: number, surface: Surface, rush: boolean) => (legs <= 0 ? 0 : Math.min((rush ? LEARN_RUSH_CAP : LEARN_CAP)[surface], legs * 2));

/** The services whose "Auto Scaling" moment plays at rush hour (extra workers pop up at their buildings). */
export const SCALERS = ['ec2', 'lambda'];
/** Extra workers each scaler gets at rush hour, and how long they stay (ms). */
export const SURGE_WORKERS = 2;
export const SURGE_MS = 45_000;
