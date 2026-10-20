// @vitest-environment jsdom
// The React cards and the ticker, rendered for real: what a player sees, and what the keyboard does.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The portraits read the character sheets Phaser loads; the cards only need a stand-in here.
vi.mock('@/ui/Portrait', () => ({ Portrait: () => <span data-testid="portrait" /> }));

const { useCity } = await import('@/state/store');
const { demoHealth, demoNews } = await import('@/backend/mockAccount');
const { IncidentCard } = await import('@/ui/IncidentCard');
const { ChoiceCard } = await import('@/ui/ChoiceCard');
const { NewsTicker } = await import('@/ui/NewsTicker');
const { ErrorBoundary } = await import('@/ui/ErrorBoundary');
const { choiceById } = await import('@/world/content');
const { Flashcards } = await import('@/ui/Flashcards');

const bahrain = () => useCity.getState().health!.incidents.find((i) => i.region === 'me-south-1')!;

beforeEach(() => {
  useCity.setState({ health: demoHealth(new Date('2026-10-11T12:00:00Z')), news: demoNews(), incidentOpen: undefined, choiceOpen: undefined });
});
afterEach(() => cleanup());

describe('the AWS status ticker', () => {
  it("leads with the worst open incident in this city's Region, and tapping it opens the card", () => {
    useCity.setState({ cityRegion: 'me-central-1' });
    render(<NewsTicker />);
    const line = screen.getByRole('button', { name: /AWS Health: .*disrupted/ });
    // Plain words first: it's AWS's trouble, not the player's city.
    expect(line.textContent).toMatch(/your city is fine/);
    fireEvent.click(line);
    expect(useCity.getState().incidentOpen).toBeTruthy();
  });

  it('elsewhere, a weeks-old outage waits behind fresh AWS news', () => {
    useCity.setState({ cityRegion: 'us-west-2' });
    render(<NewsTicker />);
    expect(screen.getByRole('button', { name: /^AWS news: / })).toBeTruthy();
  });

  it('says nothing when there is nothing to say', () => {
    useCity.setState({ health: undefined, news: undefined });
    const { container } = render(<NewsTicker />);
    expect(container.innerHTML).toBe('');
  });
});

describe('an incident card', () => {
  it('is a labelled dialog: focus on Close, AWS’s words, the lesson, and Escape closes it', () => {
    const openTab = vi.fn();
    act(() => useCity.getState().openIncident(bahrain().id));
    render(<IncidentCard openTab={openTab} />);
    const dialog = screen.getByRole('dialog', { name: /Increased Error Rates/ });
    expect(dialog).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText(/Why a second Region matters/)).toBeTruthy();
    expect(dialog.textContent).toMatch(/Affected Availability Zone ID: mes1-az2/);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useCity.getState().incidentOpen).toBeUndefined();
  });

  it('Try the drill opens the Region-down puzzle', () => {
    const openTab = vi.fn();
    act(() => useCity.getState().openIncident(bahrain().id));
    render(<IncidentCard openTab={openTab} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try the drill' }));
    expect(openTab).toHaveBeenCalledWith('arch');
    expect(useCity.getState().focusPuzzle).toBe('region-down');
    expect(useCity.getState().incidentOpen).toBeUndefined();
  });

  it('keeps Tab inside the card', () => {
    act(() => useCity.getState().openIncident(bahrain().id));
    render(<IncidentCard openTab={() => {}} />);
    const buttons = screen.getByRole('dialog').querySelectorAll<HTMLElement>('button');
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);
  });
});

describe('a quest question', () => {
  it('a wrong answer explains and stays open; the right one completes the step', () => {
    const { quest } = choiceById('ec2-spot')!;
    const at = quest.steps.findIndex((s) => s.kind === 'choose' && s.id === 'ec2-spot');
    const p = useCity.getState().progress;
    act(() => useCity.setState({ progress: { ...p, quests: { ...p.quests, [quest.id]: { status: 'active', step: at, count: 0 } } } }));
    act(() => useCity.getState().openChoice('ec2-spot'));
    render(<ChoiceCard />);
    fireEvent.click(screen.getByRole('button', { name: /Dedicated Hosts/ }));
    expect(screen.getByText(/Not quite/)).toBeTruthy();
    expect(useCity.getState().progress.quests![quest.id].step).toBe(at);
    fireEvent.click(screen.getByRole('button', { name: /Spot Instances/ }));
    expect(screen.getByText(/Right!/)).toBeTruthy();
    expect(useCity.getState().progress.quests![quest.id].step).toBe(at + 1);
  });
});

