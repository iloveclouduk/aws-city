import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Progress } from '../world.js';

const key = z.string().min(1).max(100);
/** A record with at most `max` keys (a learner's progress, never a fleet). */
const bounded = <T extends z.ZodType>(value: T, max: number, what: string) =>
  z.record(key, value).refine((r) => Object.keys(r).length <= max, `too many ${what}`);

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** A content id (a task, a decoration): lowercase words and dashes. */
const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
/** A cosmetic id (src/state/cosmetics.ts). */
const COSMETIC = /^[a-z0-9][a-z0-9:-]{0,59}$/;
const REGION = z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/);

const landmark = z.object({ discovered: z.boolean(), xp: z.number().int().min(0).max(1_000_000) }).strict();

/** Mirrors Progress in src/backend/contract.ts (v1 and v2, with the v2.3 citizens and fixes, the v2.4 streak, the v2.5 bill switch, the v2.7 cities, the v2.9 finds, the v2.10 workshops and talks, the v2.11 badges, profile and designs, the v2.12 remembered cards and games' scored rounds and weekly timed best, the v2.13 City Clients and build mode's decorations, the v2.14 City Coins wallet, the v2.15 City Lights, season roads, supply drops and codex, and the v2.16 freeze counters, per-city refunds, decor tombstones, road extras and crate overtime, purchases and spares). Strict: unknown fields fail. */
export const ProgressSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    landmarks: bounded(landmark, 200, 'landmarks'),
    /** v2.7: each Region's own city (src/state/cities.ts). */
    cities: z
      .record(z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/), z.object({ landmarks: bounded(landmark, 200, 'landmarks') }).strict())
      .refine((r) => Object.keys(r).length <= 60, 'too many cities')
      .optional(),
    cards: bounded(
      z
        .object({
          interval: z.number().min(0).max(36_500),
          ease: z.number().min(1).max(5),
          due: z.number().int().min(0),
          reps: z.number().int().min(0).max(100_000),
          /** v2.12: remembered for a week once (its bonus paid). */
          remembered: z.literal(true).optional(),
        })
        .strict(),
      2_000,
      'cards',
    ).optional(),
    quests: bounded(z.object({ status: z.enum(['active', 'done']), step: z.number().int().min(0).max(100), count: z.number().int().min(0).max(10_000).optional() }).strict(), 200, 'quests').optional(),
    puzzles: bounded(z.object({ best: z.number().min(0).max(100) }).strict(), 200, 'puzzles').optional(),
    games: bounded(
      z
        .object({
          best: z.number().min(0).max(1_000_000),
          plays: z.number().int().min(0).max(1_000_000),
          /** v2.12: rounds that scored above 0, and the best timed round of the ISO week `bestWeek`. */
          scored: z.number().int().min(0).max(1_000_000).optional(),
          bestTimed: z.number().min(0).max(1_000_000).optional(),
          bestWeek: z.string().regex(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/).optional(),
        })
        .strict(),
      50,
      'games',
    ).optional(),
    citizens: bounded(z.object({ xp: z.number().int().min(0).max(1_000_000) }).strict(), 20, 'citizens').optional(),
    fixes: bounded(z.iso.datetime({ offset: true }), 1_000, 'fixes').optional(),
    streak: z
      .object({
        days: z.number().int().min(1).max(100_000),
        last: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
        best: z.number().int().min(1).max(100_000),
        frozen: z.string().regex(DAY).optional(),
      })
      .strict()
      .optional(),
    /** v2.5: the bill switch. */
    bill: z.boolean().optional(),
    flow: z.boolean().optional(),
    /** v2.9: golden tokens found, token id → local date. */
    finds: bounded(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/), 1_000, 'finds').optional(),
    /** v2.10: hands-on workshops, by workshop id: each step done in practice or for real, and when it was finished. */
    workshops: bounded(
      z.object({ steps: bounded(z.enum(['practice', 'real']), 50, 'workshop steps'), done: z.string().regex(DAY).optional() }).strict(),
      200,
      'workshops',
    ).optional(),
    /** v2.10: AWS North Hall talks passed, talk id → local date. */
    talks: bounded(z.string().regex(DAY), 200, 'talks').optional(),
    /** v2.11: moment badges, badge id → local date. */
    badges: bounded(z.string().regex(DAY), 100, 'badges').optional(),
    /** v2.11: the public profile; the name is two generated words (letters and one space only). */
    profile: z.object({ public: z.boolean(), name: z.string().regex(/^[A-Z][a-z]{1,15} [A-Z][a-z]{1,15}$/) }).strict().optional(),
    /** v2.11: sandbox designs (small: at most 20, 60 nodes and 120 edges each). */
    designs: bounded(
      z
        .object({
          name: z.string().min(1).max(60),
          updatedAt: z.iso.datetime({ offset: true }),
          nodes: z
            .array(z.object({ id: z.string().min(1).max(40), kind: z.string().min(1).max(40), x: z.number().int().min(-1000).max(1000), y: z.number().int().min(-1000).max(1000), w: z.number().int().min(1).max(100).optional(), h: z.number().int().min(1).max(100).optional() }).strict())
            .max(60),
          edges: z.array(z.object({ from: z.string().min(1).max(40), to: z.string().min(1).max(40) }).strict()).max(120),
        })
        .strict(),
      20,
      'designs',
    ).optional(),
    /** v2.13: City Clients side jobs, by business id: levels finished, task ids done, and the date each level was finished. */
    clients: bounded(
      z
        .object({
          level: z.number().int().min(0).max(10),
          done: z.array(z.string().regex(ID)).max(100),
          at: bounded(z.string().regex(DAY), 10, 'client levels').optional(),
        })
        .strict(),
      50,
      'clients',
    ).optional(),
    /** v2.13: build mode's decorations, by Region city (small: 120 props a city, 240 in all, so a save stays well inside the 64 KB body). */
    decor: z
      .record(
        REGION,
        z
          .object({
            updatedAt: z.iso.datetime({ offset: true }),
            props: z
              .array(z.object({ id: z.string().regex(ID), kind: z.string().regex(/^[a-z0-9][a-z0-9:-]{0,39}$/), x: z.number().int().min(-64).max(256), y: z.number().int().min(-64).max(256), at: z.string().regex(DAY) }).strict())
              .max(120),
            spent: z.number().int().min(0).max(1_000_000).optional(),
            /** v2.16: prop ids removed (the last 200), so a merge never brings one back. */
            gone: z.array(z.string().regex(ID)).max(200).optional(),
          })
          .strict(),
      )
      .refine((r) => Object.keys(r).length <= 20, 'too many decorated cities')
      .refine((r) => Object.values(r).reduce((n, c) => n + c.props.length, 0) <= 240, 'too many decorations')
      .optional(),
    /** v2.14: City Coins: earned and spent only go up; `log` is coins earned on each of the last days (at most 31); `refunded` the old decor stars given back once; `shift` the last day whose shift paid. */
    wallet: z
      .object({
        earned: z.number().int().min(0).max(100_000_000),
        spent: z.number().int().min(0).max(100_000_000),
        log: z.array(z.object({ day: z.string().regex(DAY), coins: z.number().int().min(0).max(1_000_000) }).strict()).max(31).optional(),
        refunded: z.number().int().min(0).max(100_000_000).optional(),
        /** v2.16: the old decor stars given back, city by city. */
        refundedBy: z
          .record(REGION, z.number().int().min(0).max(1_000_000))
          .refine((r) => Object.keys(r).length <= 20, 'too many refunded cities')
          .optional(),
        shift: z.string().regex(DAY).optional(),
      })
      .strict()
      .refine((w) => w.spent <= w.earned, 'spent more coins than earned')
      .optional(),
    /** v2.15: City Lights: learning days (the last 60), the total ever, earned freezes held (at most 3) and the days they covered. */
    lights: z
      .object({
        days: z.array(z.string().regex(DAY)).max(60),
        total: z.number().int().min(0).max(100_000).optional(),
        freezes: z.number().int().min(0).max(3),
        usedFreezes: z.array(z.string().regex(DAY)).max(60).optional(),
        /** v2.16: freezes earned ever and used ever (counters that only go up). */
        freezesEarned: z.number().int().min(0).max(100_000).optional(),
        freezesUsed: z.number().int().min(0).max(100_000).optional(),
      })
      .strict()
      .optional(),
    /** v2.15: season roads, by season id: points (whole), the step indexes claimed, the last day a shift paid. */
    seasons: bounded(
      z
        .object({
          points: z.number().int().min(0).max(100_000),
          claimed: z.array(z.number().int().min(0).max(19)).max(20),
          last: z.string().regex(DAY).optional(),
          /** v2.16: crate cosmetics a freeze step gave while the freezes were full. */
          extra: z.array(z.string().regex(COSMETIC)).max(20).optional(),
        })
        .strict(),
      24,
      'seasons',
    ).optional(),
    /** v2.15: the Daily Supply Drop: the last day opened and the cosmetic ids it gave (content ids, at most 200). */
    drops: z
      .object({
        last: z.string().regex(DAY).optional(),
        owned: z.array(z.string().regex(COSMETIC)).max(200),
        /** v2.16: the day the overtime crate was opened, crate items bought with coins, spare copies won per decoration. */
        overtime: z.string().regex(DAY).optional(),
        bought: z.array(z.string().regex(COSMETIC)).max(200).optional(),
        spares: bounded(z.number().int().min(0).max(3), 200, 'spares').optional(),
      })
      .strict()
      .optional(),
    /** v2.15: the Service Codex: combos found, combo id → local date. */
    codex: z.object({ combos: bounded(z.string().regex(DAY), 200, 'combos') }).strict().optional(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

/** GET/PUT /progress, stored as a local JSON file (the player's own progress on their own machine). */
export const createProgressStore = (file: string) => {
  let cache: Progress | null | undefined;
  // The side panel and the full-tab city both PUT; serialise writes so they never race on the file.
  let writes: Promise<unknown> = Promise.resolve();

  const load = async (): Promise<Progress | null> => {
    if (cache !== undefined) return cache;
    try {
      const parsed = ProgressSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
      cache = parsed.success ? (parsed.data as Progress) : null;
    } catch {
      cache = null;
    }
    return cache;
  };

  return {
    get: load,
    /** Keeps the newest copy (by updatedAt), matching the contract's "newest wins" rule. */
    put(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
      const parsed = ProgressSchema.safeParse(input);
      if (!parsed.success) return Promise.resolve({ ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
      const run = writes.then(async () => {
        const current = await load();
        if (current && Date.parse(current.updatedAt) > Date.parse(parsed.data.updatedAt)) return { ok: true as const };
        await mkdir(dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(tmp, JSON.stringify(parsed.data, null, 2));
        await rename(tmp, file);
        cache = parsed.data as Progress;
        return { ok: true as const };
      });
      writes = run.catch(() => undefined);
      return run;
    },
  };
};

export type ProgressStore = ReturnType<typeof createProgressStore>;
