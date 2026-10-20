// @vitest-environment jsdom
// Simple mode on screen (src/state/simple.ts, on by default): the City tab is one plain To-do list (no shift card, no
// crate, no season road or Codex), the HUD says "To do n/m", My City shows buildings, stars and coins; ⋯ → Show
// everything brings every extra back exactly as it was, and Keep it simple hides them again.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Progress } from '@/backend/contract';

// The portraits read the character sheets Phaser loads; a stand-in here.
vi.mock('@/ui/Portrait', () => ({ Portrait: () => <span data-testid="portrait" /> }));

const { useCity } = await import('@/state/store');
const { Home } = await import('@/ui/Home');
const { Hud } = await import('@/ui/Hud');
const { Collection } = await import('@/ui/Collection');
const { dayKey } = await import('@/state/progress');
const { setNextRunner } = await import('@/state/next');
const { QUESTS } = await import('@/world/content');
const { cardsFor } = await import('@/world/content');
const { openEverything } = await import('@/ui/useLadder');

const REGION = 'us-west-2';
/** A player who reviewed cards (Learn is open) and put up S3 Lake (its game is today's game goal); no quest finished. */
const player = (extra: Partial<Progress> = {}): Progress => ({
  version: 2,
  landmarks: {},
  updatedAt: '',
  cards: Object.fromEntries(cardsFor('s3').slice(0, 2).map((c) => [c.id, { interval: 3, ease: 2.5, due: Date.now() + 3 * 86_400_000, reps: 1 }])),
  cities: { [REGION]: { landmarks: { s3: { discovered: true, xp: 40 } } } },
  ...extra,
});
const lists = (el: HTMLElement) => el.querySelectorAll('ul, ol').length;

beforeEach(() => {
  localStorage.clear();
  useCity.setState({
    cityRegion: REGION,
    view: { name: 'city' },
    backendKind: 'mock',
    progress: player(),
    today: undefined,
    tasks: {},
    taskOrder: [],
    toasts: [],
    account: { linked: false },
    collectionOpen: false,
    careReleased: false,
    prefs: { chatter: false, stage: 'compact', region: REGION },
  } as never);
});
afterEach(() => cleanup());