describe('the error boundary', () => {
  it('shows a plain sentence instead of a blank panel, and Try again redraws', () => {
    let broken = true;
    const Flaky = () => {
      if (broken) throw new Error('boom');
      return <p>All good</p>;
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary what="This tab">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/This tab hit a snag/);
    expect(screen.queryByText(/boom/)).toBeNull();
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('All good')).toBeTruthy();
    spy.mockRestore();
  });
});

describe('explain it back', () => {
  it('asks one question, waits for a few words, then shows the key ideas used and the agent’s reply', async () => {
    const { ExplainBack } = await import('@/ui/ExplainBack');
    const { QUESTS } = await import('@/world/content');
    const q = QUESTS[0];
    render(<ExplainBack quest={q} />);
    fireEvent.click(screen.getByRole('button', { name: /Explain it back/ }));
    const box = screen.getByRole('textbox', { name: /In your own words/ });
    fireEvent.change(box, { target: { value: 'a bucket' } });
    expect(screen.getByRole('button', { name: /more words/ })).toHaveProperty('disabled', true);
    fireEvent.change(box, { target: { value: 'S3 keeps each file as an object in a bucket so it is safe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check my answer' }));
    expect(screen.getByText(/You used: .*bucket/)).toBeTruthy();
  });
});

describe('flashcard keys', () => {
  const flipped = (c: HTMLElement) => !!c.querySelector('.flash.back');

  it('F flips the card in the city, but not while a mini-game is open (its keys are its own)', () => {
    const p = useCity.getState().progress;
    useCity.setState({ progress: { ...p, landmarks: { ...p.landmarks, s3: { discovered: true, xp: 0 } } }, selected: 's3', view: { name: 'game', game: 'fishing' } as never });
    const { container } = render(<Flashcards />);
    fireEvent.keyDown(window, { key: 'f' });
    expect(flipped(container)).toBe(false);
    act(() => useCity.setState({ view: { name: 'city' } }));
    fireEvent.keyDown(window, { key: 'f' });
    expect(flipped(container)).toBe(true);
  });

  it('a tap anywhere on the question flips it (its terms are marked, not buttons); the answer side lets you tap them', async () => {
    const { cardsFor } = await import('@/world/content');
    const { splitTerms, termsWithout } = await import('@/world/glossary');
    // An EC2 question with a glossary term in it ("What is an AMI?"), the only one due.
    const card = cardsFor('ec2').find((c) => splitTerms(c.q, termsWithout('ec2')).some((x) => typeof x !== 'string'))!;
    const p = useCity.getState().progress;
    const others = Object.fromEntries(cardsFor('ec2').filter((c) => c !== card).map((c) => [c.id, { interval: 5, ease: 2.5, due: Date.now() + 5 * 86_400_000, reps: 2 }]));
    useCity.setState({ progress: { ...p, landmarks: { ec2: { discovered: true, xp: 0 } }, cards: others, quests: {} }, selected: 'ec2', view: { name: 'city' } });
    const { container } = render(<Flashcards />);
    expect(container.querySelectorAll('.flash-face.front button.term')).toHaveLength(0);
    fireEvent.click(container.querySelector('.flash-face.front .flash-hit')!);
    expect(flipped(container)).toBe(true);
    expect(container.querySelectorAll('.flash-face.back-face .flash-q button.term').length).toBeGreaterThan(0);
  });

  it('"learned" counts cards known, not cards seen: a "Didn’t know" leaves it at 0', () => {
    const p = useCity.getState().progress;
    useCity.setState({ progress: { ...p, landmarks: { dynamodb: { discovered: true, xp: 0 } }, cards: {}, quests: {} }, selected: 'dynamodb', view: { name: 'city' } });
    const { container } = render(<Flashcards />);
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyDown(window, { key: '1' });
    expect(container.querySelector('.deck-progress')?.textContent).toMatch(/ 0 of \d+ learned/);
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyDown(window, { key: '2' });
    expect(container.querySelector('.deck-progress')?.textContent).toMatch(/ 1 of \d+ learned/);
  });
});

