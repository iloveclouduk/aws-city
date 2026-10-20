// City Clients (shared/clients.json, src/world/clients.ts): the content rules (ported from the drafts' check.mjs), the
// pay-once and level rules, gating, the merge, and where the businesses stand in every Region's city.
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Progress } from '@/backend/contract';
import { mergeProgress } from '@/state/progress';
import { branded } from '@/world/brand';
import {
  ALL_TASKS,
  CLIENTS,
  clientSites,
  completeTask,
  currentLevel,
  hoodLots,
  levelCount,
  levelPay,
  LOT_CLIENTS,
  lotSizeOf,
  missingFor,
  ringLotsNeeded,
  stationsOf,
  STARTER_TASKS,
  taskById,
  taskOpen,
  taskPay,
  waveOf,
} from '@/world/clients';
import { CARDS } from '@/world/content';
import { ALL_TERMS } from '@/world/glossary';
import { cityPlanFor, legacyPlan } from '@/world/plan';
import { zonesFor } from '@/world/regions';
import { SERVICES, serviceById } from '@/world/taxonomy';
import { terrainFor } from '@/world/terrain';
import { STATION_KINDS } from '@/learning/stations/types';
import { puzzleForJob } from '@/learning/jobPuzzle';
import { slotsOf } from '@/learning/diagram';
import { scoreDiagram } from '@/learning/scoring';
import { STAGES, stageOpen } from '@/world/airport';
import { run } from '@/learning/terminal';

const cardIds = new Set(Object.values(CARDS).flat().map((c) => c.id));
const FLOWS = new Set(['s3', 'ec2', 'dynamodb', 'lambda', 'rds', 'cloudfront', 'sqs', 'iam']);
const TYPES = new Set(['wire', 'run', 'choose', 'click', 'fix', 'explain', 'station']);

// The plain-language rule tests/content.test.ts applies: every acronym is a glossary term, a service name or allow-listed.
const bare = (n: string) => n.replace(/^(Amazon|AWS) /, '');
const known = new Set(
  [...ALL_TERMS.flatMap((g) => [g.term, ...g.aliases]), ...SERVICES.flatMap((s) => [s.name, ...s.name.split(' & ').map(bare)])].flatMap((n) => n.split(/[^A-Za-z0-9]+/)),
);
const ACRONYM = /\b[A-Z][A-Z0-9]{1,}[a-z0-9]*\b/g;
const ALLOWED = new Set(['AWS', 'XP', 'OK']);
const explained = (w: string) => ALLOWED.has(w) || known.has(w) || (w.endsWith('s') && known.has(w.slice(0, -1)));

/** Every player-facing line, with where it's from. */
function prose(): [string, string][] {
  const out: [string, string][] = [];
  const add = (where: string, text: unknown) => typeof text === 'string' && out.push([where, text]);
  for (const b of CLIENTS) {
    for (const k of ['name', 'nameUnbranded', 'story', 'simple'] as const) add(`${b.id} ${k}`, b[k]);
    for (const lv of b.levels) {
      for (const k of ['title', 'goal', 'celebrate'] as const) add(`${b.id} L${lv.level} ${k}`, lv[k]);
      for (const t of lv.tasks) {
        add(`${t.id} title`, t.title);
        add(`${t.id} station`, t.station);
        add(`${t.id} why`, t.why);
        if (t.type === 'wire') [t.wire.story, t.wire.why, t.wire.simpleWhy, ...t.wire.requirements].forEach((x, i) => add(`${t.id} wire ${i}`, x));
        if (t.type === 'choose') [t.choose.question, ...t.choose.options.flatMap((o) => [o.text, o.why])].forEach((x, i) => add(`${t.id} choose ${i}`, x));
        if (t.type === 'run') [t.run.body, ...(t.run.errors ?? []).flatMap((e) => [e.explain, e.fix])].forEach((x, i) => add(`${t.id} run ${i}`, x));
        if (t.type === 'fix') t.fix.settings.forEach((s) => (add(`${t.id} ${s.id} label`, s.label), add(`${t.id} ${s.id} why`, s.why)));
        if (t.type === 'explain') add(`${t.id} question`, t.explain.question);
        if (t.type === 'station') {
          const p = t.panel;
          add(`${t.id} rules`, p.rules);
          if (p.kind === 'sort') [...p.bins.map((x) => x.label), ...p.items.flatMap((x) => [x.text, x.hint])].forEach((x, i) => add(`${t.id} sort ${i}`, x));
          if (p.kind === 'match') [...p.left, ...p.right].forEach((x) => add(`${t.id} match ${x.id}`, x.text));
          if (p.kind === 'route') [...p.flows, ...p.targets].forEach((x) => add(`${t.id} route ${x.id}`, x.label));
          if (p.kind === 'rotate') p.items.forEach((x) => add(`${t.id} rotate ${x.id}`, x.label));
          if (p.kind === 'scale') p.slots.forEach((x, i) => add(`${t.id} slot ${i}`, x.label));
          if (p.kind === 'spot') p.lines.forEach((l, i) => (add(`${t.id} line ${i}`, l.text), add(`${t.id} hint ${i}`, l.hint)));
          if (p.kind === 'order') p.steps.forEach((x, i) => add(`${t.id} step ${i}`, x));
        }
      }
    }
  }
  return out;
}

