import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { canReconnect, canSignIn, openFullCity, openLeaderboard, reconnect, setAutoSnap, signIn, type Layout } from '@/app/runtime';
import { chime, isMuted, onMuteChange, setMuted } from '@/game/audio';
import { isRushNow, subscribeRush } from '@/game/rush';
import { bus } from '@/state/bus';
import { useCity } from '@/state/store';
import { districtById } from '@/world/taxonomy';
import { starsEarned } from '@/state/buildmode';
import { coins } from '@/state/wallet';
import { lightsLine } from '@/state/lights';
import { glowingNow } from './Loops';
import { useBump } from './feedback';
import { connectionLabel, DEMO_KEY, GAME_NAMES, isDemo, readPref, setDemo, TIP_COINS_KEY, writePref } from './logic';
import { Coin, Icon } from './icons';
import { RankChip } from './Collection';
import { openEverything, useLocked } from './useLadder';
import { OsmCredit } from './Minimap';
import { BuildToggle } from './BuildDrawer';
import { isSimple, shows } from '@/state/simple';
import { useTodo } from './today';


/**
 * The first time the player has City Coins, a one-time note under the counter says where they go (Decorate). "Got it"
 * (or opening Decorate) puts it away for good on this device. It hangs just under the coin counter but always inside
 * the map (the full tab's side column and tab bar sit under the HUD too; the panel's map is short): placed from both
 * boxes, and only its button takes taps, so it never covers the tabs or blocks a click.
 */
function CoinsTip({ wallet }: { wallet: number }) {
  const [seen, setSeen] = useState(() => readPref(TIP_COINS_KEY) === '1');
  const building = useCity((s) => !!s.build);
  // Only on the city itself: a mini-game, an HQ or the world map keeps its own screen clear.
  const inCity = useCity((s) => s.view.name === 'city');
  const done = () => (writePref(TIP_COINS_KEY, '1'), setSeen(true));
  useEffect(() => {
    if (building && !seen) done();
  }, [building, seen]);
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<CSSProperties>({});
  const show = !seen && wallet > 0 && inCity;
  useLayoutEffect(() => {
    if (!show) return;
    const place = () => {
      const chip = ref.current?.parentElement?.getBoundingClientRect();
      const map = document.querySelector('.stage')?.getBoundingClientRect();
      // No map on this page (a test, a game's own screen): the stylesheet's place under the counter.
      if (!chip || !map) return setAt({});
      if (map.width < 120) return setAt({ visibility: 'hidden' });
      const pad = 8;
      const right = Math.min(chip.right, map.right - pad);
      setAt({ position: 'fixed', top: Math.max(chip.bottom + 6, map.top + pad), right: window.innerWidth - right, maxWidth: Math.min(260, right - map.left - pad) });
    };
    place();
    // The panel's map grows and shrinks on request: follow it, and the window.
    const stage = document.querySelector('.stage');
    const ro = typeof ResizeObserver === 'function' && stage ? new ResizeObserver(place) : undefined;
    if (stage) ro?.observe(stage);
    window.addEventListener('resize', place);
    return () => (ro?.disconnect(), window.removeEventListener('resize', place));
  }, [show]);
  if (!show) return null;
  return (
    <span ref={ref} className="hud-tip" role="note" style={at}>
      <span>
        <b>City Coins</b>: spend them on decorations in 🌳 Decorate. Stars ⭐ are never spent.
      </span>
      <button className="btn tiny" onClick={done}>
        Got it
      </button>
    </span>
  );
}

/** "🚦 Rush hour" while the city's rush hour runs (src/game/rush.ts, set by the city scene): why the roads are busy. */
function RushChip() {
  const rush = useSyncExternalStore(subscribeRush, isRushNow, isRushNow);
  if (!rush) return null;
  return (
    <span className="hud-rush" role="status" title="Rush hour (8–9 and 17–18): more learning couriers drive between buildings, and Auto Scaling adds workers at EC2 and Lambda.">
      <span aria-hidden="true">🚦</span>
      <span className="hud-rush-word"> Rush hour</span>
    </span>
  );
}

