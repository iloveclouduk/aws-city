// City Clients' station panels (src/learning/stations/): each mechanic's pure rules, played by a scripted player, and
// every station in shared/clients.json proven solvable (and not already solved when dealt).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { match, order, rotate, route, scale, solve, sort, spot, stationSummary, STATION_KINDS, type MatchPanel, type OrderPanel, type RotatePanel, type RoutePanel, type ScalePanel, type SortPanel, type SpotPanel, type StationPanel } from '@/learning/stations';
import { shuffledIndices, unsolvedOrder } from '@/learning/stations/shared';

const SORT: SortPanel = {
  kind: 'sort',
  rules: 'Drag each card into one bin. Pass with every card sorted and at most 1 mistake. No clock.',
  timed: null,
  bins: [
    { id: 'kinesis', label: 'Kinesis stream (live, many readers)' },
    { id: 'dynamodb', label: 'DynamoDB table (find one thing fast)' },
    { id: 's3', label: 'S3 bucket (keep lots, cheaply)' },
  ],
  items: [
    { text: 'Bag scanners beep thousands of times a minute', bin: 'kinesis', hint: 'A never-ending flow of small events is a stream.' },
    { text: 'Where is parcel 48213 right now?', bin: 'dynamodb', hint: 'One item, found by its key, in a blink.' },
    { text: "Last year's flight logs, kept for reports", bin: 's3', hint: 'Big, old and rarely read: cheap storage.' },
    { text: 'Plane positions every few seconds', bin: 'kinesis', hint: 'Live updates that several systems read at once.' },
  ],
  pass: { maxMistakes: 1 },
};
const MATCH: MatchPanel = {
  kind: 'match',
  rules: 'Tap a thing, then the home it belongs in. Pass with at most 1 mistake. No clock.',
  timed: null,
  left: [
    { id: 'homework', text: 'Homework files every server must see' },
    { id: 'grades', text: "Pupils' grades in tidy rows" },
    { id: 'password', text: 'The database password' },
  ],
  right: [
    { id: 'efs', text: 'EFS Shared Well' },
    { id: 'aurora', text: 'Aurora Observatory' },
    { id: 'secretsmanager', text: 'Secrets Manager Strongroom' },
  ],
  pairs: { homework: 'efs', grades: 'aurora', password: 'secretsmanager' },
  pass: { maxMistakes: 1 },
};
const ROUTE: RoutePanel = {
  kind: 'route',
  rules: 'Tap an arrow, then a zone, to move it. 45 seconds.',
  timed: 45,
  targets: [
    { id: 'az-a', label: 'Zone A', healthy: true, capacity: 5 },
    { id: 'az-b', label: 'Zone B', healthy: false, capacity: 5 },
    { id: 'az-c', label: 'Zone C', healthy: true, capacity: 4 },
  ],
  flows: [
    { id: 'gate-events', label: 'Gate changes', load: 2, start: 'az-b' },
    { id: 'parcel-api', label: 'Parcel lookups', load: 3, start: 'az-b' },
    { id: 'unload-jobs', label: 'Unloading jobs', load: 2, start: 'az-a' },
    { id: 'dashboards', label: 'Crew dashboards', load: 1, start: 'az-c' },
  ],
  pass: { noUnhealthy: true, noOverCapacity: true },
};
const ROTATE: RotatePanel = {
  kind: 'rotate',
  rules: 'Rotate, Retire or Leave each one. 60 seconds.',
  timed: 60,
  maxAgeDays: 90,
  items: [
    { id: 'weather', label: 'Weather feed password', ageDays: 140, inUse: true },
    { id: 'fuel', label: 'Old fuel supplier login', ageDays: 400, inUse: false },
    { id: 'parcel-db', label: 'Parcel database password', ageDays: 30, inUse: true },
    { id: 'radar', label: 'Plane position feed key', ageDays: 91, inUse: true },
  ],
  pass: { maxMistakes: 1 },
};
const SCALE: ScalePanel = {
  kind: 'scale',
  rules: 'Set how many servers run each day. Pass within 22 coins. No clock.',
  timed: null,
  unit: 'servers',
  perUnit: 200,
  costPerUnit: 1,
  budget: 22,
  min: 1,
  max: 8,
  slots: [
    { label: 'Saturday', demand: 120 },
    { label: 'Monday (exam)', demand: 700 },
    { label: 'Tuesday (exam)', demand: 650 },
    { label: 'Wednesday', demand: 300 },
    { label: 'Thursday (results)', demand: 1400 },
    { label: 'Friday', demand: 400 },
    { label: 'Sunday', demand: 90 },
  ],
  pass: { meetDemand: true, withinBudget: true },
};
const SPOT: SpotPanel = {
  kind: 'spot',
  rules: 'Tap every line that needs a closer look. No clock.',
  timed: null,
  lines: [
    { text: '09:02 app-role read item from table accounts', flag: false, hint: 'The app reading its own table is normal.' },
    { text: '09:14 root user signed in to the console', flag: true, hint: "The root user shouldn't be used for daily work." },
    { text: '09:20 alice StopLogging on trail bank-trail', flag: true, hint: 'Turning off the record hides what happens next.' },
    { text: '10:03 backup-role started backup of ledger', flag: false, hint: 'Backups on schedule are good news.' },
  ],
  pass: { missed: 0, maxWrongTaps: 1 },
};
const ORDER: OrderPanel = {
  kind: 'order',
  rules: 'Put the steps in order. Pass within 3 checks. No clock.',
  timed: null,
  steps: ['A scanned form is uploaded', 'The upload starts a Lambda function', 'Textract reads the words', 'The text is saved'],
  pass: { maxChecks: 3 },
};

