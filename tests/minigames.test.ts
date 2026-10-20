import { describe, expect, it } from 'vitest';
import { deal, DNS_QUESTIONS, FISH, SHIELD, tierFor } from '@/world/minigames';
import { mixCatch } from '@/game/scenes/games/fishDeck';
import { invokeChef, newChef, STALL } from '@/game/scenes/games/foodStall';
import { freeLane } from '@/game/scenes/games/lanes';
import { addServer, arrivals, demandAt, newRush, phaseAt, removeServer, RUSH, RUSH_LESSON, rushStars, rushVerdict, serverCount, tick } from '@/game/scenes/games/rushHour';
import { drain, isHot, KEYS, nextParcel, send, shelfFor, SHELVES, SORT, SORT_LESSON, sortPoints, sortStars } from '@/game/scenes/games/sorting';
import { PLACES } from '@/world/places';
import { EDGE, IAM_GATE, QUEUE, REDTEAM } from '@/world/minigames';
import { accuracyGate, FEEDBACK, gatedStars, gateLine, minAccuracy, PILL, POINTS, scoreRun, SWING, swingReady, VERDICT_MS, type Cue } from '@/game/scenes/games/scoring';
import { change, EDGE_RULES, expire, hitRatio, invalidate, isChanged, isPopular, newEdge, request, store } from '@/game/scenes/games/edgeCache';

