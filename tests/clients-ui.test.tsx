// @vitest-environment jsdom
// City Clients in React: the business's task list ("3 of 5", stations, ✓, Go, "Put up <X> first"), Go walking Kai to
// the station (the job opens on arrival), the runners paying once ever, a level done holding the floor with its card,
// and the wire job playing on the architecture board without touching Progress.puzzles.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Progress } from '@/backend/contract';

vi.mock('@/ui/Portrait', () => ({ Portrait: () => <span data-testid="portrait" /> }));
const copilot = vi.fn();
vi.mock('@/app/runtime', async (importOriginal) => ({ ...(await importOriginal<object>()), startConsoleCopilot: copilot }));

const { useCity, toastsHeld } = await import('@/state/store');
const { bus } = await import('@/state/bus');
const { ClientsPanel } = await import('@/ui/clients/ClientsPanel');
const { ClientTask, ClientDone } = await import('@/ui/clients/ClientTask');
const { CLIENTS, levelPay, taskPay } = await import('@/world/clients');
const { SERVICES } = await import('@/world/taxonomy');

const REGION = 'us-west-2';
const bank = CLIENTS.find((b) => b.id === 'bank')!;
const all = (): Progress => ({
  version: 2,
  landmarks: Object.fromEntries(SERVICES.map((s) => [s.id, { discovered: true, xp: 0 }])),
  cities: { [REGION]: { landmarks: Object.fromEntries(SERVICES.map((s) => [s.id, { discovered: true, xp: 0 }])) } },
  updatedAt: '2026-10-19T00:00:00.000Z',
});

// The first render pays for loading the panel's modules; do it once here, so no test runs near its time limit under load.
beforeAll(() => {
  useCity.setState({ progress: all(), cityRegion: REGION, backendKind: 'mock' });
  render(<ClientsPanel />);
  act(() => useCity.getState().openClients(''));
  cleanup();
});

