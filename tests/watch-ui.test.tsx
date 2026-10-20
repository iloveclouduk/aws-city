// @vitest-environment jsdom
// Round 3's currencies and stories, rendered for real: Watch it done (TaskCard before, during, after), the building
// card's "Ask a question" / "Watch it done", the Drawing board's intro and coin pay, and My City as the progress hub.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Progress } from '@/backend/contract';

vi.mock('@/ui/Portrait', () => ({ Portrait: () => <span data-testid="portrait" />, agentColor: () => '#fff' }));
const submit = vi.fn<(prompt: string) => void>();
const plan = vi.fn<(templateId: string, taskId?: string) => string | undefined>();
vi.mock('@/app/runtime', async (importOriginal) => ({ ...(await importOriginal<object>()), submitPrompt: submit, planDeploy: plan }));

const { useCity } = await import('@/state/store');
const { bus } = await import('@/state/bus');
const { TaskCard, AgentOffer } = await import('@/ui/ActivityFeed');
const { LandmarkCard } = await import('@/ui/LandmarkCard');
const { Sandbox } = await import('@/ui/diagram/Sandbox');
const { Collection } = await import('@/ui/Collection');
const { coins } = await import('@/state/wallet');
const { starsEarned } = await import('@/state/buildmode');

const T0 = '2026-10-19T10:00:00.000Z';
// IAM is a global service: its building lives in `landmarks` and stands in every city.
const base = (): Progress => ({ version: 2, landmarks: { iam: { discovered: true, xp: 30 } }, cities: { 'us-west-2': { landmarks: { s3: { discovered: true, xp: 120 }, lambda: { discovered: true, xp: 60 } } } }, updatedAt: T0 }) as Progress;
const send = (e: Parameters<ReturnType<typeof useCity.getState>['applyServerEvent']>[0]) => act(() => useCity.getState().applyServerEvent(e));

beforeEach(() => {
  submit.mockReset();
  plan.mockReset();
  localStorage.clear();
  useCity.setState({ backendKind: 'mock', backendStatus: 'connected', cityRegion: 'us-west-2', progress: base(), tasks: {}, taskOrder: [], account: { linked: true }, collectionOpen: false, selected: undefined, view: { name: 'city' } });
});
afterEach(() => cleanup());