describe('mini-game pools (shared/minigames.json)', () => {
  it('are big enough not to repeat after one play, with every tier filled', () => {
    for (const pool of [FISH, DNS_QUESTIONS]) {
      expect(pool.length).toBeGreaterThanOrEqual(30);
      for (const t of [1, 2, 3]) expect(pool.filter((x) => x.tier === t).length, `tier ${t}`).toBeGreaterThanOrEqual(8);
    }
    expect(SHIELD.attacks.length).toBeGreaterThanOrEqual(15);
    expect(SHIELD.good.length).toBeGreaterThanOrEqual(10);
  });

  it('every item is well-formed: a real answer, a reason, no duplicates', () => {
    for (const f of FISH) {
      expect(['standard', 'ia', 'glacier']).toContain(f.answer);
      expect(f.why.length, f.name).toBeGreaterThan(15);
    }
    expect(new Set(FISH.map((f) => f.name)).size).toBe(FISH.length);
    for (const q of DNS_QUESTIONS) {
      expect(q.options, q.q).toContain(q.answer);
      expect(new Set(q.options).size, q.q).toBe(q.options.length);
      expect(q.options.length, q.q).toBe(4);
      expect(q.why.length, q.q).toBeGreaterThan(15);
    }
    expect(new Set(DNS_QUESTIONS.map((q) => q.q)).size).toBe(DNS_QUESTIONS.length);
    for (const a of SHIELD.attacks) expect(SHIELD.rules[a.rule], a.label).toBeTruthy();
    // A real user's request must never look like an attack's label.
    for (const g of SHIELD.good) expect(SHIELD.attacks.some((a) => a.label === g)).toBe(false);
  });

  it('deals a round from the tiers reached, at least half from the top one, never repeating', () => {
    expect([0, 1, 2, 4, 5, 20].map(tierFor)).toEqual([1, 1, 2, 2, 3, 3]);
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const plays of [0, 3, 9]) {
      const round = deal(DNS_QUESTIONS, plays, 8, rand);
      expect(round).toHaveLength(8);
      expect(new Set(round).size).toBe(8);
      const top = tierFor(plays);
      expect(round.every((q) => q.tier <= top)).toBe(true);
      expect(round.filter((q) => q.tier === top).length).toBeGreaterThanOrEqual(4);
    }
    expect(deal(FISH, 0, 5, rand).every((f) => f.tier === 1)).toBe(true);
  });

  it('S3 Lake deals a mix of storage classes: at most two of a kind, in the tiers dealt, never repeating', () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const hard = FISH.filter((f) => f.tier >= 2);
    for (let i = 0; i < 200; i++) {
      for (const [pool, plays] of [[FISH, 0], [FISH, 3], [FISH, 9], [hard, 99]] as const) {
        const dealt = deal([...pool], plays, 5, rand);
        const round = mixCatch(dealt, pool, 2, rand);
        expect(round).toHaveLength(5);
        expect(new Set(round).size).toBe(5);
        for (const c of ['standard', 'ia', 'glacier']) expect(round.filter((f) => f.answer === c).length, c).toBeLessThanOrEqual(2);
        const tiers = dealt.map((f) => f.tier);
        expect(round.every((f) => f.tier >= Math.min(...tiers) && f.tier <= Math.max(...tiers))).toBe(true);
      }
    }
  });
});

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('EC2 Rush Hour rules', () => {
  /** Plays a whole day, keeping `want(t)` servers on. */
  const play = (want: (t: number) => number, rand = seeded()) => {
    const s = newRush();
    let points = 0;
    for (let t = 0; t < RUSH.seconds; t++) {
      while (serverCount(s) < want(t) && addServer(s));
      while (serverCount(s) > want(t) && removeServer(s));
      points += tick(s, arrivals(t, rand)).points;
    }
    return { s, points };
  };

  it('has a quiet morning, a lunch rush and a calm evening', () => {
    expect([0, 17, 18, 35, 36, 53].map(phaseAt)).toEqual(['morning', 'morning', 'lunch', 'lunch', 'evening', 'evening']);
    expect(Math.max(...[0, 5, 10, 17].map(demandAt))).toBeLessThan(Math.min(...[20, 27, 33].map(demandAt)));
    expect(demandAt(27)).toBeCloseTo(6);
    expect(Math.max(...[40, 45, 53].map(demandAt))).toBeLessThan(demandAt(27));
  });

  it('a new server boots before it serves; servers stay between the minimum and maximum', () => {
    const s = newRush();
    expect(removeServer(s)).toBe(false);
    addServer(s);
    expect(s.ready).toBe(1);
    tick(s, 0);
    expect(s.ready).toBe(1); // still starting
    tick(s, 0);
    expect(s.ready).toBe(2);
    while (addServer(s));
    expect(serverCount(s)).toBe(RUSH.maxServers);
  });

  it('serves the line, counts idle servers and long lines', () => {
    const s = newRush();
    s.ready = 3;
    expect(tick(s, 1)).toMatchObject({ served: 1, idle: 2, long: false, points: RUSH.servedPts - 2 * RUSH.idleCost });
    s.ready = 1;
    const r = tick(s, RUSH.longQueue + 1);
    expect(r.long).toBe(true);
    expect(s.queue).toBe(RUSH.longQueue);
    expect(s.stats).toMatchObject({ served: 2, idleS: 2, longQueueS: 1 });
  });

  it('three stars for scaling with the crowd; too many servers or too few lose a star', () => {
    // A player who checks every five seconds and scales a little ahead of the crowd.
    for (const seed of [1, 7, 42]) {
      const good = play((t) => Math.ceil(demandAt(t - (t % 5) + 4)), seeded(seed));
      expect(rushStars(good.s.stats), `seed ${seed}`).toBe(3);
      expect(rushVerdict(good.s.stats)).toBe('Perfect scaling!');
    }
    const always8 = play(() => RUSH.maxServers);
    expect(always8.s.stats.longQueueS).toBe(0);
    expect(rushStars(always8.s.stats)).toBe(2);
    expect(rushVerdict(always8.s.stats)).toMatch(/idle/);
    const always1 = play(() => 1);
    expect(always1.s.stats.idleS).toBe(0);
    expect(rushStars(always1.s.stats)).toBe(2);
    expect(rushVerdict(always1.s.stats)).toMatch(/long/);
    expect(play((t) => Math.ceil(demandAt(t - (t % 5) + 4))).points).toBeGreaterThan(Math.max(always8.points, always1.points));
  });

  it('sensible scaling, a step behind the crowd as a person plays, scores clearly above zero; doing nothing scores less', () => {
    for (const seed of [1, 7, 42]) {
      // Every three seconds: one more server when three or more wait, one fewer when one sat idle.
      const s = newRush();
      const rand = seeded(seed);
      let points = 0;
      let idle = 0;
      for (let t = 0; t < RUSH.seconds; t++) {
        if (t % 3 === 0) {
          if (s.queue >= 3) addServer(s);
          else if (idle >= 1) removeServer(s);
        }
        const r = tick(s, arrivals(t, rand));
        idle = r.idle;
        points += r.points;
      }
      expect(points, `seed ${seed}`).toBeGreaterThan(100);
      expect(play(() => 1, seeded(seed)).points, `seed ${seed}`).toBeLessThan(0);
      expect(play(() => 1, seeded(seed)).points).toBeLessThan(points);
    }
  });

  it('ends on the Auto Scaling lesson', () => {
    expect(RUSH_LESSON).toMatch(/adds servers when it’s busy and removes them when it’s quiet/);
  });
});

