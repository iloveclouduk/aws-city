import { Coin } from './icons';
import { useRef, type RefObject } from 'react';
import { isSimple } from '@/state/simple';
import { BADGES } from '@/state/badges';
import { bus } from '@/state/bus';
import { builtCities } from '@/state/cities';
import { PUZZLE_PASS } from '@/state/ladder';
import { levelOf } from '@/state/mastery';
import { cityRank, mayorOf, nextRankLine, RANKS } from '@/state/rank';
import { useCity } from '@/state/store';
import { TALKS } from '@/world/conference';
import { PUZZLES, QUESTS } from '@/world/content';
import { PLACES, placeFor } from '@/world/places';
import { regionInfo } from '@/world/regions';
import { SERVICES } from '@/world/taxonomy';
import { foundIn, TOKENS_PER_CITY } from '@/world/tokens';
import { WORKSHOPS } from '@/world/workshops';
import { useDialog } from './useDialog';
import { GAME_NAMES } from './logic';
import { Plain } from './Term';
import { openDocs } from '@/app/runtime';
import { isDiscovered } from '@/state/selectors';
import { AWS_SCALE, SCALE_FACTS } from '@/world/scale';
import { starsEarned } from '@/state/buildmode';
import { coins, coinsToday } from '@/state/wallet';
import { dayKey } from '@/state/progress';
import { OnlineChip } from './Leaderboard';
import { glowingNow, LoopsHub } from './Loops';


/**
 * My City, the one progress hub: everything the player has earned, in one place, and what earns the next of each. The
 * three numbers the HUD shows (⭐ knowledge, 🪙 City Coins, 💡 City Lights), the Mayor's rank for this city, crowns,
 * badges, then the loops that bring you back (City Lights, the season road, City Hall, the Service Codex with its
 * combos, and the rewards: src/ui/Loops.tsx), every city built, and the collections.
 */
