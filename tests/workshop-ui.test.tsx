// @vitest-environment jsdom
// Workshops that feel like a game: Tab and Hint in the practice terminal (a hint costs a star), names that carry over to
// CloudShell's check, stars and the next step inside the dialog, the demo never "for real", and the finished card.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ui/Portrait', () => ({ Portrait: () => <span data-testid="portrait" /> }));
const verify = vi.fn();
vi.mock('@/app/runtime', async (importOriginal) => ({ ...(await importOriginal<object>()), verifyWorkshopStep: verify }));

const { useCity } = await import('@/state/store');
const { bus } = await import('@/state/bus');
const { Workshop } = await import('@/ui/Workshop');
const { WorkshopDone, DONE_CARD_MS } = await import('@/ui/WorkshopDone');
const { PRACTICE_STEP_XP } = await import('@/learning/workshopRewards');

const ID = 'dynamodb-first-table';
const base = useCity.getState().progress;
// The first render pays for loading the workshop's modules; do it once here, so no test runs near its time limit under load.
beforeAll(() => {
  act(() => useCity.getState().openWorkshop(ID));
  render(<Workshop />);
  cleanup();
});
beforeEach(() => {
  verify.mockReset();
  useCity.setState({ progress: { ...base, workshops: {} }, workshopOpen: undefined, backendKind: 'mock', prefs: { ...useCity.getState().prefs, workshopMemory: undefined } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const open = () => act(() => useCity.getState().openWorkshop(ID));
// By its label, not its role: a role query computes every element's role and name (slow under load).
const terminal = () => screen.getAllByLabelText(/Practice terminal for/).find((e) => e instanceof HTMLTextAreaElement || e instanceof HTMLInputElement) as HTMLTextAreaElement;
const enter = (line: string) => {
  fireEvent.change(terminal(), { target: { value: line } });
  fireEvent.keyDown(terminal(), { key: 'Enter' });
};

describe('the practice terminal in a workshop', () => {
  it('Tab finishes a word; Hint types the next one and costs a star on that step', () => {
    open();
    render(<Workshop />);
    fireEvent.change(terminal(), { target: { value: 'aws st' } });
    fireEvent.keyDown(terminal(), { key: 'Tab' });
    expect(terminal().value).toBe('aws sts ');
    fireEvent.click(screen.getByText(/💡 Hint/).closest('button')!);
    expect(terminal().value).toBe('aws sts get-caller-identity ');
    expect(screen.getByText(/1 hint/).textContent).toMatch(/−1⭐/);
    act(() => fireEvent.keyDown(terminal(), { key: 'Enter' }));
    expect(useCity.getState().progress.workshops?.[ID]?.steps.whoami).toBe('practice');
    // The stars float in the dialog with the building's growth line.
    expect(screen.getByText(new RegExp(`\\+${PRACTICE_STEP_XP - 1}⭐ · `))).toBeTruthy();
  });

  it('moves to the next step a second after a pass, and remembers the names and lines for the whole workshop', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    open();
    render(<Workshop />);
    act(() => enter('aws sts get-caller-identity'));
    expect(screen.getByRole('region', { name: 'Check who you are' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('region', { name: 'Create the table' })).toBeTruthy();
    act(() => enter('aws dynamodb create-table --table-name shop --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH --billing-mode PAY_PER_REQUEST'));
    const memory = useCity.getState().prefs.workshopMemory?.[ID];
    expect(memory?.names.table).toBe('shop');
    expect(memory?.history).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1000));
    // The next step's command shows the name, ↑ brings back the last line, and Tab types the name.
    expect(screen.getByText(/aws dynamodb wait table-exists --table-name shop/)).toBeTruthy();
    fireEvent.keyDown(terminal(), { key: 'ArrowUp' });
    expect(terminal().value).toMatch(/^aws dynamodb create-table/);
    fireEvent.change(terminal(), { target: { value: 'aws dynamodb wait table-exists --table-name ' } });
    fireEvent.keyDown(terminal(), { key: 'Tab' });
    expect(terminal().value).toBe('aws dynamodb wait table-exists --table-name shop ');
  });
});

describe('a quest’s workshop step', () => {
  it('says the quest step is done, so the player knows they can close the workshop', () => {
    useCity.setState({ progress: { ...base, workshops: {}, quests: { 'database-library-card': { status: 'active', step: 2, count: 0 } } } });
    open();
    render(<Workshop />);
    expect(screen.queryByText(/Quest step done/)).toBeNull();
    act(() => enter('aws sts get-caller-identity'));
    expect(useCity.getState().progress.quests?.['database-library-card']?.step).toBe(3);
    expect(screen.getByText(/Quest step done/).textContent).toBe('✓ Quest step done — you can close this');
  });

  it('says nothing when no quest was waiting on this workshop', () => {
    open();
    render(<Workshop />);
    act(() => enter('aws sts get-caller-identity'));
    expect(screen.queryByText(/Quest step done/)).toBeNull();
  });
});

describe('for real', () => {
  it('in the demo, runs in the practice terminal and pays practice, never "real"', () => {
    open();
    render(<Workshop />);
    fireEvent.click(screen.getByRole('button', { name: /Practice account \(demo\)/ }));
    expect(screen.getByRole('note').textContent).toMatch(/demo/);
    expect(screen.queryByRole('button', { name: /Open CloudShell/ })).toBeNull();
    act(() => enter('aws sts get-caller-identity'));
    expect(useCity.getState().progress.workshops?.[ID]?.steps.whoami).toBe('practice');
    // Even a "real" step from elsewhere (a check, the Copilot) is practice in the demo.
    act(() => void useCity.getState().workshopStep(ID, 'create', 'real'));
    expect(useCity.getState().progress.workshops?.[ID]?.steps.create).toBe('practice');
  });

  it('with an account, asks only for the name its check reads, filled in from practice, and says the Region', () => {
    useCity.setState({ backendKind: 'server', account: { linked: true, region: 'eu-west-2' } });
    useCity.getState().rememberWorkshop(ID, { names: { table: 'shop' } });
    open();
    render(<Workshop />);
    fireEvent.click(screen.getByRole('button', { name: /For real in CloudShell/ }));
    expect(screen.getByRole('note').textContent).toMatch(/Use the same names: table shop\. Region: eu-west-2/);
    fireEvent.click(screen.getByRole('button', { name: /Create the table/ }));
    const input = screen.getByRole('textbox', { name: /table name you used/ }) as HTMLInputElement;
    expect(input.value).toBe('shop');
    expect(screen.getAllByRole('textbox').filter((t) => t.tagName === 'INPUT')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Check my account' }));
    expect(verify).toHaveBeenCalledWith(ID, 'create', { table: 'shop' });
  });
});

describe('a finished workshop', () => {
  it('shows one "Workshop complete" card and closes the workshop panel', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const flyTo = vi.fn();
    const off = bus.on('flyTo', flyTo);
    open();
    render(
      <>
        <Workshop />
        <WorkshopDone />
      </>,
    );
    act(() => {
      for (const id of ['whoami', 'create', 'wait', 'put', 'get', 'cleanup']) useCity.getState().workshopStep(ID, id, 'practice');
    });
    expect(useCity.getState().progress.workshops?.[ID]?.done).toBeTruthy();
    act(() => vi.advanceTimersByTime(DONE_CARD_MS));
    expect(screen.getByRole('dialog', { name: 'Workshop complete!' })).toBeTruthy();
    expect(useCity.getState().workshopOpen).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: /See .* in the city/ }));
    expect(flyTo).toHaveBeenCalledWith({ id: 'dynamodb' });
    expect(screen.queryByRole('dialog', { name: 'Workshop complete!' })).toBeNull();
    off();
  });
});