describe('DynamoDB Sorting Office rules', () => {
  it('every key lives on exactly one shelf, and the same key always goes to the same shelf', () => {
    expect(new Set(KEYS).size).toBe(KEYS.length);
    for (const key of KEYS) {
      expect(SHELVES.filter((s) => s.includes(key))).toHaveLength(1);
      expect(shelfFor({ key })).toBe(shelfFor({ key }));
    }
    expect(KEYS).toContain(SORT.hotKey);
    // A spread key carries its shelf number.
    expect([1, 2, 3, 4].map((part) => shelfFor({ key: SORT.hotKey, part }))).toEqual([0, 1, 2, 3]);
  });

  it('the hot moment floods one key onto one shelf until the keys are spread', () => {
    expect([SORT.hotFrom - 1, SORT.hotFrom, SORT.hotTo - 1, SORT.hotTo].map(isHot)).toEqual([false, true, true, false]);
    const rand = seeded(3);
    const shelfLoad = (spread: boolean) => {
      const n = [0, 0, 0, 0];
      for (let i = 0; i < 400; i++) n[shelfFor(nextParcel(SORT.hotFrom + 1, spread, rand))]++;
      return Math.max(...n) / 400;
    };
    expect(shelfLoad(false)).toBeGreaterThan(0.6);
    expect(shelfLoad(true)).toBeLessThan(0.4);
    // Outside the hot moment, keys are spread already and never carry a number.
    for (let i = 0; i < 100; i++) expect(nextParcel(2, false, rand).part).toBeUndefined();
  });

  it('a busy shelf throttles until it has put parcels away', () => {
    let loads = [0, 0, 0, 0];
    for (let i = 0; i < SORT.shelfCap; i++) expect(send(loads, 0)).toBe('ok');
    expect(send(loads, 0)).toBe('busy');
    expect(send(loads, 1)).toBe('ok'); // other shelves are fine
    loads = drain(loads, 1 / SORT.drainPerS);
    expect(send(loads, 0)).toBe('ok');
    expect(drain([0.1], 10)).toEqual([0]);
  });

  it('scores quick sorts higher; stars for spreading keys and careful sorting', () => {
    expect(sortPoints(500)).toBeGreaterThan(sortPoints(SORT.quickMs + 1));
    const base = { sorted: 30, wrong: 0, throttled: 0, dropped: 0, spread: true };
    expect(sortStars(base)).toBe(3);
    expect(sortStars({ ...base, spread: false })).toBe(2);
    expect(sortStars({ ...base, wrong: 5 })).toBe(2);
    expect(sortStars({ ...base, spread: false, dropped: 5 })).toBe(1);
    expect(SORT_LESSON).toMatch(/by their key/);
  });
});

describe('mini-game registration', () => {
  it('EC2 and DynamoDB landmarks are playable', () => {
    expect(PLACES.find((p) => p.serviceId === 'ec2')?.game).toBe('ec2');
    expect(PLACES.find((p) => p.serviceId === 'dynamodb')?.game).toBe('dynamodb');
  });
});