describe('Watch it done', () => {
  it('tells the story before, mirrors the steps during, and shows what was built after', () => {
    const flown: string[] = [];
    const off = bus.on('flyTo', ({ id }) => flown.push(id));
    const openTab = vi.fn();
    act(() => useCity.getState().addTask('t1', 'Store my holiday photos cheaply'));
    const view = () => <TaskCard task={useCity.getState().tasks.t1} openTab={openTab} />;
    const { rerender, container } = render(view());
    // Before: who will do what, where, and Watch.
    expect(container.querySelector('.watch-framing')?.textContent).toBe('Sally will store your holiday photos in S3 Lake. Watch Sally walk there.');
    fireEvent.click(screen.getByRole('button', { name: /Watch/ }));
    expect(flown).toEqual(['agent:s3']);
    expect(screen.getByRole('button', { name: /Watching/ }).getAttribute('aria-pressed')).toBe('true');

    // During: the card follows the steps the city shows, one live line while watching (the walk there too).
    send({ type: 'task.plan', taskId: 't1', agentId: 's3', targetServiceId: 's3', steps: ['Heading to S3 Lake', 'Looking for a bucket', 'Asking Ivy for help', 'Lifecycle rule'] });
    send({ type: 'task.step', taskId: 't1', index: 0, text: 'Heading to S3 Lake', status: 'running' });
    rerender(view());
    expect(container.querySelector('.watch-framing')).toBeTruthy();
    expect(screen.getByLabelText('Step 1 of 4').textContent).toMatch(/Heading to S3 Lake/);
    send({ type: 'task.step', taskId: 't1', index: 0, text: 'Arrived at S3 Lake', status: 'done' });
    send({ type: 'task.step', taskId: 't1', index: 1, text: 'Looking for a bucket', status: 'running' });
    rerender(view());
    expect(screen.getByLabelText('Step 2 of 4').textContent).toMatch(/Looking for a bucket/);
    fireEvent.click(screen.getByRole('button', { name: 'Steps' }));
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['✓ Arrived at S3 Lake', '▸ Looking for a bucket', '· Asking Ivy for help', '· Lifecycle rule']);

    // After: what was built, what it teaches, what it paid, See it in Deploy and the next step.
    send({ type: 'task.done', taskId: 't1', ok: true, result: 'Your photos are stored cheaply.', xp: [{ serviceId: 's3', amount: 15 }] });
    rerender(view());
    expect(container.querySelector('.watch-result .task-result')?.textContent).toMatch(/What Sally built: Your photos are stored cheaply/);
    expect(container.querySelector('.watch-teaches')?.textContent).toMatch(/What it teaches: S3 storage classes/);
    expect(screen.getByText('+15 ⭐ S3 Lake')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Next: / })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /See it in Deploy/ }));
    expect(plan).toHaveBeenCalledWith('static-site', 't1');
    expect(openTab).toHaveBeenCalledWith('deploy');
    expect(screen.getByRole('button', { name: /Preview on its way/ })).toBeTruthy();
    off();
  });

  it('when the day’s paid tasks at a building are used up, it says so kindly', () => {
    for (let i = 0; i < 4; i++) {
      act(() => useCity.getState().addTask(`c${i}`, 'Store my holiday photos cheaply'));
      send({ type: 'task.done', taskId: `c${i}`, ok: true, result: 'ok', xp: [{ serviceId: 'ec2', amount: 15 }] });
    }
    render(<TaskCard task={useCity.getState().tasks.c3} />);
    expect(screen.getByText(/full stars again tomorrow/)).toBeTruthy();
  });

  it('an unlinked practice account goes to Deploy to link first', () => {
    useCity.setState({ account: { linked: false } });
    act(() => useCity.getState().addTask('t2', 'Make a DynamoDB table for my app’s users'));
    send({ type: 'task.done', taskId: 't2', ok: true, result: 'Table ready.', xp: [] });
    render(<TaskCard task={useCity.getState().tasks.t2} openTab={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /See it in Deploy/ }));
    expect(plan).not.toHaveBeenCalled();
    expect(screen.getByText(/Link the practice account in Deploy first/)).toBeTruthy();
  });

  it('an agent offers a job as a little story, and Watch it done sends it', () => {
    render(<AgentOffer serviceId="s3" ask="Got holiday photos?" />);
    expect(screen.getByText(/Sally the Angler/)).toBeTruthy();
    expect(screen.getByText(/can store your holiday photos in S3 Lake, and you can watch every step/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Watch it done' }));
    expect(submit).toHaveBeenCalledWith('Store my holiday photos cheaply');
  });
});

describe('the building card', () => {
  it('separates asking a question (the HQ chat) from a job done for you (Watch it done)', () => {
    useCity.setState({ selected: 's3' });
    const openTab = vi.fn();
    render(<LandmarkCard layout="panel" openTab={openTab} />);
    fireEvent.click(screen.getByRole('button', { name: /Watch it done/ }));
    expect(submit).toHaveBeenCalledWith('Store my holiday photos cheaply');
    // The task stays on this card (its live TaskCard shows under the button): no jump to another screen.
    expect(openTab).not.toHaveBeenCalledWith('feed');
    fireEvent.click(screen.getByRole('button', { name: /Ask a question/ }));
    expect(useCity.getState().view).toEqual({ name: 'interior', districtId: 'storage' });
  });
});