describe('seeded deals', () => {
  it('shuffles the same way for the same seed, and an order deal is never already right', () => {
    expect(shuffledIndices(6, 7)).toEqual(shuffledIndices(6, 7));
    expect([...shuffledIndices(6, 7)].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (let seed = 0; seed < 200; seed++) expect(unsolvedOrder(4, seed)).not.toEqual([0, 1, 2, 3]);
  });
  it('names every kind', () => {
    for (const k of STATION_KINDS) expect(stationSummary(k)).toMatch(/^[A-Z][a-z]+$/);
    expect(stationSummary('route')).toBe('Reroute');
  });
});

describe('sort', () => {
  it('lands a right drop, bounces a wrong one with its hint, and passes within the mistakes allowed', () => {
    let s = sort.deal(SORT, 3);
    const first = sort.current(s)!;
    const wrongBin = SORT.bins.find((b) => b.id !== first.bin)!.id;
    s = sort.step(s, { type: 'drop', bin: wrongBin });
    expect(s).toMatchObject({ at: 0, mistakes: 1, hint: first.hint });
    while (sort.current(s)) s = sort.step(s, { type: 'drop', bin: sort.current(s)!.bin });
    expect(sort.passed(s)).toBe(true);
  });
  it('fails on one mistake too many, or when time runs out', () => {
    let s = sort.deal(SORT, 3);
    const wrong = () => SORT.bins.find((b) => b.id !== sort.current(s)!.bin)!.id;
    s = sort.step(s, { type: 'drop', bin: wrong() });
    s = sort.step(s, { type: 'drop', bin: wrong() });
    expect(sort.failed(s)).toBe(true);
    expect(sort.failed(sort.step(sort.deal(SORT, 1), { type: 'timeUp' }))).toBe(true);
  });
});

describe('match', () => {
  it('locks a right pair, shakes a wrong one, and uses each right card once', () => {
    let s = match.deal(MATCH, 2);
    s = match.step(match.step(s, { type: 'left', id: 'homework' }), { type: 'right', id: 'efs' });
    expect(s.matched).toEqual({ homework: 'efs' });
    s = match.step(match.step(s, { type: 'left', id: 'grades' }), { type: 'right', id: 'efs' });
    expect(s.mistakes).toBe(0); // efs is taken: ignored, still picked
    s = match.step(s, { type: 'right', id: 'secretsmanager' });
    expect(s).toMatchObject({ mistakes: 1, wrong: { left: 'grades', right: 'secretsmanager' } });
    s = match.step(match.step(s, { type: 'left', id: 'grades' }), { type: 'right', id: 'aurora' });
    s = match.step(match.step(s, { type: 'left', id: 'password' }), { type: 'right', id: 'secretsmanager' });
    expect(match.passed(s)).toBe(true);
  });
  it('fails past the mistakes allowed', () => {
    let s = match.deal(MATCH, 2);
    for (let i = 0; i < 2; i++) s = match.step(match.step(s, { type: 'left', id: 'homework' }), { type: 'right', id: 'aurora' });
    expect(match.failed(s)).toBe(true);
  });
});

describe('route', () => {
  it('starts unsolved, moves a flow by tapping it then a zone, and passes with nothing dark or over capacity', () => {
    let s = route.deal(ROUTE);
    expect(route.passed(s)).toBe(false);
    expect(route.problems(s).dark.sort()).toEqual(['gate-events', 'parcel-api']);
    s = route.step(route.step(s, { type: 'flow', id: 'parcel-api' }), { type: 'target', id: 'az-c' });
    expect(route.loads(s)['az-c']).toBe(4);
    s = route.step(route.step(s, { type: 'flow', id: 'gate-events' }), { type: 'target', id: 'az-a' });
    expect(route.passed(s)).toBe(true);
  });
  it('flags a zone over capacity, and only the clock fails it', () => {
    let s = route.deal(ROUTE);
    s = route.step(route.step(s, { type: 'flow', id: 'parcel-api' }), { type: 'target', id: 'az-a' });
    s = route.step(route.step(s, { type: 'flow', id: 'gate-events' }), { type: 'target', id: 'az-a' });
    expect(route.problems(s).over).toEqual(['az-a']);
    expect(route.failed(s)).toBe(false);
    expect(route.failed(route.step(s, { type: 'timeUp' }))).toBe(true);
  });
});

describe('rotate', () => {
  it('rotates old keys in use, retires old unused ones, leaves the rest', () => {
    expect(ROTATE.items.map((x) => rotate.rightChoice(ROTATE, x))).toEqual(['rotate', 'retire', 'leave', 'rotate']);
    let s = rotate.deal(ROTATE, 4);
    s = rotate.step(s, { type: 'pick', id: 'weather', choice: 'leave' });
    expect(s.answers.weather).toEqual({ picked: 'leave', right: 'rotate' });
    expect(rotate.step(s, { type: 'pick', id: 'weather', choice: 'rotate' })).toBe(s); // answered once
    for (const it of ROTATE.items.slice(1)) s = rotate.step(s, { type: 'pick', id: it.id, choice: rotate.rightChoice(ROTATE, it) });
    expect(rotate.passed(s)).toBe(true);
  });
  it('fails past the mistakes allowed', () => {
    let s = rotate.deal(ROTATE, 4);
    s = rotate.step(s, { type: 'pick', id: 'weather', choice: 'leave' });
    s = rotate.step(s, { type: 'pick', id: 'fuel', choice: 'leave' });
    expect(rotate.failed(s)).toBe(true);
  });
});

describe('scale', () => {
  it('starts every slot at min (not passing), steps within min..max, and passes when demand and budget are met', () => {
    let s = scale.deal(SCALE);
    expect(s.units.every((u) => u === SCALE.min)).toBe(true);
    expect(scale.passed(s)).toBe(false);
    expect(scale.step(s, { type: 'dec', slot: 0 }).units[0]).toBe(1);
    s = scale.step(s, { type: 'set', slot: 4, units: 99 });
    expect(s.units[4]).toBe(8);
    // One flat setting that covers the busiest day is over budget.
    let flat = scale.deal(SCALE);
    SCALE.slots.forEach((_, i) => (flat = scale.step(flat, { type: 'set', slot: i, units: 7 })));
    expect(scale.cost(flat)).toBeGreaterThan(SCALE.budget);
    expect(scale.passed(flat)).toBe(false);
    expect(solve(SCALE)).toBe(true);
  });
});

describe('spot', () => {
  it('marks flagged lines, counts a wrong tap with its hint, and passes on Done with nothing missed', () => {
    let s = spot.deal(SPOT);
    s = spot.step(s, { type: 'tap', line: 0 });
    expect(s).toMatchObject({ wrongTaps: 1, wrong: 0 });
    s = spot.step(spot.step(s, { type: 'tap', line: 1 }), { type: 'tap', line: 2 });
    expect(spot.missed(s)).toBe(0);
    expect(spot.passed(spot.step(s, { type: 'done' }))).toBe(true);
  });
  it('fails on Done with a flagged line missed, or past the wrong taps allowed', () => {
    const s = spot.step(spot.deal(SPOT), { type: 'tap', line: 1 });
    expect(spot.failed(spot.step(s, { type: 'done' }))).toBe(true);
    expect(spot.failed(spot.step(spot.step(s, { type: 'tap', line: 0 }), { type: 'tap', line: 3 }))).toBe(true);
  });
});

describe('order', () => {
  it('counts the steps in the right place on each check, and passes when all are right', () => {
    let s = order.deal(ORDER, 5);
    s = order.step(s, { type: 'check' });
    expect(s.checks).toBe(1);
    expect(s.lastRight).toBe(order.rightPlaces(s));
    expect(order.step(s, { type: 'check' }).checks).toBe(1); // the same order again costs nothing
    for (let want = 0; want < ORDER.steps.length; want++) s = order.step(s, { type: 'move', from: s.order.indexOf(want), to: want });
    expect(order.passed(order.step(s, { type: 'check' }))).toBe(true);
  });
  it('fails when the checks run out', () => {
    let s = order.deal(ORDER, 5);
    for (let i = 0; i < 3; i++) {
      s = order.step(s, { type: 'move', from: 0, to: 1 });
      if (order.rightPlaces(s) === ORDER.steps.length) s = order.step(s, { type: 'move', from: 0, to: 1 });
      s = order.step(s, { type: 'check' });
    }
    expect(order.failed(s)).toBe(true);
  });
});

describe('every station in shared/clients.json', () => {
  const file = 'shared/clients.json';
  type Task = { id: string; type: string; panel?: StationPanel };
  const panels: [string, StationPanel][] = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as { businesses: { levels: { tasks: Task[] }[] }[] }).businesses.flatMap((b) =>
        b.levels.flatMap((l) => l.tasks.filter((t) => t.type === 'station' && t.panel).map((t) => [t.id, t.panel!] as [string, StationPanel])),
      )
    : [];

  it.runIf(panels.length > 0)('can be passed by a perfect player', () => {
    for (const [id, p] of panels) expect(solve(p), id).toBe(true);
  });

  it.runIf(panels.length > 0)("doesn't pass as dealt (route and scale), and fails when the clock runs out", () => {
    for (const [id, p] of panels) {
      if (p.kind === 'route') expect(route.passed(route.deal(p)), id).toBe(false);
      if (p.kind === 'scale') expect(scale.passed(scale.deal(p)), id).toBe(false);
      if (p.kind === 'sort') expect(sort.failed(sort.step(sort.deal(p, 1), { type: 'timeUp' })), id).toBe(true);
      if (p.kind === 'route') expect(route.failed(route.step(route.deal(p), { type: 'timeUp' })), id).toBe(true);
    }
  });
});
