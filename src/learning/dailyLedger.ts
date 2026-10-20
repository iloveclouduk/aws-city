// One daily ledger for "only so many a day" rewards (game rounds, a puzzle's try, chat answers, tasks, Lookout pages,
// sandbox services): counts per key for the player's local day, kept on this device so a reload doesn't start the day
// again. Only today's counts are stored; a new day replaces them (that's the pruning). The side panel and the tab share
// the same storage.
import { dayKey } from '@/state/progress';
import { readPref, writePref } from '@/ui/logic';

export const DAILY_KEY = 'awscity.daily';

/** One day's counts by key. */
export interface DayCounts {
  day: string;
  n: Record<string, number>;
}

/** Where the counts live: the device (prefs) by default, memory in tests. */
export interface LedgerStore {
  load(): DayCounts | undefined;
  save(c: DayCounts): void;
}

const valid = (v: unknown): v is DayCounts =>
  !!v && typeof (v as DayCounts).day === 'string' && typeof (v as DayCounts).n === 'object' && (v as DayCounts).n !== null;

export const deviceLedger: LedgerStore = {
  load() {
    try {
      const v: unknown = JSON.parse(readPref(DAILY_KEY) ?? 'null');
      return valid(v) ? v : undefined;
    } catch {
      return undefined;
    }
  },
  save: (c) => writePref(DAILY_KEY, JSON.stringify(c)),
};

/** A ledger in memory (tests, or anywhere the count shouldn't outlive the page). */
export const memoryLedger = (): LedgerStore => {
  let c: DayCounts | undefined;
  return { load: () => c, save: (x) => void (c = x) };
};

/** How many times `key` was counted on `day` (without counting). */
export function usedToday(key: string, day = dayKey(), store: LedgerStore = deviceLedger) {
  const c = store.load();
  return c?.day === day ? (c.n[key] ?? 0) : 0;
}

/** How many times `key` was counted on `day` before this one; counts this one. */
export function countDaily(key: string, day = dayKey(), store: LedgerStore = deviceLedger) {
  const c = store.load();
  const n = c?.day === day ? { ...c.n } : {};
  const before = n[key] ?? 0;
  n[key] = before + 1;
  store.save({ day, n });
  return before;
}

/** True for the first `limit` times `key` is taken on `day`, then false until tomorrow. Counts every call. */
export const takeDaily = (key: string, limit = 1, day = dayKey(), store: LedgerStore = deviceLedger) => countDaily(key, day, store) < limit;