describe('the Build tab', () => {
  it('prices sit behind "For AWS learners"; a new preview scrolls into view with focus on Approve', async () => {
    const { DeployPanel } = await import('@/ui/DeployPanel');
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    useCity.setState({ account: { linked: true, accountId: '123456789012', region: 'us-west-2' }, deploys: {} });
    const { container } = render(<DeployPanel />);
    for (const tpl of container.querySelectorAll('.tpl')) expect(tpl.querySelector('.for-learners')?.textContent).toMatch(/💰/);
    expect(scrolled).not.toHaveBeenCalled();
    const preview = { deployId: 'd1', templateId: 'static-site', stackName: 'aws-city-site', region: 'us-west-2', changes: [], status: 'preview' as const };
    act(() => useCity.setState({ deploys: { d1: preview } }));
    const approve = screen.getByRole('button', { name: /Approve & deploy/ });
    expect(document.activeElement).toBe(approve);
    expect(scrolled).toHaveBeenCalled();
  });
});

describe('an architecture puzzle', () => {
  it('a first puzzle deals one decoy, and an unfinished design is there when it opens again', async () => {
    const { ArchitectureBoard } = await import('@/ui/ArchitectureBoard');
    const { PUZZLES } = await import('@/world/content');
    const { slotsOf } = await import('@/learning/diagram');
    const { draftKey } = await import('@/learning/puzzleDraft');
    const p = PUZZLES[0];
    const slot = slotsOf(p).find((s) => s.required)!;
    localStorage.setItem(draftKey(p.id), JSON.stringify({ placements: { [slot.id]: slot.service }, drops: [], misdrops: 0, revealed: [] }));
    const prog = useCity.getState().progress;
    useCity.setState({ progress: { ...prog, puzzles: {} }, focusPuzzle: p.id });
    const { container } = render(<ArchitectureBoard />);
    expect(screen.getByText(/your design is where you left it/)).toBeTruthy();
    expect(container.querySelector('.arch-label .muted')?.textContent).toMatch(/· 1\//);
    // The tray holds the services the design needs plus one decoy, not the whole deck.
    expect(container.querySelectorAll('.tray .svc').length).toBeLessThanOrEqual(new Set(p.required).size + 1);
    localStorage.clear();
  });
});

describe('quest cards that never stall', () => {
  it('follows the selected building to its deck, and tops a quest up with practice cards when nothing is due', async () => {
    const { cardsFor } = await import('@/world/content');
    const later = Date.now() + 5 * 86_400_000;
    const cards = Object.fromEntries([...cardsFor('s3'), ...cardsFor('lambda')].map((c) => [c.id, { interval: 5, ease: 2.5, due: later, reps: 2 }]));
    const p = useCity.getState().progress;
    useCity.setState({
      view: { name: 'city' },
      selected: 'lambda',
      progress: { ...p, landmarks: { s3: { discovered: true, xp: 0 }, lambda: { discovered: true, xp: 0 } }, cards, quests: { 'storage-static-site': { status: 'active', step: 1, count: 0 } } },
    });
    const { container } = render(<Flashcards />);
    // Lambda has nothing due and no quest: all caught up
    expect(screen.getByText('All caught up')).toBeTruthy();
    // the quest's Go → selects S3: the deck follows, and its cards come as practice
    act(() => useCity.setState({ selected: 's3' }));
    expect(container.querySelector('.flash-meta')?.textContent).toMatch(/practice for your quest/);
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyDown(window, { key: '2' });
    expect(useCity.getState().progress.quests!['storage-static-site']!.count).toBe(1);
    expect(screen.getByRole('status').textContent).toMatch(/practice/);
  });

  it('says when a graded card comes back', () => {
    const p = useCity.getState().progress;
    useCity.setState({ view: { name: 'city' }, selected: 'dynamodb', progress: { ...p, landmarks: { dynamodb: { discovered: true, xp: 0 } }, cards: {}, quests: {} } });
    render(<Flashcards />);
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyDown(window, { key: '3' });
    expect(screen.getByText(/That card comes back in 3 days/)).toBeTruthy();
  });
});

describe('a citizen’s question', () => {
  it('stays open on a stray tap outside; ✕ closes it unanswered without using up a question; an answer counts', async () => {
    const { RequestCard } = await import('@/ui/RequestCard');
    const { bus } = await import('@/state/bus');
    localStorage.setItem('awscity.requests', JSON.stringify({ day: (await import('@/state/progress')).dayKey(), n: 2 }));
    const { container } = render(<RequestCard />);
    act(() => bus.emit('citizenRequest', { request: { cardId: 's3-01', serviceId: 's3', question: 'What is S3?', options: ['a', 'b', 'c'], right: 0, answer: 'a' }, name: 'Pat' }));
    fireEvent.click(container.querySelector('.finding-scrim')!);
    expect(screen.getByRole('dialog')).toBeTruthy();
    // The backdrop is modal for the city too: the presses Phaser hears on the window stop at the scrim.
    const heard = vi.fn();
    window.addEventListener('mousedown', heard);
    window.addEventListener('mouseup', heard);
    window.addEventListener('touchstart', heard);
    fireEvent.mouseDown(container.querySelector('.finding-scrim')!);
    fireEvent.mouseUp(container.querySelector('.finding-scrim')!);
    fireEvent.touchStart(container.querySelector('.request-q')!);
    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener('mousedown', heard);
    window.removeEventListener('mouseup', heard);
    window.removeEventListener('touchstart', heard);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.parse(localStorage.getItem('awscity.requests')!).n).toBe(2);
    const done: boolean[] = [];
    const off = bus.on('citizenRequestDone', ({ answered }) => done.push(answered));
    act(() => bus.emit('citizenRequest', { request: { cardId: 's3-01', serviceId: 's3', question: 'What is S3?', options: ['a', 'b', 'c'], right: 0, answer: 'a' }, name: 'Pat' }));
    fireEvent.click(container.querySelector('.request-option')!);
    expect(JSON.parse(localStorage.getItem('awscity.requests')!).n).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the city' }));
    expect(done).toEqual([true]);
    off();
  });
});