/** Simple mode's "To do 2/4": how many of today's tasks are done (the City tab's To-do list says which). */
function TodoChip() {
  const { done, of } = useTodo();
  if (!of) return null;
  return (
    <>
      <span className="sep" aria-hidden="true">
        ·
      </span>
      <span className={`hud-todo ${done >= of ? 'all' : ''}`} title="Today’s To-do list is in the City tab">
        <span aria-hidden="true">{done >= of ? '✅' : '☑️'} </span>
        To do{' '}
        <b>
          {done}/{of}
        </b>
      </span>
    </>
  );
}

/** Switches between the offline demo and signing in. The backend is picked once at startup, so the page reloads. */
function switchDemo(on: boolean) {
  setDemo(on);
  location.reload();
}

function ConnectionPill() {
  const status = useCity((s) => s.backendStatus);
  const kind = useCity((s) => s.backendKind);
  const signingIn = useCity((s) => s.signingIn);
  // Derived during render (React's "previous renders" pattern), so the label never lags a render behind.
  const [wasConnected, setWasConnected] = useState(false);
  if (status === 'connected' && !wasConnected) setWasConnected(true);
  const label = connectionLabel(kind, status, wasConnected);
  const cls = kind === 'mock' ? 'mock' : status;
  const where = kind === 'mock' ? 'an offline demo that creates nothing real' : 'the AWS City server';
  // The side panel and the full tab follow each other into (or out of) the demo, so neither keeps the other mode.
  useEffect(() => {
    const follow = (e: StorageEvent) => {
      if (e.key === DEMO_KEY) location.reload();
    };
    addEventListener('storage', follow);
    return () => removeEventListener('storage', follow);
  }, []);

  return (
    <span className="conn">
      {/* In the 400 px side panel the word hides (still read out) and the dot alone stays: nothing truncates. */}
      <span className={`dot ${cls}`} role="status" title={`Backend: ${where} · ${label}`}>
        <span className="dot-word">{label}</span>
        {/* The panel has room for one short word: the demo says so ("Demo"), not just a grey dot. */}
        {kind === 'mock' && (
          <span className="dot-short" aria-hidden="true">
            Demo
          </span>
        )}
      </span>
      {kind !== 'mock' && (status === 'disconnected' || status === 'error') && canReconnect() && (
        <button className="btn tiny" onClick={reconnect}>
          Retry
        </button>
      )}
      {kind !== 'mock' && status === 'signed-out' && canSignIn() && (
        <button className="btn tiny primary" onClick={signIn} disabled={signingIn} aria-busy={signingIn}>
          {signingIn ? 'Signing in…' : 'Sign in'}
        </button>
      )}
      {kind !== 'mock' && status === 'signed-out' && canSignIn() && !signingIn && (
        <button className="btn tiny" onClick={() => switchDemo(true)} title="Play offline: nothing real is created, and nothing is saved to an account">
          Play the demo
        </button>
      )}
    </span>
  );
}

