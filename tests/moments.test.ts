import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AwsIncident } from '@/backend/contract';
import { bus } from '@/state/bus';
import { useCity } from '@/state/store';
import { QUESTS } from '@/world/content';
import { TIER_XP } from '@/world/places';
import { WORKSHOPS } from '@/world/workshops';

// One moment, one celebration: a big event gets one channel, never a toast stacked on the city's own celebration.
const s = () => useCity.getState();

beforeEach(() => {
  vi.useFakeTimers();
  s().resetSession();
  s().clearToasts();
});
afterEach(() => {
  s().resetSession();
  vi.useRealTimers();
});

describe('moments', () => {
  it('a tier-up celebrates on the building only (no toast)', () => {
    const tierUps: unknown[] = [];
    const off = bus.on('tierUp', (e) => tierUps.push(e));
    s().addXp('s3', TIER_XP[1]);
    off();
    expect(tierUps).toHaveLength(1);
    expect(s().toasts).toHaveLength(0);
  });

  it('a finished quest opens its celebration card instead of a toast', () => {
    const q = QUESTS[0];
    s().startQuest(q.id);
    // Walk every step (a cards step counts one card at a time).
    for (const step of q.steps) {
      const n = step.kind === 'cards' ? step.count : 1;
      for (let i = 0; i < n; i++) s().questEvent((st) => st === step, true);
    }
    expect(s().progress.quests?.[q.id]?.status).toBe('done');
    expect(s().celebration).toBe(q.id);
    expect(s().toasts.some((t) => /Quest complete/.test(t.text))).toBe(false);
    s().celebrate(undefined);
    expect(s().celebration).toBeUndefined();
  });

  it('a deploy that finishes a quest celebrates once (no "built" toast on top of the card)', () => {
    const q = QUESTS.find((x) => x.steps.at(-1)?.kind === 'deploy')!;
    const last = q.steps.at(-1)!;
    s().startQuest(q.id);
    for (const step of q.steps.slice(0, -1)) {
      const n = step.kind === 'cards' ? step.count : 1;
      for (let i = 0; i < n; i++) s().questEvent((st) => st === step, true);
    }
    s().clearToasts();
    const templateId = (last as { templateId: string }).templateId;
    useCity.setState({ deploys: { d1: { deployId: 'd1', templateId, stackName: 'aws-city-static-site', region: 'us-west-2', changes: [], status: 'running' } } } as never);
    s().applyServerEvent({ type: 'deploy.status', deployId: 'd1', status: 'complete' } as never);
    expect(s().celebration).toBe(q.id);
    expect(s().toasts).toHaveLength(0);
    // Not a quest's last step: the toast says where it was built (the demo's practice account), once the card closes.
    useCity.setState({ deploys: { d2: { deployId: 'd2', templateId, stackName: 'again', region: 'us-west-2', changes: [], status: 'running' } } } as never);
    s().applyServerEvent({ type: 'deploy.status', deployId: 'd2', status: 'complete' } as never);
    expect(s().toasts).toHaveLength(0);
    s().celebrate(undefined);
    expect(s().toasts.at(-1)?.text).toBe('again is built in the practice account!');
  });

  it('a deploy finishing never ticks an "ask" step (only an answered request does)', () => {
    const q = QUESTS.find((x) => x.steps.some((st) => st.kind === 'ask'))!;
    const at = q.steps.findIndex((st) => st.kind === 'ask');
    s().startQuest(q.id);
    for (const step of q.steps.slice(0, at)) {
      const n = step.kind === 'cards' ? step.count : 1;
      for (let i = 0; i < n; i++) s().questEvent((st) => st === step, true);
    }
    expect(s().progress.quests?.[q.id]?.step).toBe(at);
    useCity.setState({ deploys: { d9: { deployId: 'd9', templateId: 'static-site', stackName: 'x', region: 'us-west-2', changes: [], status: 'running' } } } as never);
    s().applyServerEvent({ type: 'task.done', taskId: 'd9', ok: true, result: 'deployed', xp: [] });
    expect(s().progress.quests?.[q.id]?.step).toBe(at);
    s().applyServerEvent({ type: 'task.done', taskId: 't1', ok: true, result: 'answered', xp: [] });
    expect(s().progress.quests?.[q.id]?.step).toBe(at + 1);
  });

  it('AWS Health stays quiet (weather only, no toast) before the first quest is done', () => {
    const incident = (status: AwsIncident['status']): AwsIncident => ({
      id: 'i1',
      title: 'Practice drill: S3 in us-west-2',
      region: s().cityRegion,
      services: ['s3'],
      severity: 'degradation',
      status,
      drill: true,
      started: new Date().toISOString(),
      updated: new Date().toISOString(),
      log: [],
    } as unknown as AwsIncident);
    s().applyServerEvent({ type: 'aws.health', incidents: [], asOf: new Date().toISOString() } as never);
    s().applyServerEvent({ type: 'aws.health', incidents: [incident('open')], asOf: new Date().toISOString() } as never);
    expect(s().toasts).toHaveLength(0);
  });

  it('while a celebration card is up, toasts wait and come one by one after it closes', () => {
    useCity.setState({ view: { name: 'city' } });
    s().celebrate(QUESTS[0].id);
    s().toast('🏅', 'Badge earned: Questing.');
    s().toast('⛈️', 'AWS has trouble somewhere.');
    expect(s().toasts).toHaveLength(0);
    s().celebrate(undefined);
    expect(s().toasts.map((t) => t.text)).toEqual(['Badge earned: Questing.']);
    s().dismissToast(s().toasts[0].id);
    vi.advanceTimersByTime(200);
    expect(s().toasts.map((t) => t.text)).toEqual(['AWS has trouble somewhere.']);
  });

  it('a toast already showing steps aside for the card and comes back after it', () => {
    useCity.setState({ view: { name: 'city' } });
    s().toast('🔓', 'Learn is open');
    expect(s().toasts).toHaveLength(1);
    s().celebrate(QUESTS[0].id);
    vi.advanceTimersByTime(200);
    expect(s().toasts).toHaveLength(0);
    s().celebrate(undefined);
    expect(s().toasts.map((t) => t.text)).toEqual(['Learn is open']);
  });

  it('a finished workshop holds toasts (its "Established" badge too) until its card closes', () => {
    useCity.setState({ view: { name: 'city' } });
    const w = WORKSHOPS[0];
    s().toast('🔓', 'Learn is open');
    for (const st of w.steps) s().workshopStep(w.id, st.id, 'practice');
    expect(s().workshopDone).toBe(w.id);
    s().toast('🏅', 'Badge earned: Established.');
    vi.advanceTimersByTime(200);
    expect(s().toasts.filter((t) => !t.leaving)).toHaveLength(0);
    s().celebrateWorkshop(undefined);
    expect(s().toasts.map((t) => t.text)).toEqual(['Learn is open']);
    s().dismissToast(s().toasts[0].id);
    vi.advanceTimersByTime(200);
    expect(s().toasts.map((t) => t.text)).toEqual(['Badge earned: Established.']);
  });

  it('a mini-game holds toasts (nothing covers its timer or score) until it closes; errors still show', () => {
    useCity.setState({ view: { name: 'city' } });
    s().setView({ name: 'game', game: 'fishing' });
    s().toast('🏅', 'Badge earned: Angler.');
    expect(s().toasts).toHaveLength(0);
    s().toast('⚠️', 'Sign-in didn’t finish.', 'error');
    expect(s().toasts.map((t) => t.kind)).toEqual(['error']);
    s().clearToasts();
    s().toast('🏅', 'Badge earned: Angler.');
    s().setView({ name: 'city' });
    expect(s().toasts.map((t) => t.text)).toEqual(['Badge earned: Angler.']);
  });

  it('a practice drill after the first quest says plainly that nothing is wrong, after the card closes', () => {
    useCity.setState({ view: { name: 'city' } });
    const drill = {
      id: 'drill-1',
      title: 'Practice drill',
      region: s().cityRegion,
      services: ['Amazon S3'],
      serviceIds: ['s3'],
      serviceCount: 2,
      severity: 'degradation',
      status: 'open',
      drill: true,
      started: new Date().toISOString(),
      updated: new Date().toISOString(),
      log: [],
    } as unknown as AwsIncident;
    const q = QUESTS[0];
    useCity.setState({ progress: { ...s().progress, quests: { [q.id]: { status: 'done', step: q.steps.length } } } });
    s().celebrate(q.id);
    s().applyServerEvent({ type: 'aws.health', incidents: [], asOf: new Date().toISOString() } as never);
    s().applyServerEvent({ type: 'aws.health', incidents: [drill], asOf: new Date().toISOString() } as never);
    expect(s().toasts).toHaveLength(0);
    s().celebrate(undefined);
    expect(s().toasts[0]?.text).toMatch(/^Practice storm: nothing is wrong with your city\. \(/);
    expect(s().toasts[0]?.kind).toBe('info');
  });

  it('players see stars, never "XP" (outside comments and identifiers)', () => {
    const files = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|tsx|json)$/.test(e.name) ? [path.join(dir, e.name)] : []));
    const root = path.resolve(__dirname, '..');
    const hits = [...files(path.join(root, 'src')), ...files(path.join(root, 'shared'))].flatMap((f) =>
      fs
        .readFileSync(f, 'utf8')
        .split('\n')
        .map((line, n) => ({ at: `${path.relative(root, f)}:${n + 1}`, line }))
        .filter(({ line }) => /\bXP\b/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)),
    );
    expect(hits.map((h) => h.at)).toEqual([]);
  });
});