export function Collection() {
  const open = useCity((s) => s.collectionOpen);
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const prefs = useCity((s) => s.prefs);
  const close = () => useCity.getState().openCollection(false);
  const box = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useDialog(open, box, close, closeBtn);
  if (!open) return null;
  if (isSimple(prefs)) return <SimpleCity close={close} box={box} closeBtn={closeBtn} />;
  const r = cityRank(progress, region);
  const cities = Object.keys(builtCities(progress));
  const earned = BADGES.filter((b) => b.earned(progress));
  const levels = SERVICES.map((s) => levelOf(progress, s.id, region)).filter((l) => l >= 1);
  // The HUD's count: every building put up in this city, a new one (level 0) included.
  const built = SERVICES.filter((s) => isDiscovered(progress, s.id, region)).length;
  const crowns = levels.reduce((n, l) => n + Math.max(0, l - 4), 0);
  const games: string[] = [...new Set(PLACES.flatMap((pl) => (pl.game ? [pl.game] : []))), 'launch'];
  const knownServices = SERVICES.filter((sv) => isDiscovered(progress, sv.id)).length;
  const today = dayKey();
  const lights = glowingNow(progress);
  const stat = (label: string, have: number, of: number) => (
    <li key={label}>
      <span>{label}</span>
      <b>
        {have}/{of}
      </b>
    </li>
  );
  return (
    <div className="finding-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <section ref={box} className="finding-card collection-card" role="dialog" aria-modal="true" aria-labelledby="collection-title">
        <header className="finding-head">
          <span className="incident-icon" aria-hidden="true">
            {r.rank.icon}
          </span>
          <div className="finding-who">
            <b id="collection-title">My City</b>
            <span className="muted">
              {mayorOf(region)} · {r.rank.name} · {r.points} points
            </span>
          </div>
          <button ref={closeBtn} className="btn icon ghost" aria-label="Close" onClick={close}>
            ✕
          </button>
        </header>
        <div className="rank-ladder" aria-label="City ranks">
          {RANKS.map((x) => (
            <span key={x.id} className={`rank-step ${r.points >= x.at ? 'got' : ''} ${x.id === r.rank.id ? 'now' : ''}`} title={`${x.name}: ${x.at} points`}>
              <span aria-hidden="true">{x.icon}</span> {x.name}
            </span>
          ))}
        </div>
        <div className="workshop-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.pct * 100)} aria-label="Progress to the next rank">
          <i style={{ width: `${Math.round(r.pct * 100)}%` }} />
        </div>
        <p className="muted small">{nextRankLine(r)}</p>
        <ul className="hub-numbers" aria-label="Your numbers">
          <li title="Stars are what you've learned: they grow your buildings and are never spent">
            <span aria-hidden="true">⭐</span> <b>{starsEarned(progress)}</b> <span>stars learned</span>
          </li>
          <li title="City Coins pay for decorations. Jobs, mini-games, workshops, the drawing board and your daily shift earn them">
            <Coin size={16} /> <b>{coins(progress)}</b> <span>City Coins{coinsToday(progress, today) ? ` (+${coinsToday(progress, today)} today)` : ''}</span>
          </li>
          <li title={`City Lights: a window for every day you learned. ${lights.run} ${lights.run === 1 ? 'night' : 'nights'} in a row.`}>
            <span aria-hidden="true">💡</span> <b>{lights.glowing}</b> <span>{lights.glowing === 1 ? 'window' : 'windows'} glowing</span>
          </li>
          <li title="Gold crowns on buildings past Master: earned with cards remembered for a week, drawings, quests and games">
            <span aria-hidden="true">👑</span> <b>{crowns}</b> <span>{crowns === 1 ? 'crown' : 'crowns'}</span>
          </li>
        </ul>
        <div className="hub-actions">
          <button className="btn tiny" title="Download a picture of your city as it is now (nothing is uploaded)" onClick={() => (close(), bus.emit('postcard'))}>
            📸 Save a postcard of {regionInfo(region)?.city ?? 'my city'}
          </button>
          <OnlineChip />
        </div>

        {cities.length > 1 && (
          <>
            <h4 className="label">Your cities</h4>
            <ul className="collection-stats">
              {cities.map((c) => {
                const cr = cityRank(progress, c);
                return (
                  <li key={c}>
                    <span>
                      {cr.rank.icon} {regionInfo(c)?.city ?? c}
                    </span>
                    <b>
                      {cr.rank.name} · ✨ {foundIn(progress, c)}/{TOKENS_PER_CITY}
                    </b>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <h4 className="label">
          Badges {earned.length}/{BADGES.length}
        </h4>
        <ul className="badge-grid">
          {BADGES.map((b) => {
            const got = b.earned(progress);
            return (
              <li key={b.id} className={got ? 'got' : 'locked'} title={b.how}>
                <span className="badge-icon" aria-hidden="true">
                  {got ? b.icon : '🔒'}
                </span>
                <span className="badge-name">{b.name}</span>
                {!got && <span className="sr-only">Not yet: {b.how}</span>}
              </li>
            );
          })}
        </ul>

        <LoopsHub />

        <h4 className="label">In {regionInfo(region)?.city ?? region}</h4>
        <ul className="collection-stats">
          {stat('Buildings put up', built, SERVICES.length)}
          {stat('At level 1 or above', levels.length, SERVICES.length)}
          {stat('At Master or above', levels.filter((l) => l >= 4).length, SERVICES.length)}
          {stat('Crowns', crowns, SERVICES.length * 3)}
          {stat('Golden tokens', foundIn(progress, region), TOKENS_PER_CITY)}
        </ul>

        <h4 className="label">Everywhere</h4>
        <ul className="collection-stats">
          {stat('Quests finished', QUESTS.filter((q) => progress.quests?.[q.id]?.status === 'done').length, QUESTS.length)}
          {stat('Drawings passed', PUZZLES.filter((z) => (progress.puzzles?.[z.id]?.best ?? 0) >= PUZZLE_PASS).length, PUZZLES.length)}
          {stat('Workshops finished', WORKSHOPS.filter((w) => progress.workshops?.[w.id]?.done).length, WORKSHOPS.length)}
          {stat('Talks passed', TALKS.filter((t) => progress.talks?.[t.id]).length, TALKS.length)}
          {stat('Mini-games played', games.filter((g) => (progress.games?.[g]?.plays ?? 0) > 0).length, games.length)}
          <li>
            <span>Longest run of learning days</span>
            <b>🔥 {progress.streak?.best ?? 0} days</b>
          </li>
        </ul>

        <h4 className="label">You and AWS at scale</h4>
        <ul className="collection-stats">
          <li>
            <span>AWS services you've put up somewhere</span>
            <b>
              {knownServices} of over {AWS_SCALE.services}
            </b>
          </li>
          <li>
            <span>Regions you've built a city in</span>
            <b>
              {cities.length} of {AWS_SCALE.regions}
            </b>
          </li>
        </ul>
        <ul className="scale-facts">
          {SCALE_FACTS.map((f) => (
            <li key={f.text}>
              <Plain text={f.text} />{' '}
              <button className="btn ghost tiny" onClick={() => openDocs(f.source)} aria-label={`Source: ${f.source}`}>
                source ↗
              </button>
            </li>
          ))}
        </ul>

        {games.some((g) => progress.games?.[g]) && (
          <>
            <h4 className="label">Best scores</h4>
            <ul className="collection-stats">
              {games
                .filter((g) => progress.games?.[g])
                .map((g) => (
                  <li key={g}>
                    <span>{GAME_NAMES[g] ?? g}</span>
                    <b>{progress.games![g].best}</b>
                  </li>
                ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/** My City in Simple mode (src/state/simple.ts): your buildings, stars and coins, nothing else. */
function SimpleCity({ close, box, closeBtn }: { close: () => void; box: RefObject<HTMLElement | null>; closeBtn: RefObject<HTMLButtonElement | null> }) {
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const built = SERVICES.filter((s) => isDiscovered(progress, s.id, region));
  const today = coinsToday(progress, dayKey());
  return (
    <div className="finding-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <section ref={box} className="finding-card collection-card simple" role="dialog" aria-modal="true" aria-labelledby="collection-title">
        <header className="finding-head">
          <span className="incident-icon" aria-hidden="true">
            🏙️
          </span>
          <div className="finding-who">
            <b id="collection-title">My City</b>
            <span className="muted">{regionInfo(region)?.city ?? region}</span>
          </div>
          <button ref={closeBtn} className="btn icon ghost" aria-label="Close" onClick={close}>
            ✕
          </button>
        </header>
        <ul className="hub-numbers" aria-label="Your numbers">
          <li title="Stars are what you've learned: they grow your buildings and are never spent">
            <span aria-hidden="true">⭐</span> <b>{starsEarned(progress)}</b> <span>stars learned</span>
          </li>
          <li title="City Coins pay for decorations in Decorate">
            <Coin size={16} /> <b>{coins(progress)}</b> <span>City Coins{today ? ` (+${today} today)` : ''}</span>
          </li>
          <li>
            <span aria-hidden="true">🏗️</span> <b>{built.length}</b> <span>{built.length === 1 ? 'building' : 'buildings'} put up</span>
          </li>
        </ul>
        {built.length > 0 && (
          <>
            <h4 className="label">Your buildings</h4>
            <ul className="collection-stats">
              {built.map((s) => (
                <li key={s.id}>
                  <span>{placeFor(s.id)?.place ?? s.name}</span>
                  <b>Level {levelOf(progress, s.id, region)}</b>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="muted small">Badges, ranks and the rest of your collection are in ⋯ → Show everything.</p>
      </section>
    </div>
  );
}

/** The rank chip in the HUD: this city's rank, and a tap opens My City. */
export function RankChip() {
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const r = cityRank(progress, region);
  return (
    <button className="btn ghost tiny rank-chip" onClick={() => useCity.getState().openCollection(true)} title={`${mayorOf(region)}: ${r.rank.name}, ${r.points} points. ${nextRankLine(r)}`}>
      <span aria-hidden="true">{r.rank.icon}</span> {r.rank.name}
    </button>
  );
}