describe('mashing must not win (src/game/scenes/games/scoring.ts)', () => {
  type Step = { n: number; cue: Cue };
  /** A round's score and accuracy from its calls: [points, cue, right?] in order. */
  const tally = (game: string, calls: [number, Cue, boolean | undefined][]) => {
    const steps: Step[] = calls.map(([n, cue]) => ({ n, cue }));
    const right = calls.filter((c) => c[2] === true).length;
    const wrong = calls.filter((c) => c[2] === false).length;
    return { score: scoreRun(steps), gate: accuracyGate(game, right, wrong) };
  };

  it('every game with calls has a floor, and a wrong call costs more than a right one pays', () => {
    for (const g of ['iamgate', 'redteam', 'queue', 'edge', 'shield', 'lambda', 'dynamodb']) expect(minAccuracy(g), g).toBeGreaterThan(0);
    expect(minAccuracy('route53')).toBe(0);
    expect(-POINTS.shield.blockedUser).toBeGreaterThan(POINTS.shield.passed);
    expect(SWING.blank).toBeLessThan(0);
    expect(-POINTS.iamgate.wrong).toBeGreaterThan(POINTS.iamgate.right);
    expect(-POINTS.redteam.falseFlag).toBeGreaterThan(POINTS.redteam.flag);
    expect(-POINTS.queue.wrong).toBeGreaterThan(POINTS.queue.dlq);
    expect(-EDGE_RULES.wrongInvalidate).toBeGreaterThan(EDGE_RULES.invalidate);
  });

  it('below the floor: no new best, a third of the stars, and the card says why', () => {
    const low = accuracyGate('iamgate', 4, 6);
    expect(low).toEqual({ ok: false, pct: 40, need: minAccuracy('iamgate') });
    expect(gatedStars(12, low)).toBe(4);
    expect(gateLine(low)).toBe(`Too many wrong calls: accuracy 40%, need ${minAccuracy('iamgate')}%`);
    expect(gatedStars(12, accuracyGate('iamgate', 9, 1))).toBe(12);
    expect(accuracyGate('iamgate', 0, 0).ok).toBe(true);
  });

  it('Permission Gate: always pressing Deny scores below an honest player and misses the floor', () => {
    const reqs = Array.from({ length: 3 }, () => IAM_GATE.waves.flatMap((w) => w.requests)).flat();
    const play = (pick: (allow: boolean) => boolean) =>
      tally(
        'iamgate',
        reqs.map((r) => (pick(r.allow) === r.allow ? [POINTS.iamgate.right, 'player', true] : [POINTS.iamgate.wrong, 'player', false])),
      );
    const deny = play(() => false);
    const honest = play((a) => a);
    expect(deny.gate.ok).toBe(false);
    expect(honest.gate.ok).toBe(true);
    expect(deny.score).toBeLessThan(honest.score / 4);
  });

  it('Red Team Range: flagging every request scores below an honest player and misses the floor', () => {
    const rand = seeded(5);
    for (const tier of [1, 2, 3]) {
      const pool = REDTEAM.requests.filter((r) => r.tier <= tier);
      const round = Array.from({ length: 30 }, () => pool[Math.floor(rand() * pool.length)]);
      const play = (flags: (flawed: boolean) => boolean) =>
        tally(
          'redteam',
          round.map((r) => {
            const flawed = !!r.flaw;
            if (flags(flawed)) return flawed ? [POINTS.redteam.flag, 'player', true] : [POINTS.redteam.falseFlag, 'player', false];
            return flawed ? [POINTS.redteam.missed, 'soft', false] : [POINTS.redteam.passed, 'none', true];
          }),
        );
      const all = play(() => true);
      const honest = play((f) => f);
      expect(all.gate.ok, `tier ${tier}`).toBe(false);
      expect(honest.gate.ok).toBe(true);
      expect(all.score, `tier ${tier}`).toBeLessThan(honest.score / 2);
    }
  });

  it('Queue Juggler: clicking every message (poison into the queue) scores below an honest player and misses the floor', () => {
    const rand = seeded(9);
    // As the game deals them: poison 15% rising to 25%.
    const msgs = Array.from({ length: 60 }, (_, i) => rand() < 0.15 + Math.min(0.1, i * 0.004));
    expect(QUEUE.poison.length).toBeGreaterThan(0);
    const play = (dlqPoison: boolean) =>
      tally(
        'queue',
        msgs.flatMap((poison): [number, Cue, boolean | undefined][] => {
          if (!poison) return [[0, 'player', true], [POINTS.queue.worked, 'none', undefined]];
          return dlqPoison ? [[POINTS.queue.dlq, 'player', true]] : [[POINTS.queue.wrong, 'player', false]];
        }),
      );
    const masher = play(false);
    const honest = play(true);
    expect(masher.gate.ok).toBe(false);
    expect(honest.gate.ok).toBe(true);
    expect(masher.score).toBeLessThan(honest.score / 2);
  });

  /** Space pressed every 100 ms for the whole round (holding or mashing it), from `from` ms. */
  const mash = (now: number) => now % 100 === 0;

  it('Shield Wall: mashing Space scores below an honest player and misses the floor', () => {
    for (const seed of [1, 7, 42]) {
      const rand = seeded(seed);
      // A road item every 700 ms (40% real users, 20% floods, 40% L7 attacks); it reaches the wall 6 s later.
      const play = (space: boolean) => {
        const road: { kind: 'good' | 'flood' | 'l7'; at: number; reactAt: number }[] = [];
        const calls: [number, Cue, boolean | undefined][] = [];
        const r2 = seeded(seed);
        let last = -Infinity;
        for (let now = 0; now < 45_000; now += 50) {
          if (now % 700 === 0) {
            const r = r2();
            road.push({ kind: r < 0.4 ? 'good' : r < 0.6 ? 'flood' : 'l7', at: now + 6000, reactAt: now + 1200 + rand() * 1500 });
          }
          for (const it of road.filter((x) => x.at <= now)) {
            road.splice(road.indexOf(it), 1);
            if (it.kind === 'good') calls.push([POINTS.shield.passed, 'none', true]);
            if (it.kind === 'l7') calls.push([POINTS.shield.breach, 'soft', false]);
          }
          if (space) {
            if (!mash(now) || !swingReady(last, now)) continue;
            last = now;
            const nearest = road.reduce<(typeof road)[number] | undefined>((a, b) => (!a || b.at < a.at ? b : a), undefined);
            if (!nearest) calls.push([SWING.blank, 'player', false]);
            else {
              road.splice(road.indexOf(nearest), 1);
              calls.push(nearest.kind === 'l7' ? [POINTS.shield.block, 'player', true] : nearest.kind === 'good' ? [POINTS.shield.blockedUser, 'player', false] : [POINTS.shield.flood, 'player', false]);
            }
          } else
            // The honest player reads the road and clicks each L7 attack a second or two after it appears.
            for (const it of road.filter((x) => x.kind === 'l7' && x.reactAt <= now)) {
              road.splice(road.indexOf(it), 1);
              calls.push([POINTS.shield.block, 'player', true]);
            }
        }
        return tally('shield', calls);
      };
      const masher = play(true);
      const honest = play(false);
      expect(masher.gate.ok, `seed ${seed}`).toBe(false);
      expect(honest.gate.ok).toBe(true);
      expect(masher.score).toBeLessThan(honest.score / 3);
    }
  });

  it('Lambda Food Stall: mashing Space scores below an honest player and misses the floor', () => {
    const play = (space: boolean) => {
      const chefs = Array.from({ length: STALL.maxConcurrency }, newChef);
      let orders: number[] = [];
      const calls: [number, Cue, boolean | undefined][] = [];
      let last = -Infinity;
      const serve = (now: number) => {
        const run = invokeChef(chefs, now);
        if (!run) return calls.push([POINTS.lambda.throttled, 'player', false]);
        orders.shift();
        calls.push(run.cold ? [POINTS.lambda.cold, 'soft', true] : [POINTS.lambda.warm, 'soft', true]);
      };
      for (let now = 0; now < 50_000; now += 50) {
        if (now % STALL.spawnMs === 0) orders.push(now);
        const expired = orders.filter((born) => now - born > STALL.timeoutMs);
        for (const _ of expired) calls.push([POINTS.lambda.expired, 'soft', false]);
        orders = orders.filter((born) => now - born <= STALL.timeoutMs);
        if (space) {
          if (!mash(now) || !swingReady(last, now)) continue;
          last = now;
          if (orders.length) serve(now);
          else calls.push([SWING.blank, 'player', false]);
        } else
          // The honest player invokes each order as it comes in, when a chef is free.
          while (orders.length && chefs.some((c) => c.busyUntil <= now)) serve(now);
      }
      return tally('lambda', calls);
    };
    const masher = play(true);
    const honest = play(false);
    expect(masher.gate.ok).toBe(false);
    expect(honest.gate.ok).toBe(true);
    expect(masher.score).toBeLessThan(honest.score / 2);
  });

  it('a Space swing waits out its cooldown', () => {
    expect(swingReady(-Infinity, 0)).toBe(true);
    expect(swingReady(1000, 1000 + SWING.cooldownMs - 1)).toBe(false);
    expect(swingReady(1000, 1000 + SWING.cooldownMs)).toBe(true);
  });

  it('Sorting Office: mashing 1-2-3-4 scores below an honest player, misses the floor and is no new best', () => {
    for (const seed of [1, 7, 42]) {
      const rand = seeded(seed);
      const parcels = Array.from({ length: 50 }, (_, i) => nextParcel(i, true, rand));
      const honest = tally('dynamodb', parcels.map(() => [sortPoints(500), 'player', true]));
      let k = 0;
      const masher = tally(
        'dynamodb',
        parcels.flatMap((p) => {
          const calls: [number, Cue, boolean][] = [];
          // Cycling the shelves until the parcel goes.
          for (; k % 4 !== shelfFor(p); k++) calls.push([POINTS.sort.wrong, 'player', false]);
          k++;
          calls.push([sortPoints(500), 'player', true]);
          return calls;
        }),
      );
      expect(masher.gate.ok, `seed ${seed}`).toBe(false);
      expect(honest.gate.ok).toBe(true);
      expect(masher.score).toBeLessThan(honest.score / 4);
      // A guess loses on average.
      expect(0.25 * sortPoints(500) + 0.75 * POINTS.sort.wrong).toBeLessThan(0);
    }
  });

  it('Red Team Range: one live request per lane, so requests never overlap; a full range makes the next one wait', () => {
    expect(freeLane([true, true, true, true, true])).toBe(-1);
    const rand = seeded(11);
    for (let i = 0; i < 100; i++) expect([1, 3]).toContain(freeLane([true, false, true, false, true], rand));
    // A round: a request every 1.1–1.9 s, each in its lane for 7.5–9 s, retrying every 300 ms when all are busy.
    const until = [0, 0, 0, 0, 0];
    let next = 0;
    let dealt = 0;
    for (let now = 0; now < 45_000; now += 50) {
      if (now < next) continue;
      const lane = freeLane(until.map((u) => u > now), rand);
      if (lane < 0) {
        next = now + 300;
        continue;
      }
      expect(until[lane]).toBeLessThanOrEqual(now);
      until[lane] = now + 7500 + rand() * 1500;
      dealt++;
      next = now + Math.max(1100, 1900 - dealt * 40);
    }
    // Still a full round's worth of requests.
    expect(dealt).toBeGreaterThan(25);
  });

  describe('Edge Cache', () => {
    /**
     * 45 s of requests every 650 ms. A miss stays in the feed EDGE_RULES.feedMs; the player caches it `react` ms later
     * (if `cache` says so and they notice it at all: `catches` of the time). Every 1.5 s they invalidate changed slots,
     * or every slot (`invalidateAll`). Accuracy counts requests only, as the game does: it is the hit ratio.
     */
    const playEdge = (cache: (name: string) => boolean, invalidateAll: boolean, rand = seeded(), react = 900, catches = 1) => {
      const s = newEdge(EDGE.files.map((f) => f.name));
      const total = EDGE.files.reduce((n, f) => n + f.weight, 0);
      const pick = () => {
        let r = rand() * total;
        for (const f of EDGE.files) if ((r -= f.weight) < 0) return f.name;
        return EDGE.files[0].name;
      };
      let pending: { at: number; name: string }[] = [];
      const calls: [number, Cue, boolean | undefined][] = [];
      for (let now = 0; now < 45_000; now += 50) {
        expire(s, now);
        for (const p of pending) if (p.at <= now) store(s, p.name, now);
        pending = pending.filter((p) => p.at > now);
        if (now % 650 === 0) {
          const name = pick();
          const r = request(s, name, now);
          calls.push(r === 'hit' ? [EDGE_RULES.hit, 'none', true] : r === 'stale' ? [EDGE_RULES.stale, 'soft', false] : [EDGE_RULES.miss, 'none', false]);
          if (r === 'miss' && cache(name) && react < EDGE_RULES.feedMs && rand() < catches) pending.push({ at: now + react, name });
        }
        if (now && now % EDGE_RULES.changeMs === 0) {
          const cached = s.slots.filter((c) => !!c);
          if (cached.length) change(s, cached[Math.floor(rand() * cached.length)]!.name);
        }
        if (now % 1500 === 0)
          s.slots.forEach((c, i) => {
            if (!c || !(invalidateAll || isChanged(s, c))) return;
            calls.push(invalidate(s, i) === 'right' ? [EDGE_RULES.invalidate, 'player', undefined] : [EDGE_RULES.wrongInvalidate, 'player', undefined]);
          });
      }
      return { ...tally('edge', calls), ratio: hitRatio(s), s };
    };

    it('caching each miss reaches the floor, even for a slow first-timer; clicking every slot or caching nothing doesn’t', () => {
      const popular = new Set(EDGE.files.slice(0, 4).map((f) => f.name));
      for (const seed of [1, 7, 42]) {
        const naive = playEdge(() => true, false, seeded(seed));
        const firstTimer = playEdge(() => true, false, seeded(seed), 2200, 0.35);
        const keen = playEdge((n) => popular.has(n), false, seeded(seed));
        const masher = playEdge(() => true, true, seeded(seed));
        const idle = playEdge(() => false, false, seeded(seed));
        for (const [name, honest] of Object.entries({ naive, firstTimer, keen })) {
          expect(honest.gate.ok, `${name} seed ${seed}: ${honest.ratio}%`).toBe(true);
          expect(honest.score, name).toBeGreaterThan(0);
        }
        expect(masher.gate.ok, `masher seed ${seed}: ${masher.ratio}%`).toBe(false);
        expect(idle.gate.ok).toBe(false);
        expect(masher.score).toBeLessThan(0);
        expect(idle.score).toBeLessThan(0);
      }
    });

    it('the end card’s accuracy and the lesson’s hit ratio are one number', () => {
      for (const seed of [1, 7, 42]) {
        for (const r of [playEdge(() => true, false, seeded(seed)), playEdge(() => true, true, seeded(seed)), playEdge(() => true, false, seeded(seed), 2200, 0.35)])
          expect(r.gate.pct).toBe(r.ratio);
      }
    });

    it('evicts the file asked for least recently, and marks the most asked files popular', () => {
      const s = newEdge(['a', 'b', 'c', 'd', 'e']);
      ['a', 'b', 'c', 'd'].forEach((n, i) => store(s, n, i));
      request(s, 'a', 10); // a was just used: b is now the least recently used
      expect(store(s, 'e', 11)).toBe(1);
      expect(s.slots.map((c) => c?.name)).toEqual(['a', 'e', 'c', 'd']);
      for (let i = 0; i < 5; i++) request(s, 'a', 20);
      expect(isPopular(s, 'a')).toBe(true);
      expect(isPopular(s, 'b')).toBe(false); // asked once: not yet
    });
  });

  it('right/wrong feedback colours are theme tokens with at least 4.5:1 contrast on the games’ grounds', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // PAL.bg and the play areas of Permission Gate / Red Team, Queue Juggler and Edge Cache.
    for (const ground of ['#140d1f', '#161021', '#1b1530', '#10172a'])
      for (const [k, c] of Object.entries(FEEDBACK)) expect(contrast(c, ground), `${k} on ${ground}`).toBeGreaterThanOrEqual(4.5);
    // The verdict pill (MiniGame.verdict) is nearly opaque: even over the lightest thing it can cover (paper, a shelf's
    // wood, the hall's floor), what shows through still leaves FEEDBACK text at 4.5:1 or better.
    const alpha = parseInt(PILL.slice(7, 9), 16) / 255;
    const over = (under: string) =>
      '#' + [0, 2, 4].map((i) => Math.round(parseInt(PILL.slice(1 + i, 3 + i), 16) * alpha + parseInt(under.slice(1 + i, 3 + i), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');
    for (const under of ['#ffffff', '#fffbeb', '#7c4a21', '#6d28d9'])
      for (const [k, c] of Object.entries(FEEDBACK)) expect(contrast(c, over(under)), `${k} on the pill over ${under}`).toBeGreaterThanOrEqual(4.5);
    // …and it stays up long enough to read.
    expect(VERDICT_MS).toBeGreaterThanOrEqual(1500);
  });
});