describe('Today’s game chip', () => {
  it('opens this week’s game if its building is up, else the lowest-level building with a game', async () => {
    const { gameBuilding } = await import('@/ui/Home');
    const { TIER_XP } = await import('@/world/places');
    const base = { version: 2 as const, landmarks: {}, updatedAt: '' };
    const p = { ...base, cities: { 'us-west-2': { landmarks: { s3: { discovered: true, xp: TIER_XP[3] }, lambda: { discovered: true, xp: 0 } } } } };
    expect(gameBuilding(p, 'us-west-2', 's3')).toBe('s3');
    expect(gameBuilding(p, 'us-west-2', 'ec2')).toBe('lambda');
    expect(gameBuilding(base, 'us-west-2', 's3')).toBeUndefined();
  });
});

describe('the HUD and My City', () => {
  it('a game shows its own name, the demo says "Demo", the HUD shows only ⭐ 🪙 💡, and My City counts buildings', async () => {
    const { Hud } = await import('@/ui/Hud');
    const { Collection } = await import('@/ui/Collection');
    const p = useCity.getState().progress;
    const region = useCity.getState().cityRegion;
    // Two buildings put up, one still new (level 0): both count as put up, in the HUD and in My City.
    useCity.setState({
      backendKind: 'mock',
      view: { name: 'game', game: 'dynamodb' },
      prefs: { ...useCity.getState().prefs, region, simple: false },
      progress: { ...p, cities: { [region]: { landmarks: { s3: { discovered: true, xp: 400 }, lambda: { discovered: true, xp: 0 } } } } },
    } as never);
    const { container } = render(<Hud layout="panel" />);
    expect(container.querySelector('.where')?.textContent).toBe('Sorting Office');
    expect(container.querySelector('.dot-short')?.textContent).toBe('Demo');
    // Three numbers, one meaning each: stars (never spent), City Coins (what Decorate spends), the streak.
    expect(container.querySelector('.progress-readout')?.textContent?.replace(/\s+/g, ' ').trim()).toMatch(/^⭐ 400 stars· 0 City Coins·💡 \d+ windows? lit$/);
    // The coin is the pixel icon, never the 🪙 emoji (a grey ball without a colour emoji font).
    expect(container.querySelector('.hud-coins svg.coin')).toBeTruthy();
    act(() => useCity.getState().openCollection(true));
    render(<Collection />);
    const row = [...document.querySelectorAll('.collection-stats li')].find((li) => li.textContent?.startsWith('Buildings put up'));
    expect(row?.textContent).toMatch(/^Buildings put up2\//);
    act(() => useCity.getState().openCollection(false));
    useCity.setState({ view: { name: 'city' } });
  });
});

describe('the HUD’s small helpers', () => {
  it('a one-time note says where City Coins go, and the rush-hour chip shows while the city’s rush hour runs', async () => {
    const { Hud } = await import('@/ui/Hud');
    const { setRushHour } = await import('@/game/rush');
    const p = useCity.getState().progress;
    const region = useCity.getState().cityRegion;
    localStorage.removeItem('awscity.tip.coins');
    useCity.setState({ view: { name: 'city' }, prefs: { ...useCity.getState().prefs, region, simple: false }, progress: { ...p, wallet: { earned: 20, spent: 0 } } } as never);
    const { container } = render(<Hud layout="panel" />);
    expect(screen.getByRole('note').textContent).toMatch(/spend them on decorations in 🌳 Decorate/);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(localStorage.getItem('awscity.tip.coins')).toBe('1');
    expect(container.querySelector('.hud-rush')).toBeNull();
    act(() => setRushHour(true));
    expect(container.querySelector('.hud-rush')?.textContent).toMatch(/Rush hour/);
    act(() => setRushHour(false));
    expect(container.querySelector('.hud-rush')).toBeNull();
  });
});

describe('the City tab: today’s shift', () => {
  it('has one big button that says exactly what happens, and the quests’ buttons say what they do', async () => {
    const { Home } = await import('@/ui/Home');
    const { QUESTS } = await import('@/world/content');
    const { setNextRunner } = await import('@/state/next');
    const region = useCity.getState().cityRegion;
    const q = QUESTS[0];
    useCity.setState({
      view: { name: 'city' },
      prefs: { ...useCity.getState().prefs, region, simple: false },
      progress: { version: 2, landmarks: {}, updatedAt: '', quests: { [q.id]: { status: 'active', step: 1, count: 0 } }, cities: { [region]: { landmarks: { s3: { discovered: true, xp: 0 } } } } },
    } as never);
    const ran: string[] = [];
    const off = setNextRunner((p) => ran.push(p.kind));
    const opened: string[] = [];
    const { container } = render(<Home openTab={(t) => opened.push(t)} />);
    const primary = [...container.querySelectorAll('.btn.primary')];
    expect(primary).toHaveLength(1);
    // A cards step: the button names the action and the tab it opens.
    expect(primary[0].textContent).toMatch(/^Review \d+ S3 Lake cards? \(opens Learn\)$/);
    fireEvent.click(primary[0]);
    expect(ran).toEqual(['step']);
    off();
    // More to do → Quests: the active step's button is labelled by its kind, never a bare "Go".
    expect(container.querySelector('.quests-fold button.btn.tiny')?.textContent).toBe('Open cards (Learn)');
    // The building the big button points at isn't listed again under Ready to upgrade.
    expect(container.querySelector('.ready')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Go\b/ })).toBeNull();
  });
});