/** Everything that isn't needed every minute, in one flat list: sound, chatter, peek, tour, full city, the Lookout. */
function MoreMenu({ layout }: { layout: Layout }) {
  const [open, setOpen] = useState(false);
  // Follows the toggle on another surface too (the side panel and the full tab share it).
  const muted = useSyncExternalStore(onMuteChange, isMuted);
  const autoSnap = useCity((s) => s.autoSnap);
  const chatter = useCity((s) => s.prefs.chatter);
  const mapDetails = useCity((s) => !!s.prefs.mapDetails);
  // A postcard is of the city: not offered on the world map (the caption names the city).
  const inCity = useCity((s) => s.view.name !== 'world');
  const cityView = useCity((s) => s.view.name === 'city');
  const textSize = useCity((s) => s.prefs.textSize ?? 100);
  const contrast = useCity((s) => !!s.prefs.contrast);
  const easyFont = useCity((s) => !!s.prefs.easyFont);
  const relaxed = useCity((s) => !!s.prefs.relaxed);
  const captions = useCity((s) => !!s.prefs.captions);
  const builder = useCity((s) => !!s.prefs.builder);
  const setPref = useCity((s) => s.setPref);
  const setTourOpen = useCity((s) => s.setTourOpen);
  const inDemo = useCity((s) => s.backendKind) === 'mock' && isDemo();
  const locked = useLocked();
  const simple = useCity((s) => isSimple(s.prefs));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  return (
    <div className="more" ref={box}>
      <button className="btn icon ghost" aria-haspopup="menu" aria-expanded={open} aria-label="More" title="More" onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button
            role="menuitemcheckbox"
            aria-checked={!muted}
            onClick={() => {
              setMuted(!muted);
              if (muted) chime();
            }}
          >
            <span>Sound effects</span>
            <span className={`switch ${muted ? '' : 'on'}`} aria-hidden="true" />
          </button>
          <button role="menuitemcheckbox" aria-checked={chatter} onClick={() => setPref('chatter', !chatter)}>
            <span>Agents chat in the city</span>
            <span className={`switch ${chatter ? 'on' : ''}`} aria-hidden="true" />
          </button>
          <button role="menuitemcheckbox" aria-checked={mapDetails} onClick={() => setPref('mapDetails', !mapDetails)}>
            <span>Show the map details</span>
            <span className={`switch ${mapDetails ? 'on' : ''}`} aria-hidden="true" />
          </button>
          <hr />
          <div className="menu-label" role="presentation">
            Accessibility
          </div>
          <button
            role="menuitem"
            aria-label={`Text size: ${textSize}%. Choose to make it bigger.`}
            onClick={() => setPref('textSize', textSize === 100 ? 125 : textSize === 125 ? 150 : undefined)}
          >
            <span>Text size</span>
            <span className="menu-value">{textSize}%</span>
          </button>
          <button role="menuitemcheckbox" aria-checked={contrast} onClick={() => setPref('contrast', contrast ? undefined : true)}>
            <span>High contrast</span>
            <span className={`switch ${contrast ? 'on' : ''}`} aria-hidden="true" />
          </button>
          <button role="menuitemcheckbox" aria-checked={easyFont} onClick={() => setPref('easyFont', easyFont ? undefined : true)}>
            <span>Easy-read font</span>
            <span className={`switch ${easyFont ? 'on' : ''}`} aria-hidden="true" />
          </button>
          <button
            role="menuitemcheckbox"
            aria-checked={relaxed}
            title="Rounds end when you press Done, and everything moves slower"
            onClick={() => setPref('relaxed', relaxed ? undefined : true)}
          >
            <span>Games without a clock</span>
            <span className={`switch ${relaxed ? 'on' : ''}`} aria-hidden="true" />
          </button>
          <button role="menuitemcheckbox" aria-checked={captions} title="A short caption for each sound" onClick={() => setPref('captions', captions ? undefined : true)}>
            <span>Sound captions</span>
            <span className={`switch ${captions ? 'on' : ''}`} aria-hidden="true" />
          </button>
          <button
            role="menuitemcheckbox"
            aria-checked={builder}
            title="Every area open, and the deeper “For AWS learners” text shown first"
            onClick={() => {
              setPref('builder', builder ? undefined : true);
              if (!builder) openEverything();
            }}
          >
            <span>I already build on AWS</span>
            <span className={`switch ${builder ? 'on' : ''}`} aria-hidden="true" />
          </button>
          {/* Simple mode (the default) ↔ Everything: one switch, and "Show everything" also opens every locked area. */}
          {simple ? (
            <button
              role="menuitem"
              title="Show every extra (rank, City Lights, season road, Codex, news, the Drawing board…) and open every tab and panel now"
              onClick={run(() => {
                setPref('simple', false);
                if (locked.length > 0) openEverything();
              })}
            >
              Show everything
            </button>
          ) : (
            <button role="menuitem" title="Back to a plain To-do list: the extras hide (nothing you earned is lost)" onClick={run(() => setPref('simple', undefined))}>
              Keep it simple
            </button>
          )}
          <hr />
          <button role="menuitem" onClick={run(() => useCity.getState().openCollection(true))}>
            🏙️ My City: everything you've earned
          </button>
          <button role="menuitem" title="Weekly leaderboards, and whether other players can see you" onClick={run(() => openLeaderboard(`mayors:${useCity.getState().cityRegion}`))}>
            🏆 Leaderboards and live city
          </button>
          {cityView && <BuildToggle menu={() => setOpen(false)} />}
          {inCity && (
            <button role="menuitem" title="Download a picture of your city as it is now (nothing is uploaded)" onClick={run(() => bus.emit('postcard'))}>
              📸 Save a postcard of my city
            </button>
          )}
          <button role="menuitem" onClick={run(() => setTourOpen(true))}>
            Replay the tour
          </button>
          {layout === 'panel' && (
            <button role="menuitem" onClick={run(openFullCity)}>
              Open the full city in a tab ↗
            </button>
          )}
          {layout === 'panel' && (
            <button role="menuitemcheckbox" aria-checked={autoSnap} onClick={() => setAutoSnap(!autoSnap)}>
              <span>Lookout watches my AWS pages</span>
              <span className={`switch ${autoSnap ? 'on' : ''}`} aria-hidden="true" />
            </button>
          )}
          {inDemo && (
            <button role="menuitem" onClick={() => switchDemo(false)}>
              Sign in to save your city
            </button>
          )}
          <hr />
          <div className="menu-label" role="presentation">
            Credits
          </div>
          <div className="menu-credit" role="presentation">
            Street maps: <OsmCredit /> (ODbL 1.0)
          </div>
        </div>
      )}
    </div>
  );
}

