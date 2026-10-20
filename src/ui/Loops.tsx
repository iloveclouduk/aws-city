// The loops that bring you back (plan round 3, Step 2; contract v2.15): City Lights, the Daily Supply Drop, the free
// season road, the Service Codex (with combos) and City Hall, as My City sections, plus the crate and the gentle return
// note on Home. Everything here is earned and cosmetic: no coins or stars inside a crate, nothing to buy, nothing that
// decays. The rules live in src/state (lights, drops, season, codex, cityhall, welcome); these only show them.
import { useEffect, useState } from 'react';
import { useCity } from '@/state/store';
import { dayKey } from '@/state/progress';
import { lightsLine, lightsOf, lightsView, windowStates, FREEZE_EVERY, MAX_FREEZES } from '@/state/lights';
import { dropOdds, dropReady, dropsOf, overtimeReady } from '@/state/drops';
import { claimable, openSeasons, roadOf, rewardName, seasonById, seasonFor, seasonOf, ROAD_AT } from '@/state/season';
import { allSets, codexCards, combosCollected, SET_KIND_NAME } from '@/state/codex';
import { hallLevel, hallNext, HALL_LEVELS } from '@/state/cityhall';
import { ownedCosmetics, glowColor } from '@/state/rewards';
import { COSMETICS, cosmeticById, DEFAULT_GLOW, RARITY_NAME, type Cosmetic, type Rarity } from '@/state/cosmetics';
import { noteDue, returnNote } from '@/state/welcome';
import { COMBOS } from '@/world/combos';
import { SERVICES } from '@/world/taxonomy';
import { placeFor } from '@/world/places';
import { openDocs } from '@/app/runtime';
import { feel } from './feedback';
import { readPref, writePref } from './logic';
import { withCoins } from './icons';
import { Plain } from './Term';

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The season road a shift fills now: the picked one (prefs.road) if it's a season, else this month's. */
export const pickedSeason = (pick: string | undefined, today = dayKey()) => (pick && seasonById(pick) ? seasonById(pick)! : seasonFor(today));

// ── City Lights ──────────────────────────────────────────────────────────────