describe('City Clients content (shared/clients.json)', () => {
  it('has the 18 businesses (wave 1, then wave 2), three levels each and 4 to 6 tasks of at least 4 types a level', () => {
    expect(CLIENTS.map((b) => b.id)).toEqual([
      ...['airport', 'bank', 'stadium', 'hospital', 'shop', 'school'],
      ...['studio', 'games', 'news', 'port', 'energy', 'factory', 'farm', 'carmaker', 'telecom', 'council', 'hotel', 'charity'],
    ]);
    for (const b of CLIENTS) {
      expect(b.levels.map((l) => l.level), b.id).toEqual([1, 2, 3]);
      expect(b.growth.map((g) => g.level), b.id).toEqual([0, 1, 2, 3]);
      expect(b.art, b.id).toBe(`client:${b.id}`);
      for (const lv of b.levels) {
        expect(lv.tasks.length, `${b.id} L${lv.level}`).toBeGreaterThanOrEqual(4);
        expect(lv.tasks.length, `${b.id} L${lv.level}`).toBeLessThanOrEqual(6);
        expect(new Set(lv.tasks.map((t) => t.type)).size, `${b.id} L${lv.level}`).toBeGreaterThanOrEqual(4);
        expect(lv.bonusStars).toBeGreaterThan(0);
      }
    }
  });

  it('every business cites fetched AWS pages, and every task rests on one of them or a real flashcard', () => {
    for (const b of CLIENTS) {
      expect(b.sources.length, b.id).toBeGreaterThan(0);
      for (const s of b.sources) {
        expect(s.url, b.id).toMatch(/^https:\/\/(docs\.)?aws\.amazon\.com\//);
        expect(s.facts.length, s.url).toBeGreaterThan(0);
      }
      const fetched = new Set(b.sources.map((s) => s.url));
      for (const t of b.levels.flatMap((l) => l.tasks)) {
        expect(t.basis.length, t.id).toBeGreaterThan(0);
        for (const ba of t.basis) expect(ba.startsWith('card:') ? cardIds.has(ba.slice(5)) : fetched.has(ba), `${t.id} basis ${ba}`).toBe(true);
      }
    }
  });

  it('task ids are unique; every service is a real building; types, stars and stations are set', () => {
    const ids = ALL_TASKS.map((r) => r.task.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { task: t } of ALL_TASKS) {
      expect(TYPES.has(t.type), t.id).toBe(true);
      expect(t.services.length, t.id).toBeGreaterThan(0);
      for (const s of t.services) expect(serviceById(s), `${t.id} service ${s}`).toBeTruthy();
      expect(t.stars, t.id).toBeGreaterThan(0);
      expect(t.station.trim(), t.id).not.toBe('');
      expect(t.why.length, t.id).toBeLessThanOrEqual(160);
      expect(taskById(t.id)?.task).toBe(t);
    }
  });

  it('every task resolves to a runner that can play it', () => {
    for (const { task: t, client } of ALL_TASKS) {
      if (t.type === 'wire') {
        const w = t.wire;
        for (const s of [...w.required, ...w.optional, ...w.distractors, ...w.flow]) expect(serviceById(s), `${t.id} ${s}`).toBeTruthy();
        for (const s of w.flow) expect(w.required.includes(s) || w.optional.includes(s), `${t.id} flow ${s}`).toBe(true);
        const all = [...w.required, ...w.optional, ...w.distractors];
        expect(new Set(all).size, `${t.id} listed twice`).toBe(all.length);
        for (const s of w.required) expect(t.services, `${t.id} required ${s}`).toContain(s);
        expect(client.sources.map((s) => s.url), `${t.id} reference`).toContain(w.reference.url);
      }
      if (t.type === 'choose') expect(t.choose.options.filter((o) => o.correct).length, t.id).toBe(1);
      if (t.type === 'click') {
        expect(FLOWS.has(t.click.flow), t.id).toBe(true);
        expect(t.services, t.id).toContain(t.click.flow);
      }
      if (t.type === 'run') {
        expect(t.run.cli.startsWith('aws '), t.id).toBe(true);
        const ph = [...t.run.cli.matchAll(/<([a-z0-9-]+)>/g)].map((m) => m[1]);
        for (const m of t.run.output.matchAll(/\{\{([a-z0-9-]+)\}\}/g)) expect(ph, `${t.id} output {{${m[1]}}}`).toContain(m[1]);
        expect(t.run.verify, t.id).toEqual({ manual: true });
      }
      if (t.type === 'fix') {
        expect(t.fix.settings.length, t.id).toBeGreaterThanOrEqual(4);
        expect(t.fix.settings.length, t.id).toBeLessThanOrEqual(6);
        expect(t.fix.settings.some((s) => s.switchIt) && t.fix.settings.some((s) => !s.switchIt), t.id).toBe(true);
      }
      if (t.type === 'explain') expect(t.explain.keywords.length, t.id).toBeGreaterThanOrEqual(4);
      if (t.type === 'station') expect(STATION_KINDS, t.id).toContain(t.panel.kind);
    }
  });

  it('station panels follow their rules: bins used, pairs one-to-one, routes solvable and not pre-solved, rotations need all three, scales need scaling', () => {
    for (const { task: t } of ALL_TASKS) {
      if (t.type !== 'station') continue;
      const p = t.panel;
      if (p.kind === 'sort') {
        const bins = new Set(p.bins.map((x) => x.id));
        for (const i of p.items) expect(bins.has(i.bin), `${t.id} bin ${i.bin}`).toBe(true);
        for (const b of p.bins) expect(p.items.some((i) => i.bin === b.id), `${t.id} empty bin ${b.id}`).toBe(true);
      }
      if (p.kind === 'match') {
        const R = new Set(p.right.map((x) => x.id));
        for (const l of p.left) expect(R.has(p.pairs[l.id]), `${t.id} pair ${l.id}`).toBe(true);
        expect(new Set(Object.values(p.pairs)).size, t.id).toBe(p.left.length);
      }
      if (p.kind === 'route') {
        // Solvable: the flows fit on the healthy zones (first-fit decreasing).
        const free = p.targets.filter((x) => x.healthy).map((x) => x.capacity).sort((a, c) => c - a);
        for (const fl of [...p.flows].sort((a, c) => c.load - a.load)) {
          const i = free.findIndex((c) => c >= fl.load);
          expect(i, `${t.id} has no solution`).toBeGreaterThanOrEqual(0);
          free[i] -= fl.load;
        }
        expect(p.flows.some((fl) => !p.targets.find((x) => x.id === fl.start)!.healthy), `${t.id} starts solved`).toBe(true);
      }
      if (p.kind === 'rotate') {
        const want = p.items.map((x) => (x.ageDays > p.maxAgeDays ? (x.inUse ? 'rotate' : 'retire') : 'leave'));
        for (const a of ['rotate', 'retire', 'leave']) expect(want, `${t.id} has no ${a} card`).toContain(a);
      }
      if (p.kind === 'scale') {
        const need = p.slots.map((s) => Math.ceil(s.demand / p.perUnit));
        expect(Math.max(...need), t.id).toBeLessThanOrEqual(p.max);
        const cost = need.reduce((a, n) => a + Math.max(n, p.min) * p.costPerUnit, 0);
        expect(cost, `${t.id} needs more than its budget`).toBeLessThanOrEqual(p.budget);
        expect(p.budget - cost, `${t.id} too loose`).toBeLessThanOrEqual(3);
        expect(Math.max(...need) * p.slots.length * p.costPerUnit, `${t.id} solvable with one flat setting`).toBeGreaterThan(p.budget);
        expect(p.rules, t.id).toContain(`${p.budget} coins`);
        // Starting at the minimum doesn't already pass.
        expect(p.slots.some((s) => p.min * p.perUnit < s.demand), `${t.id} starts solved`).toBe(true);
      }
      if (p.kind === 'spot') expect(p.lines.some((l) => l.flag) && p.lines.some((l) => !l.flag), t.id).toBe(true);
      if (p.kind === 'order') expect(p.steps.length, t.id).toBeGreaterThanOrEqual(3);
      if (p.timed !== null) expect(p.timed, t.id).toBeGreaterThan(0);
    }
  });

  it('player text is plain: every acronym explained, no em or en dashes', () => {
    const lines = prose();
    expect(lines.length).toBeGreaterThan(500);
    const missing = lines.flatMap(([where, text]) => (text.match(ACRONYM) ?? []).filter((w) => !explained(w)).map((w) => `${w} (${where})`));
    expect(missing).toEqual([]);
    expect(lines.filter(([, text]) => /[—–]/.test(text)).map(([w]) => w)).toEqual([]);
  });

  it('only the airport is branded, and it has a generic name for a build with the brand off', () => {
    const air = CLIENTS.find((b) => b.id === 'airport')!;
    expect(air.brand).toBe('amazon-air');
    expect(branded(air, true)).toBe('Amazon Air Hub');
    expect(branded(air, false)).toBe(air.nameUnbranded);
    for (const b of CLIENTS.filter((x) => x.id !== 'airport')) expect(branded(b, false), b.id).toBe(b.name);
  });
});

const empty = (over: Partial<Progress> = {}): Progress => ({ version: 2, landmarks: {}, updatedAt: '2026-10-19T00:00:00.000Z', ...over });
const REGION = 'us-west-2';
/** Every service put up in this city. */
const everything = (over: Partial<Progress> = {}) =>
  empty({ cities: { [REGION]: { landmarks: Object.fromEntries(SERVICES.map((s) => [s.id, { discovered: true, xp: 1 }])) } }, landmarks: Object.fromEntries(SERVICES.map((s) => [s.id, { discovered: true, xp: 1 }])), ...over });

describe('City Clients rules', () => {
  const bank = CLIENTS.find((b) => b.id === 'bank')!;

  it('a task needs its services put up in this city first, and only the current level is open', () => {
    const t = bank.levels[0].tasks[0];
    expect(missingFor(empty(), t, REGION)).toEqual(t.services);
    expect(taskOpen(empty(), t.id, REGION)).toBe(false);
    expect(taskOpen(everything(), t.id, REGION)).toBe(true);
    // Level 2 waits for level 1.
    expect(taskOpen(everything(), bank.levels[1].tasks[0].id, REGION)).toBe(false);
  });

  it('one starter station is open from day one in every city, with nothing put up yet', () => {
    expect(STARTER_TASKS).toHaveLength(1);
    const [ref] = STARTER_TASKS;
    expect(ref.task.type).toBe('station');
    expect(ref.level.level).toBe(1);
    expect(missingFor(empty(), ref.task, REGION)).toEqual([]);
    expect(taskOpen(empty(), ref.task.id, REGION)).toBe(true);
    expect(taskOpen(empty(), ref.task.id, 'eu-west-1')).toBe(true);
  });

  it('pays a task once ever, and finishing a level pays its bonus, dates it and opens the next', () => {
    let p = everything();
    const lv = bank.levels[0];
    let bonus = 0;
    for (const [i, t] of lv.tasks.entries()) {
      const r = completeTask(p, t.id, '2026-10-19');
      expect(r.pay).toEqual(taskPay(t));
      p = { ...p, clients: { ...p.clients, bank: r.next } };
      expect(levelCount(p, bank, lv)).toEqual({ done: i + 1, of: lv.tasks.length });
      if (r.levelUp) bonus++;
      // Again: nothing.
      expect(completeTask(p, t.id, '2026-10-20').pay).toEqual({});
    }
    expect(bonus).toBe(1);
    expect(p.clients!.bank).toMatchObject({ level: 1, at: { '1': '2026-10-19' } });
    expect(currentLevel(p, bank)?.level).toBe(2);
    expect(Object.values(levelPay(lv)).every((n) => n >= 1)).toBe(true);
    // A later level's task can't be done early.
    expect(completeTask(everything(), bank.levels[2].tasks[0].id, '2026-10-19').pay).toEqual({});
  });

  it('pays every service of a task at least one star, about the task\'s stars in all', () => {
    for (const { task } of ALL_TASKS) {
      const pay = taskPay(task);
      expect(Object.keys(pay).sort(), task.id).toEqual([...task.services].sort());
      const total = Object.values(pay).reduce((a, b) => a + b, 0);
      expect(total, task.id).toBeGreaterThanOrEqual(Math.min(task.stars, task.services.length));
      expect(total, task.id).toBeLessThanOrEqual(task.stars + task.services.length);
    }
  });

  it('merges: the higher level, every task done in either copy, the earlier date', () => {
    const a = empty({ clients: { bank: { level: 1, done: ['bank-1-ledger'], at: { '1': '2026-10-19' } } } });
    const b = empty({ updatedAt: '2026-10-20T00:00:00.000Z', clients: { bank: { level: 0, done: ['bank-1-replica'] } } });
    expect(mergeProgress(a, b).clients).toEqual({ bank: { level: 1, done: ['bank-1-ledger', 'bank-1-replica'], at: { '1': '2026-10-19' } } });
  });
});

describe('where the businesses stand', () => {
  const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1', 'me-south-1', 'af-south-1', ...readdirSync('shared/city-maps').filter((f) => /^[a-z]{2}-[a-z]+-\d\.json$/.test(f)).map((f) => f.slice(0, -5))];
  const unique = [...new Set(REGIONS)];

  it.each(unique)('%s: every business has a site, none overlap, none on a landmark, a road or water', (code) => {
    const plan = cityPlanFor(code);
    const land = terrainFor(code, zonesFor(code), [], plan);
    const sites = clientSites(plan, land);
    expect(sites.map((s) => s.clientId).sort()).toEqual(CLIENTS.map((b) => b.id).filter((id) => id !== 'airport' || land.airport).sort());
    const taken = new Set<string>();
    for (const s of sites) {
      if (s.where !== 'airport') expect([s.rect.w, s.rect.h]).toEqual([lotSizeOf(s.clientId), lotSizeOf(s.clientId)]);
      const b = CLIENTS.find((x) => x.id === s.clientId)!;
      expect(Object.keys(s.stations).sort(), s.clientId).toEqual(stationsOf(b).sort());
      if (s.where === 'airport') continue;
      for (let y = s.rect.y; y < s.rect.y + s.rect.h; y++)
        for (let x = s.rect.x; x < s.rect.x + s.rect.w; x++) {
          const k = `${x},${y}`;
          expect(taken.has(k), `${code} ${s.clientId} overlaps at ${k}`).toBe(false);
          taken.add(k);
          expect(plan.isRoad({ x, y }), `${code} ${s.clientId} road ${k}`).toBe(false);
          expect(plan.isFootprint(x, y), `${code} ${s.clientId} landmark ${k}`).toBe(false);
          if (s.where === 'hood') {
            // A neighbourhood block, or the quiet back of a district block: never the square, the campus, the Day 1
            // Quarter or a future district's ground.
            const plot = plan.plotAt({ x, y });
            expect(plot === undefined || !(['square', 'campus', 'day1'].includes(plot) || plot.startsWith('future')), `${code} ${s.clientId} plot ${k}`).toBe(true);
            expect(plan.isWater?.(x, y) ?? false).toBe(false);
          } else {
            expect(['land', 'field', 'forest', 'beach']).toContain(land.kind(x, y));
            expect(land.props.some((p) => p.x < x + 1 && p.x + p.w > x && p.y < y + 1 && p.y + p.h > y), `${code} ${s.clientId} prop on ${k}`).toBe(false);
          }
        }
    }
  });

  it('the classic city has no neighbourhoods: every business but the airport stands on the ring', () => {
    const plan = legacyPlan();
    expect(hoodLots(plan)).toEqual([]);
    const land = terrainFor('us-west-2', zonesFor('us-west-2'), [], plan);
    expect(land.clientLots).toHaveLength(LOT_CLIENTS.length);
    expect(clientSites(plan, land).filter((s) => s.where === 'ring')).toHaveLength(LOT_CLIENTS.length);
  });

  it('a real map puts businesses on its neighbourhoods first, with a walkable station beside each lot', () => {
    const real = unique.map((r) => cityPlanFor(r)).find((p) => p.kind === 'osm' && hoodLots(p).length > 0);
    expect(real).toBeTruthy();
    const sites = clientSites(real!, {});
    const hood = sites.filter((s) => s.where === 'hood');
    expect(hood.length).toBeGreaterThan(0);
    for (const s of hood)
      for (const t of Object.values(s.stations)) {
        const inside = t.x >= s.rect.x && t.x < s.rect.x + s.rect.w && t.y >= s.rect.y && t.y < s.rect.y + s.rect.h;
        expect(inside, `${s.clientId} station inside its lot`).toBe(false);
        expect(real!.isWater?.(t.x, t.y) ?? false).toBe(false);
      }
  });

  it('every real city stands wave 1 inside the core (us-west-2 included), fills the core before the ring, and places all 18', () => {
    for (const code of unique) {
      const plan = cityPlanFor(code);
      if (plan.kind !== 'osm') continue;
      const land = terrainFor(code, zonesFor(code), [], plan);
      const sites = clientSites(plan, land);
      expect(sites, code).toHaveLength(CLIENTS.length);
      const ring = sites.filter((s) => s.where === 'ring').map((s) => s.clientId);
      expect(ring.filter((id) => waveOf(id) === 1), code).toEqual([]);
      // The ring takes only what the core can't: one lot each, and no more.
      expect(land.clientLots, code).toHaveLength(ringLotsNeeded(plan));
      expect(ring.length + hoodLots(plan).length, code).toBe(LOT_CLIENTS.length);
    }
  });

  it('is the same every time (no random draws)', () => {
    const plan = cityPlanFor('eu-west-1');
    const a = clientSites(plan, terrainFor('eu-west-1', zonesFor('eu-west-1'), [], plan));
    const b = clientSites(plan, terrainFor('eu-west-1', zonesFor('eu-west-1'), [], plan));
    expect(a).toEqual(b);
  });
});

describe('Run it jobs in the practice terminal', () => {
  it('every run job\'s own command, its names filled in, runs clean (no taught mistake trips on the right answer)', () => {
    const bad = ALL_TASKS.flatMap(({ task }) => {
      if (task.type !== 'run') return [];
      const line = task.run.cli.replace(/<([a-z0-9-]+)>/g, (_, n: string) => `my-${n}`);
      const r = run(line, task.run);
      return r.kind === 'ok' ? [] : [`${task.id}: ${'output' in r ? r.output : r.kind}`];
    });
    expect(bad).toEqual([]);
  });
});

describe('Wire it jobs on the architecture board', () => {
  it('every wire job lays out as a small puzzle that passes with its required services in place, and not without', () => {
    for (const { task } of ALL_TASKS) {
      if (task.type !== 'wire') continue;
      const p = puzzleForJob(task);
      const slots = slotsOf(p);
      expect(slots.filter((s) => s.required).map((s) => s.service).sort(), task.id).toEqual([...new Set(task.wire.required)].sort());
      const full = Object.fromEntries(slots.filter((s) => s.required).map((s) => [s.id, s.service]));
      expect(scoreDiagram(p, { placements: full, distractorDrops: [], misdrops: 0 }).passed, task.id).toBe(true);
      expect(scoreDiagram(p, { placements: {}, distractorDrops: [], misdrops: 0 }).passed, task.id).toBe(false);
      for (const d of task.wire.distractors) expect(p.diagram!.rejects[d], `${task.id} ${d}`).toBeTruthy();
    }
  });
});

describe('the airport grows with its side jobs', () => {
  it('the hub\'s level 1 opens the terminal and level 2 the cargo hangar, whatever else is built', () => {
    const [terminal, hangar] = STAGES;
    const p = (level: number) => empty({ clients: { airport: { level, done: [] } } });
    expect([stageOpen(p(0), terminal), stageOpen(p(0), hangar)]).toEqual([false, false]);
    expect([stageOpen(p(1), terminal), stageOpen(p(1), hangar)]).toEqual([true, false]);
    expect([stageOpen(p(2), terminal), stageOpen(p(2), hangar)]).toEqual([true, true]);
  });
});