export function Hud({ layout }: { layout: Layout }) {
  const progress = useCity((s) => s.progress);
  const view = useCity((s) => s.view);
  const setView = useCity((s) => s.setView);
  const hasCity = useCity((s) => !!s.prefs.region);
  const prefs = useCity((s) => s.prefs);
  const simple = isSimple(prefs);

  // Three numbers, one meaning each: ⭐ knowledge (every city's buildings; never spent), 🪙 City Coins (what Decorate
  // spends), 💡 City Lights (a window for each learning day, src/state/lights.ts). Everything else earned lives in My City.
  const xp = starsEarned(progress);
  const wallet = coins(progress);
  const lights = glowingNow(progress);
  const xpBump = useBump(xp);
  const coinBump = useBump(wallet);

  return (
    <header className="hud">
      {/* No city yet on a first run's world map: nothing to go back to. */}
      {view.name !== 'city' && hasCity ? (
        <button className="btn ghost tiny back" onClick={() => setView({ name: 'city' })}>
          <Icon name="back" size={10} /> City
        </button>
      ) : (
        <span className="logo">
          <b>AWS City</b>
        </span>
      )}
      {view.name === 'interior' && <span className="where">{view.districtId === 'spheres' ? 'The Spheres' : districtById(view.districtId)?.hq}</span>}
      {/* The game's own name ("Sorting Office"), never a cut-off "M…"; the panel drops the rank and online chips for it. */}
      {view.name === 'game' && (
        <span className="where" title="Mini-game">
          {GAME_NAMES[view.game] ?? 'Mini-game'}
        </span>
      )}
      <span className="progress-readout">
        <span className={xpBump ? 'bump' : undefined} title={`${xp} stars: what you've learned. Stars grow your buildings and are never spent.`}>
          <span aria-hidden="true">⭐ </span>
          <b>{xp}</b>
          <span className="sr-only"> stars</span>
        </span>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <span className={`hud-coins ${coinBump ? 'bump' : ''}`} title={`${wallet} City Coins to spend on decorations. Jobs, mini-games, workshops and the drawing board pay them.`}>
          <Coin size={14} /> <b>{wallet}</b>
          <span className="sr-only"> City Coins</span>
          <CoinsTip wallet={wallet} />
        </span>
        {simple && hasCity && <TodoChip />}
        {shows('cityLights', prefs) && (
          <>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <button className="hud-streak hud-lights" title={`City Lights: ${lightsLine(lights)}`} onClick={() => useCity.getState().openCollection(true)}>
          <span aria-hidden="true">💡 </span>
          <b>{lights.glowing}</b>
          <span className="sr-only"> {lights.glowing === 1 ? 'window' : 'windows'} lit</span>
        </button>
          </>
        )}
      </span>
      {hasCity && view.name === 'city' && shows('rushSurge', prefs) && <RushChip />}
      {hasCity && view.name === 'city' && <BuildToggle />}
      {hasCity && shows('rank', prefs) && <RankChip />}
      <ConnectionPill />
      <MoreMenu layout={layout} />
    </header>
  );
}