/** The skyline of windows: one per learning day, glowing in the colour picked; dim and frozen ones shown as such. */
export function CityLights() {
  const progress = useCity((s) => s.progress);
  const pick = useCity((s) => s.prefs.glow);
  const today = dayKey();
  const v = lightsView(lightsOf(progress), today);
  const states = windowStates(v, 60);
  const glow = css(glowColor(progress, pick));
  const owned = ownedCosmetics(progress);
  const glows = COSMETICS.filter((c) => c.kind === 'glow' && owned.has(c.id));
  return (
    <section className="loops-lights" aria-labelledby="lights-title">
      <h4 className="label" id="lights-title">
        💡 City Lights
      </h4>
      <div className="lights-sky" role="img" aria-label={`${v.glowing} windows glowing, ${v.dim} dimmed, ${v.frozen} kept lit by a freeze`}>
        {states.length ? (
          states.map((s, i) => <i key={i} className={`win ${s}`} style={s === 'lit' ? { background: glow, boxShadow: `0 0 6px ${glow}` } : undefined} />)
        ) : (
          <span className="muted small">No windows yet</span>
        )}
      </div>
      <p className="small">{lightsLine(v)}</p>
      <p className="muted small">
        🧊 {v.freezes ? `${plural(v.freezes, 'freeze')} held: each keeps a missed day’s window lit.` : 'No freezes held yet.'}{' '}
        {v.toFreeze ? `Next freeze in ${plural(v.toFreeze, 'learning day')} (one every ${FREEZE_EVERY}, ${MAX_FREEZES} at most).` : `Your freezes are full (${MAX_FREEZES}).`} A missed day dims one window; it never takes one away.
      </p>
      {glows.length > 0 && (
        <div className="glow-pick" role="group" aria-label="Window colour">
          <button className={`btn tiny ${!pick || !owned.has(pick) ? 'on' : ''}`} aria-pressed={!pick || !owned.has(pick)} onClick={() => (feel.tap(), useCity.getState().setPref('glow', undefined))}>
            <i className="swatch" style={{ background: css(DEFAULT_GLOW) }} /> Warm gold
          </button>
          {glows.map((g) => (
            <button key={g.id} className={`btn tiny ${pick === g.id ? 'on' : ''}`} aria-pressed={pick === g.id} onClick={() => (feel.tap(), useCity.getState().setPref('glow', g.id))}>
              <i className="swatch" style={{ background: g.css }} /> {g.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** The HUD's City Lights chip number: windows glowing now. */
export const glowingNow = (p: Parameters<typeof lightsOf>[0]) => lightsView(lightsOf(p), dayKey());

// ── Season road ──────────────────────────────────────────────────────────────

export function SeasonRoad() {
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const pick = useCity((s) => s.prefs.road);
  const today = dayKey();
  const level = hallLevel(progress, region);
  const open = openSeasons(progress, today, level);
  const s = pickedSeason(pick, today);
  const sp = seasonOf(progress, s.id);
  const road = roadOf(s);
  const ready = claimable(progress, s.id);
  const top = ROAD_AT[ROAD_AT.length - 1];
  return (
    <section className="loops-season" aria-labelledby="season-title">
      <h4 className="label" id="season-title">
        {s.icon} Season road: {s.name}
      </h4>
      <p className="muted small">
        Free, always: each finished shift moves you along (+10, +15 when the shift grew one of {s.services.map((id) => placeFor(id)?.place ?? id).slice(0, 2).join(' or ')}). The last step is the season’s own landmark. Past seasons stay open to finish.
      </p>
      {open.length > 1 && (
        <label className="small season-pick">
          Road to fill{' '}
          <select value={s.id} onChange={(e) => (feel.tap(), useCity.getState().setPref('road', e.target.value === seasonFor(today).id ? undefined : e.target.value))}>
            {open.map((x) => (
              <option key={x.id} value={x.id}>
                {x.icon} {x.name}
                {x.id === seasonFor(today).id ? ' (this month)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="workshop-progress" role="progressbar" aria-valuemin={0} aria-valuemax={top} aria-valuenow={Math.min(top, sp.points)} aria-label={`${s.name} road`}>
        <i style={{ width: `${Math.min(100, (sp.points / top) * 100)}%` }} />
      </div>
      <ol className="season-road">
        {road.map((st, i) => {
          const got = sp.claimed.includes(i);
          const can = ready.includes(i);
          return (
            <li key={i} className={got ? 'got' : can ? 'ready' : 'locked'}>
              <span className="season-at">{st.at}</span>
              <span className="season-reward">{rewardName(st.reward)}</span>
              {got ? (
                <span className="muted small">✓ Yours</span>
              ) : can ? (
                <button
                  className="btn tiny primary"
                  onClick={() => {
                    feel.win();
                    useCity.getState().claimSeason(i, s.id);
                  }}
                >
                  Claim
                </button>
              ) : (
                <span className="muted small">{st.at - sp.points} to go</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ── Daily Supply Drop ────────────────────────────────────────────────────────

/** What's still in the crate for this player, as "Common 74% · Rare 26%" (a rarity that's run out isn't listed). */
const oddsNow = (p: Parameters<typeof dropOdds>[0]) => {
  const o = dropOdds(p);
  return (Object.keys(o.odds) as Rarity[])
    .filter((r) => o.odds[r] > 0)
    .map((r) => `${RARITY_NAME[r]} ${o.odds[r]}%`)
    .join(' · ');
};
/** How long the crate shakes before it pops open (none under reduced motion). */
export const CRATE_SHAKE_MS = 1000;
const still = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Home, once the shift is done: a free thank-you crate a day with a decoration or a window colour. It says plainly that
 * it's free and what could be inside (the real chances for what's left), shakes for a second, then pops open in the
 * colour of what came out.
 */
export function SupplyDrop({ shiftDone, overtime = false }: { shiftDone: boolean; overtime?: boolean }) {
  const name = overtime ? 'Overtime crate' : 'Daily Supply Drop';
  const progress = useCity((s) => s.progress);
  const [got, setGot] = useState<{ item?: Cosmetic; spare?: boolean }>();
  const [shaking, setShaking] = useState<{ item?: Cosmetic; spare?: boolean }>();
  const today = dayKey();
  useEffect(() => {
    if (!shaking) return;
    const t = setTimeout(() => (setGot(shaking), setShaking(undefined)), CRATE_SHAKE_MS);
    return () => clearTimeout(t);
  }, [shaking]);
  if (shaking)
    return (
      <section className="supply-drop shaking" aria-label={name} aria-busy="true">
        <span className="crate" aria-hidden="true">
          🎁
        </span>
        <span>
          <b>Opening…</b>
        </span>
      </section>
    );
  if (got)
    return (
      <section className={`supply-drop opened rarity-${got.item?.rarity ?? 'none'}`} role="status" aria-label={name}>
        <span className="crate" aria-hidden="true">
          {got.item?.icon ?? '🎊'}
        </span>
        <span>
          {got.item ? (
            <>
              <b>
                {got.spare ? `A spare ${got.item.name}` : `${got.item.name} (${RARITY_NAME[got.item.rarity]})`}
              </b>
              <small className="muted">
                {got.spare
                  ? 'You own everything a crate holds, so this is a spare: one more of it may stand in each city. Place it free in Decorate.'
                  : got.item.kind === 'glow'
                    ? 'A new colour for your City Lights windows: pick it in My City.'
                    : 'Place it free in Decorate.'}
              </small>
            </>
          ) : (
            <>
              <b>Confetti!</b>
              <small className="muted">You own everything a crate can hold. Thank you for coming back.</small>
            </>
          )}
        </span>
      </section>
    );
  if (!(overtime ? overtimeReady(progress, today, shiftDone) : dropReady(progress, today, shiftDone))) return null;
  return (
    <section className="supply-drop" aria-label={name}>
      <span className="crate" aria-hidden="true">
        🎁
      </span>
      <span>
        <b>{name}</b>
        <small className="muted">A free thank-you for your {overtime ? 'overtime' : 'shift'}: one decoration or window colour. Free, nothing to buy.</small>
        <small className="muted">What could be inside: {oddsNow(progress) || 'a spare decoration'}.</small>
      </span>
      <button
        className="btn tiny crate-open"
        onClick={() => {
          feel.win();
          const r = useCity.getState().openDrop(overtime ? { overtime: true } : undefined);
          if (still() || !r) setGot(r ?? {});
          else setShaking(r);
        }}
      >
        Open the crate
      </button>
    </section>
  );
}

/** My City: what crates gave, out of everything a crate can hold. */
function DropShelf() {
  const progress = useCity((s) => s.progress);
  const owned = ownedCosmetics(progress);
  const d = dropsOf(progress);
  const all = COSMETICS.filter((c) => !c.id.startsWith('mon-'));
  return (
    <section aria-labelledby="drops-title">
      <h4 className="label" id="drops-title">
        🎁 Rewards {all.filter((c) => owned.has(c.id)).length}/{all.length}
      </h4>
      <p className="muted small">
        A finished shift opens one free Daily Supply Drop a day (chances now: {oddsNow(progress) || 'a spare decoration'}). {d.last ? `Last opened ${d.last}.` : 'None opened yet.'} Season steps and Codex sets give the rest. Decorations are free to place in Decorate.
      </p>
      <ul className="badge-grid">
        {all.map((c) => (
          <li key={c.id} className={owned.has(c.id) ? 'got' : 'locked'} title={`${c.name} · ${RARITY_NAME[c.rarity]}`}>
            <span className="badge-icon" aria-hidden="true">
              {owned.has(c.id) ? c.icon : '🔒'}
            </span>
            <span className="badge-name">{c.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Service Codex ────────────────────────────────────────────────────────────

export function Codex() {
  const progress = useCity((s) => s.progress);
  const cards = codexCards(progress);
  const sets = allSets(progress);
  const combos = combosCollected(progress);
  return (
    <section className="loops-codex" aria-labelledby="codex-title">
      <h4 className="label" id="codex-title">
        📖 Service Codex {cards.length}/{SERVICES.length}
      </h4>
      <p className="muted small">A card for every service you put up, in any city. Finish a set and its monument is yours to place free.</p>
      <ul className="codex-sets">
        {sets.map(({ set, have, of, done, missing }) => (
          <li key={set.id} className={done ? 'got' : ''}>
            <span className="codex-set-name">
              <span aria-hidden="true">{set.icon}</span> <b>{set.name}</b> <small className="muted">{SET_KIND_NAME[set.kind]}</small>
            </span>
            <span className="codex-set-count">
              {have}/{of} {done ? `· ${cosmeticById(set.reward)?.icon ?? '🏛️'} ${cosmeticById(set.reward)?.name ?? ''} won` : ''}
            </span>
            {!done && missing.length > 0 && <small className="muted codex-missing">Still to find: {missing.slice(0, 4).map((id) => placeFor(id)?.place ?? id).join(', ')}{missing.length > 4 ? ` and ${missing.length - 4} more` : ''}</small>}
            <button className="btn ghost tiny" onClick={() => openDocs(set.source)} aria-label={`Source for ${set.name}`}>
              source ↗
            </button>
          </li>
        ))}
      </ul>
      <h4 className="label">
        🧩 Combos {combos.length}/{COMBOS.length}
      </h4>
      <p className="muted small">Put up services that work together and a combo appears in your city between them.</p>
      <ul className="codex-combos">
        {COMBOS.map((c) => {
          const found = combos.find((x) => x.combo.id === c.id);
          return (
            <li key={c.id} className={found ? 'got' : 'locked'}>
              <b>{found ? c.name : '???'}</b>{' '}
              <small className="muted">{c.services.map((id) => placeFor(id)?.place ?? id).join(' + ')}</small>
              {found && (
                <small className="codex-fact">
                  <Plain text={c.simple} still /> <span className="muted">Found {found.at}.</span>
                </small>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── City Hall ────────────────────────────────────────────────────────────────

export function CityHall() {
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const level = hallLevel(progress, region);
  const next = hallNext(progress, region);
  const opened = HALL_LEVELS.slice(0, level).flatMap((l) => l.items);
  return (
    <section aria-labelledby="hall-title">
      <h4 className="label" id="hall-title">
        🏛️ City Hall · level {level}
      </h4>
      <p className="muted small">
        City Hall grows with your rank. It opens grander decorations and older season roads; it never locks learning.
        {opened.length ? ` Open now: ${opened.map((i) => `${i.icon} ${i.name}`).join(', ')}.` : ''} {level > 1 ? `${plural(level - 1, 'past season')} open.` : ''}
      </p>
      {next && <p className="small">{next}</p>}
    </section>
  );
}

/** My City's loops, in order: City Lights, the season road, City Hall, the Codex and the rewards shelf, then the note switch. */
export function LoopsHub() {
  const on = useCity((s) => !!s.prefs.returnNote);
  return (
    <>
      <CityLights />
      <SeasonRoad />
      <CityHall />
      <Codex />
      <DropShelf />
      <label className="small return-switch">
        <input type="checkbox" checked={on} onChange={(e) => (feel.tap(), useCity.getState().setPref('returnNote', e.target.checked || undefined))} /> A welcome-back line on the City tab (at most one a day, no notifications)
      </label>
    </>
  );
}

// ── The gentle return note ───────────────────────────────────────────────────

const NOTE_KEY = 'awscity.returnNote';

/** Home: one positive line a day for a player who turned it on, dismissed with ✕. */
export function ReturnNote({ jobs }: { jobs: boolean }) {
  const on = useCity((s) => !!s.prefs.returnNote);
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const season = useCity((s) => s.prefs.road);
  const today = dayKey();
  // Fixed for this visit: the first render decides, so the line doesn't vanish when the first card is reviewed.
  const [text] = useState(() => (on && noteDue(readPref(NOTE_KEY) ?? undefined, today) ? returnNote({ progress, region, today, season, jobs }) : undefined));
  const [shut, setShut] = useState(false);
  // Shown once is the day's one note: another visit today stays quiet.
  useEffect(() => {
    if (text) writePref(NOTE_KEY, today);
  }, [text, today]);
  if (!text || shut) return null;
  return (
    <p className="return-note" role="status">
      <span>{withCoins(text)}</span>
      <button
        className="btn icon ghost tiny"
        aria-label="Dismiss"
        onClick={() => setShut(true)}
      >
        ✕
      </button>
    </p>
  );
}