describe('Simple mode (the default)', () => {
  it('the City tab is one To-do list: a box, one line why and one button that says what happens', () => {
    const ran: string[] = [];
    const off = setNextRunner((p) => ran.push(p.label));
    const opened: string[] = [];
    const { container } = render(<Home openTab={(t) => opened.push(t)} />);
    expect(useCity.getState().prefs.simple).toBeUndefined(); // absent = Simple
    expect(lists(container)).toBe(1);
    const rows = screen.getAllByRole('listitem');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThanOrEqual(5);
    for (const r of rows) {
      // One "Do it" button (glossary terms in the why line are tappable words, not buttons to do).
      const b = r.querySelectorAll('button.todo-go');
      expect(b).toHaveLength(1);
      expect(b[0].textContent).not.toMatch(/^Go\b/);
      expect(r.querySelector('.todo-check')).toBeTruthy();
      expect(r.querySelector('.todo-why')?.textContent?.length).toBeGreaterThan(0);
    }
    // One filled button: the first thing still to do.
    expect(container.querySelectorAll('.btn.primary')).toHaveLength(1);
    // "n/m done" and the HUD's "To do n/m" count exactly the rows shown, and the day isn't done while one is open.
    const ticked = container.querySelectorAll('.todo-check.on').length;
    expect(container.querySelector('.todo-count')?.textContent).toBe(`${ticked}/${rows.length} done`);
    const hud = render(<Hud layout="panel" />);
    expect(hud.container.querySelector('.hud-todo')?.textContent).toMatch(new RegExp(`To do ${ticked}/${rows.length}`));
    hud.unmount();
    expect(screen.queryByText(/Done for today/)).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Today’s tasks done' })).toBeTruthy();
    // None of the extras: no shift card, no More to do, no crate, no season road or Codex.
    expect(screen.queryByText('Today’s shift')).toBeNull();
    expect(screen.queryByText('More to do')).toBeNull();
    expect(container.querySelector('.supply-drop, .loops-season, .loops-codex, .ready, .order-board, .weekly, .launch-cta')).toBeNull();
    // "Review 5 cards" opens Learn's cards; the button says so.
    fireEvent.click(screen.getByRole('button', { name: /^Review 5 cards/ }));
    expect(opened).toEqual(['cards']);
    off();
  });

  it('a finished day says when to come back; Show everything brings the shift and its crate back, Keep it simple hides them', () => {
    useCity.setState({ today: { day: dayKey(), cards: 5, games: 1 } } as never);
    const { container } = render(<Home openTab={() => {}} />);
    expect(screen.getByRole('status').textContent).toMatch(/Done for today\. Come back tomorrow: /);
    expect(container.querySelectorAll('.todo-check.on').length).toBe(2);
    // Every row ticked: nothing open on the list; the next thing waits as an offer, not a row.
    expect(container.querySelectorAll('.todo-row:not(.done)')).toHaveLength(0);
    expect(container.querySelector('.todo-count')?.textContent).toBe('2/2 done');
    expect(container.querySelector('.todo-extra')?.textContent).toMatch(/^Want more\?/);
    expect(container.querySelector('.supply-drop')).toBeNull();
    // ⋯ → Show everything.
    const hud = render(<Hud layout="panel" />);
    expect(hud.container.querySelector('.hud-todo')?.textContent).toMatch(/To do 2\/2/);
    expect(hud.container.querySelector('.hud-lights, .rank-chip')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show everything' }));
    expect(useCity.getState().prefs.simple).toBe(false);
    expect(screen.getByText('Today’s shift')).toBeTruthy();
    expect(screen.getByText('More to do')).toBeTruthy();
    expect(container.querySelector('.supply-drop')).toBeTruthy();
    expect(container.querySelector('.todo')).toBeNull();
    expect(hud.container.querySelector('.hud-lights')).toBeTruthy();
    expect(hud.container.querySelector('.rank-chip')).toBeTruthy();
    expect(hud.container.querySelector('.hud-todo')).toBeNull();
    // ⋯ → Keep it simple: the list again, the crate hidden (still there for Everything).
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Keep it simple' }));
    expect(useCity.getState().prefs.simple).toBeUndefined();
    expect(container.querySelector('.todo')).toBeTruthy();
    expect(container.querySelector('.supply-drop')).toBeNull();
  });

  it('over five rows, the goals left wait behind "+N more", still counted; tapping it shows them', () => {
    // Every area open (Show everything opens them), and a quest under way: more rows than fit.
    useCity.setState({ progress: player({ quests: { [QUESTS[0].id]: { status: 'active', step: 0, count: 0 } } }) });
    act(() => openEverything());
    const { container } = render(<Home openTab={() => {}} />);
    const more = container.querySelector<HTMLButtonElement>('.todo-more')!;
    expect(more).toBeTruthy();
    const shown = screen.getAllByRole('listitem').length;
    expect(shown).toBe(5);
    const n = Number(more.textContent?.match(/\+(\d+)/)?.[1]);
    expect(container.querySelector('.todo-count')?.textContent).toMatch(new RegExp(`/${shown + n} done$`));
    fireEvent.click(more);
    expect(screen.getAllByRole('listitem')).toHaveLength(shown + n);
    expect(container.querySelector('.todo-more')).toBeNull();
  });

  it('a brand-new player sees one task: the quest’s first step', () => {
    const q = QUESTS[0];
    useCity.setState({ progress: { version: 2, landmarks: {}, updatedAt: '', quests: { [q.id]: { status: 'active', step: 0, count: 0 } } } });
    const { container } = render(<Home openTab={() => {}} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('button.todo-go')?.textContent).toMatch(/^Walk to /);
    expect(container.querySelector('.todo-bar')).toBeNull();
  });

  it('City care waits for a finished quest in Simple', () => {
    useCity.setState({ careReleased: true });
    const { container, rerender } = render(<Home openTab={() => {}} />);
    expect(container.querySelector('.care-fold')).toBeNull();
    act(() => useCity.setState({ progress: player({ quests: { [QUESTS[0].id]: { status: 'done', step: QUESTS[0].steps.length } } }) }));
    rerender(<Home openTab={() => {}} />);
    expect(container.querySelector('.care-fold')).toBeTruthy();
  });

  it('My City shows buildings, stars and coins; Everything restores the rank, badges, season road and Codex', () => {
    useCity.setState({ progress: player({ wallet: { earned: 30, spent: 0 } }) });
    act(() => useCity.getState().openCollection(true));
    const { container, rerender } = render(<Collection />);
    expect(screen.getByRole('list', { name: 'Your numbers' }).textContent).toMatch(/⭐ \d+ stars learned.*30 City Coins.*1 building put up/);
    expect(screen.getByText('S3 Lake')).toBeTruthy();
    expect(container.querySelector('.rank-ladder, .badge-grid, .loops-season, .loops-codex, .loops-lights')).toBeNull();
    act(() => useCity.getState().setPref('simple', false));
    rerender(<Collection />);
    for (const sel of ['.rank-ladder', '.badge-grid', '.loops-season', '.loops-codex', '.loops-lights']) expect(container.querySelector(sel)).toBeTruthy();
    act(() => useCity.getState().openCollection(false));
  });
});