describe('the Drawing board', () => {
  it('introduces itself, guides the first time, and a pass pays City Coins, not stars', () => {
    // A quest waiting on its "draw a design" step (Draw It Once, Build It Anywhere: step 5 of 6).
    useCity.setState({ progress: { ...base(), quests: { 'cloudformation-blueprints': { status: 'active', step: 4, count: 0 } } } });
    const { container } = render(<Sandbox />);
    expect(screen.getByRole('heading', { name: /Drawing board/ })).toBeTruthy();
    // One sentence on how it differs from Puzzles.
    expect(screen.getByText(/A blank page for your own ideas: Puzzles give you a brief/)).toBeTruthy();
    expect(screen.getByRole('note').textContent).toMatch(/three services wired with arrows that point the way requests go/);
    // The intro and the button use the same words.
    expect(screen.getByRole('note').textContent).toMatch(/➜ Draw an arrow/);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('note')).toBeNull();
    // Users → S3 → Lambda → IAM… wired with arrows.
    // The board is a grid of square buttons: find them by label with CSS, not getByRole (which computes every
    // button's accessible name on each call and made this test time out under a full parallel run).
    const cell = (x: number, y: number) => container.querySelector(`[aria-label$="row ${y + 1} column ${x + 1}"]`)!;
    const pieces = () => [...container.querySelectorAll<HTMLButtonElement>('.sb-piece')];
    const put = (piece: RegExp, x: number, y: number) => {
      fireEvent.click(pieces().find((b) => piece.test((b.textContent ?? '').trim()))!);
      fireEvent.click(cell(x, y));
    };
    put(/Users/, 0, 0);
    put(/^S3/, 2, 0);
    put(/Lambda/, 4, 0);
    put(/IAM/, 4, 2);
    const arrow = (a: [number, number], b: [number, number]) => {
      fireEvent.click(pieces().find((b) => /Draw an arrow/.test(b.textContent ?? ''))!);
      fireEvent.click(cell(...a));
      fireEvent.click(cell(...b));
    };
    arrow([0, 0], [2, 0]);
    arrow([2, 0], [4, 0]);
    arrow([4, 0], [4, 2]);
    const stars = starsEarned(useCity.getState().progress);
    fireEvent.click(screen.getByRole('button', { name: 'Review my design' }));
    const review = screen.getByRole('status', { name: 'Design review' });
    expect(review.textContent).toMatch(/Passed! \+15\s*for S3 Lake, Lambda Food Stall, IAM Gatehouse/);
    // The coin is the pixel icon, named for screen readers; the verdict sits next to the button too.
    expect(review.querySelector('svg.coin[aria-label="City Coins"]')).toBeTruthy();
    expect(container.querySelector('.sandbox-verdict.pass')?.textContent).toMatch(/Passed! \+15/);
    expect(coins(useCity.getState().progress)).toBe(15);
    expect(starsEarned(useCity.getState().progress)).toBe(stars);
    expect(useCity.getState().progress.quests?.['cloudformation-blueprints']?.step).toBe(5);
  });
});

describe('My City, the progress hub', () => {
  it('shows ⭐, 🪙, 💡 and crowns, then City Lights, the season road, City Hall and the Service Codex', () => {
    // Everything on (Simple mode's My City shows buildings, stars and coins only: tests/simple-ui.test.tsx).
    useCity.setState({ prefs: { ...useCity.getState().prefs, simple: false }, progress: { ...base(), wallet: { earned: 50, spent: 8 }, streak: { days: 3, last: '2026-10-19', best: 5 }, lights: { days: ['2026-10-18', '2026-10-19'], total: 2, freezes: 1 } } });
    act(() => useCity.getState().openCollection(true));
    render(<Collection />);
    const nums = screen.getByRole('list', { name: 'Your numbers' }).textContent ?? '';
    expect(nums).toMatch(/⭐ 210 stars learned/);
    expect(nums).toMatch(/42 City Coins/);
    expect(nums).toMatch(/👑 0 crowns/);
    expect(nums).toMatch(/💡 \d+ windows? glowing/);
    expect(screen.getByRole('heading', { name: /City Lights/ })).toBeTruthy();
    expect(screen.getByText(/1 freeze held/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Season road/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /City Hall · level \d/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Service Codex/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Combos 0\// })).toBeTruthy();
  });
});