beforeEach(() => {
  copilot.mockReset();
  useCity.setState({ progress: all(), cityRegion: REGION, clientsOpen: undefined, clientTaskOpen: undefined, clientDone: undefined, clientFocus: undefined, backendKind: 'mock' });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const xpOf = (id: string) => useCity.getState().progress.cities?.[REGION]?.landmarks[id]?.xp ?? useCity.getState().progress.landmarks[id]?.xp ?? 0;

describe('the clients panel', () => {
  it('lists every business, then a business\'s level and its jobs with stations, "0 of 5" and Go', () => {
    render(<ClientsPanel />);
    act(() => useCity.getState().openClients(''));
    // One text scan for every name (a getByText per business walks the whole list each time).
    const shown = document.body.textContent ?? '';
    for (const b of CLIENTS) expect(shown).toContain(b.name);
    fireEvent.click(screen.getByText(bank.name));
    expect(useCity.getState().clientFocus).toBe('bank');
    const lv = bank.levels[0];
    expect(screen.getByText(`Level 1: ${lv.title}`)).toBeTruthy();
    expect(screen.getAllByText(`0 of ${lv.tasks.length}`).length).toBeGreaterThan(0);
    for (const t of lv.tasks) expect(screen.getByText(t.title)).toBeTruthy();
    // Accessible names straight from the buttons (a role query computes every element's role and name: slow).
    const go = [...document.querySelectorAll('button')].filter((b) => /^Go to the /.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
    expect(go).toHaveLength(lv.tasks.length);
  });

  it('a job whose services aren\'t put up here says so, and its Go flies to that building instead', () => {
    const p = all();
    const t = bank.levels[0].tasks[0];
    for (const s of t.services) p.cities![REGION].landmarks[s] = { discovered: false, xp: 0 };
    for (const s of t.services) p.landmarks[s] = { discovered: false, xp: 0 };
    useCity.setState({ progress: p });
    const flown: string[] = [];
    const off = bus.on('flyTo', ({ id }) => flown.push(id));
    render(<ClientsPanel />);
    act(() => useCity.getState().openClients('bank'));
    // It says how, not only what: "Put up X first. How? Tap Show me to visit X, then learn one of its cards…".
    const need = screen.getAllByText(/^Put up .* first\./);
    expect(need.length).toBeGreaterThan(0);
    expect(need[0].textContent).toMatch(/How\? Tap Show me to visit .*, then learn one of .* cards: that puts it up\./);
    fireEvent.click(screen.getAllByRole('button', { name: /How do I put up .*\? Show me/ })[0]);
    off();
    expect(flown).toEqual([t.services[0]]);
    expect(useCity.getState().selected).toBe(t.services[0]);
  });

  it('a starter station is open from day one, before anything is put up', () => {
    const empty: Progress = { version: 2, landmarks: {}, cities: { [REGION]: { landmarks: {} } }, updatedAt: '2026-10-19T00:00:00.000Z' };
    useCity.setState({ progress: empty });
    render(<ClientsPanel />);
    act(() => useCity.getState().openClients('stadium'));
    expect(screen.getByText(/Starter job: open from day one/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Go to the Turnstiles for “Sort the fans’ requests”|Go to the Turnstiles/ })).toBeTruthy();
  });

  it('Go walks Kai to the station and the job opens when he arrives (at once while the city sleeps)', () => {
    render(<ClientsPanel />);
    act(() => useCity.getState().openClients('bank'));
    let arrived: (() => void) | undefined;
    const off = bus.on('walkToStation', (e) => {
      e.accept();
      arrived = e.arrived;
      expect(e).toMatchObject({ clientId: 'bank', station: bank.levels[0].tasks[0].station });
    });
    fireEvent.click(screen.getAllByRole('button', { name: /^Go to the / })[0]);
    off();
    expect(useCity.getState().clientsOpen).toBeUndefined();
    expect(useCity.getState().clientTaskOpen).toBeUndefined();
    act(() => arrived!());
    expect(useCity.getState().clientTaskOpen).toBe(bank.levels[0].tasks[0].id);
  });
});

describe('the job runners', () => {
  it('a choose job pays its services once ever, and shows the count', () => {
    const t = bank.levels[0].tasks.find((x) => x.type === 'choose')!;
    if (t.type !== 'choose') throw new Error('no choose job');
    render(<ClientTask />);
    act(() => useCity.getState().openClientTask(t.id));
    const before = xpOf(t.services[0]);
    const right = t.choose.options.find((o) => o.correct)!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(right.text.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));
    expect(screen.getByText('✓ Job done!')).toBeTruthy();
    expect(xpOf(t.services[0]) - before).toBe(taskPay(t)[t.services[0]]);
    expect(useCity.getState().progress.clients?.bank?.done).toEqual([t.id]);
    expect(useCity.getState().clientTaskDone(t.id)).toBe(0);
  });

  it('a fix job passes only with every setting right', () => {
    const t = bank.levels[0].tasks.find((x) => x.type === 'fix')!;
    if (t.type !== 'fix') throw new Error('no fix job');
    render(<ClientTask />);
    act(() => useCity.getState().openClientTask(t.id));
    // All "Leave it" first: wrong.
    for (const s of t.fix.settings) fireEvent.click(screen.getAllByRole('group', { name: s.label })[0].querySelectorAll('button')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Check my settings' }));
    expect(screen.queryByText('✓ Job done!')).toBeNull();
    for (const s of t.fix.settings) fireEvent.click(screen.getAllByRole('group', { name: s.label })[0].querySelectorAll('button')[s.switchIt ? 0 : 1]);
    fireEvent.click(screen.getByRole('button', { name: 'Check my settings' }));
    expect(screen.getByText('✓ Job done!')).toBeTruthy();
  });

  it('a run job passes in the practice terminal; a click job starts the Copilot on its service', () => {
    const run = bank.levels[0].tasks.find((x) => x.type === 'run')!;
    if (run.type !== 'run') throw new Error('no run job');
    render(<ClientTask />);
    act(() => useCity.getState().openClientTask(run.id));
    const box = screen.getByRole('textbox', { name: /Practice terminal for/ }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: run.run.cli.replace(/<([a-z0-9-]+)>/g, 'bank') } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByText('✓ Job done!')).toBeTruthy();
    cleanup();
    const click = bank.levels[0].tasks.find((x) => x.type === 'click')!;
    if (click.type !== 'click') throw new Error('no click job');
    render(<ClientTask />);
    act(() => useCity.getState().openClientTask(click.id));
    fireEvent.click(screen.getByRole('button', { name: /Do it with the Copilot/ }));
    expect(copilot).toHaveBeenCalledWith(click.click.goal, expect.objectContaining({ serviceId: click.click.flow }));
    // The Copilot's task finishing well does the job.
    copilot.mock.calls[0][1].onStart('t-1');
    act(() => useCity.getState().applyServerEvent({ type: 'task.done', taskId: 't-1', ok: true, result: 'Done', xp: [] }));
    expect(useCity.getState().progress.clients?.bank?.done).toContain(click.id);
  });

  it('the level\'s last job finishes it: the bonus, one card holding the floor, and the site grows', () => {
    vi.useFakeTimers();
    const lv = bank.levels[0];
    const grown: number[] = [];
    const off = bus.on('clientLevelUp', ({ clientId, level }) => clientId === 'bank' && grown.push(level));
    for (const t of lv.tasks.slice(0, -1)) useCity.getState().clientTaskDone(t.id);
    const svc = lv.tasks.at(-1)!.services[0];
    const before = xpOf(svc);
    render(<ClientDone />);
    act(() => void useCity.getState().clientTaskDone(lv.tasks.at(-1)!.id));
    off();
    expect(grown).toEqual([1]);
    expect(useCity.getState().progress.clients?.bank).toMatchObject({ level: 1 });
    expect(xpOf(svc) - before).toBe((taskPay(lv.tasks.at(-1)!)[svc] ?? 0) + (levelPay(lv)[svc] ?? 0));
    expect(toastsHeld(useCity.getState())).toBe(true);
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByRole('dialog', { name: /level 1 done/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep exploring' }));
    expect(useCity.getState().clientDone).toBeUndefined();
  });

  it('a wire job plays on the architecture board and never touches Progress.puzzles', () => {
    const t = CLIENTS.flatMap((b) => b.levels[0].tasks).find((x) => x.type === 'wire')!;
    render(<ClientTask />);
    act(() => useCity.getState().openClientTask(t.id));
    expect(screen.getByRole('button', { name: /Check design/ })).toBeTruthy();
    expect(useCity.getState().progress.puzzles).toBeUndefined();
  });
});
