import { useEffect, useRef, useState } from 'react';
import { canLookByAddress, grantLookout, lookByAddress, lookoutUnavailable, lookoutWorksHere, openConsole, snap, submitPrompt, type Layout } from '@/app/runtime';
import { bus } from '@/state/bus';
import { tierOf, useCity } from '@/state/store';
import { buildingLevelName, crownSteps, LEGEND_NAMES, MAX_CROWNS, levelOf } from '@/state/mastery';
import type { Progress } from '@/backend/contract';
import { landmarkOf } from '@/state/cities';
import { placeFor, SPECIAL_AGENTS, TIER_NAMES, TIER_XP } from '@/world/places';
import { districtById, serviceById, servicesIn, type DistrictId } from '@/world/taxonomy';
import { AwsIcon } from './AwsIcon';
import { CultureCard, isCultureId } from './CulturePanels';
import { WorkshopList, WorkshopStudio } from './Workshop';
import { NorthHall } from './NorthHall';
import { workshopsFor } from '@/world/workshops';
import { feel } from './feedback';
import { districtStyle, placeSuggestions, type PlaceSuggestion } from './logic';
import { Portrait } from './Portrait';
import { RegionPrice } from './RegionPrice';
import { RoleCard } from './RoleCard';
import { ForLearners, Plain, Term } from './Term';
import type { OpenTab } from './QuestLog';
import { isGlobalService } from '@/world/regions';
import { nextLevelPreview } from '@/world/preview';
import { EmptyState } from './EmptyState';
import { CompareCard } from './CompareCard';
import { ReadingShelf } from './ReadingShelf';
import { comparisonsFor } from '@/world/comparisons';
import { agentOffer } from '@/state/watch';
import { TaskCard } from './ActivityFeed';
import { signLegend } from './logic';

/**
 * The Lookout's camera. In the side panel (or Firefox sidebar) it snaps the page beside it and shows what it last saw;
 * in the full tab or Safari it can't see other tabs, so it says why and where it can.
 */
function LookoutSnap({ layout }: { layout?: Layout }) {
  const state = useCity((s) => s.snap);
  const last = useCity((s) => s.lastClassified);
  // The demo's Lookout works from every surface: it looks at the practice console (runtime lookAtPractice).
  if (!lookoutWorksHere(layout)) return <p className="muted small" role="note">📷 {lookoutUnavailable()}</p>;
  return (
    <div className="lookout-snap">
      {state === 'needs-permission' ? (
        <>
          <button className="btn primary wide" onClick={grantLookout}>
            📷 Allow the Lookout to see pages
          </button>
          {/* The demo's practice console can still be read without a photo, by its address. */}
          {canLookByAddress() && (
            <button className="btn ghost wide" onClick={() => (feel.tap(), lookByAddress())}>
              No thanks, go by the address
            </button>
          )}
        </>
      ) : (
        <button className="btn primary wide" disabled={state === 'snapping'} onClick={() => (feel.tap(), void snap())}>
          {state === 'snapping' ? '📸 Looking…' : '📸 Show this page to the city'}
        </button>
      )}
      {state === 'failed' && <p className="muted small">I couldn’t take that photo. Try again on an AWS page.</p>}
      {last && (
        <p className="small" role="status">
          <b>Last look:</b> <Plain text={last.summary} />
          {last.serviceIds.length > 0 && ` (${last.serviceIds.map((sid) => serviceById(sid)?.name ?? sid).join(', ')})`}
        </p>
      )}
    </div>
  );
}

/** "· best 42" on the Play button once the game has a score to beat. */
const bestLine = (g?: { best: number; plays: number }) => (g && g.best > 0 ? ` · best ${g.best}` : '');

const GAME_NAME = { fishing: 'Fishing', shield: 'Shield Wall', route53: 'Dance Hall', lambda: 'Food Stall', ec2: 'Rush Hour', dynamodb: 'Sorting Office', redteam: 'Red Team Range', queue: 'Queue Juggler', iamgate: 'Permission Gate', edge: 'Edge Cache' } as const;

export function LandmarkCard({ openTab, layout }: { openTab?: OpenTab; layout?: Layout }) {
  const id = useCity((s) => s.selected);
  const progress = useCity((s) => s.progress);
  const cityRegion = useCity((s) => s.cityRegion);
  const setView = useCity((s) => s.setView);
  const selectPlace = useCity((s) => s.select);
  const [compare, setCompare] = useState<string>();
  // Watch it done stays on this card: the task sent from here (the newest one, once it isn't the one that was newest
  // when the button was pressed) shows right under the button, scrolled into view, instead of on another screen.
  const [watchFrom, setWatchFrom] = useState<{ id: string; before?: string }>();
  const newest = useCity((s) => (s.taskOrder[0] ? s.tasks[s.taskOrder[0]] : undefined));
  const live = watchFrom && watchFrom.id === id && newest && newest.taskId !== watchFrom.before ? newest : undefined;
  const liveBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = liveBox.current;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [live?.taskId]);
  const inventory = useCity((s) => s.inventory);
  const findings = useCity((s) => s.findings);
  // The city follows the panel: whatever place is open here is what the camera shows.
  useEffect(() => {
    if (id && (serviceById(id) || id === 'plaza' || id === 'lookout' || id === 'workshop')) bus.emit('flyTo', { id });
  }, [id]);

  if (!id) return <PickAPlace />;
  if (isCultureId(id)) return <CultureCard id={id} />;
  if (id === 'workshop') return <WorkshopStudio />;
  if (id === 'northhall') return <NorthHall />;

  if (id === 'plaza' || id === 'lookout') {
    const a = id === 'plaza' ? SPECIAL_AGENTS.concierge : SPECIAL_AGENTS.lookout;
    return (
      <div className="card">
        <div className="place-hero">
          <Portrait id={id === 'plaza' ? 'concierge' : 'lookout'} size={44} />
          <div>
            <h3>{id === 'plaza' ? 'Console Plaza' : 'Lookout Tower'}</h3>
            <div className="muted">
              <b>{a.name}</b> · {a.role}
            </div>
          </div>
        </div>
        <p className="blurb">
          {id === 'lookout'
            ? 'Luke looks at the AWS page you have open and tells the city what you are working on.'
            : 'Connie runs the plaza. Every AWS service has its own page in the AWS console, and this is the way in.'}
        </p>
        {id === 'lookout' && <LookoutSnap layout={layout} />}
        <div className="actions">
          <button className="btn" onClick={() => openConsole('plaza')}>
            Open console ↗
          </button>
        </div>
      </div>
    );
  }

  if (id.startsWith('hq:')) {
    const d = districtById(id.slice(3))!;
    return (
      <div className="card edge" style={districtStyle(d.color)}>
        <h3>{d.hq}</h3>
        <p>The {d.name} team works here. Step inside to watch them and ask them anything.</p>
        <button className="btn primary" onClick={() => setView({ name: 'interior', districtId: d.id as DistrictId })}>
          Enter HQ
        </button>
      </div>
    );
  }

  const svc = serviceById(id);
  const place = placeFor(id);
  if (!svc || !place) return null;
  const d = districtById(svc.districtId)!;
  const tier = tierOf(progress, id, cityRegion);
  const level = levelOf(progress, id, cityRegion);
  const xp = landmarkOf(progress, id, cityRegion)?.xp ?? 0;
  const next = TIER_XP[Math.min(tier + 1, 4)];
  const prev = TIER_XP[Math.max(tier, 0)];
  const pct = tier >= 4 ? 100 : Math.round(((xp - prev) / Math.max(1, next - prev)) * 100);
  const nextAdds = tier >= 0 && tier < 4 ? nextLevelPreview(progress, id, cityRegion, tier)?.adds : undefined;
  const agent = place.agentName.split(' the ')[0];
  const short = svc.name.replace(/^(Amazon|AWS) /, '');
  const teach = () => {
    feel.send();
    submitPrompt(`Teach me about ${svc.name}: ${place.teaches[Math.min(Math.max(tier, 0), 3)]}`);
    openTab?.('feed');
  };
  // At most two big things to do here, picked by what this place offers: play, learn its cards, ask its agent.
  const things: { key: string; label: string; primary?: boolean; run: () => void }[] =
    tier < 0
      ? [{ key: 'ask', label: `👋 Ask ${agent} to move in`, primary: true, run: teach }]
      : [
          ...(place.game ? [{ key: 'play', label: `🎮 Play ${GAME_NAME[place.game]}${bestLine(progress.games?.[place.game])}`, run: () => (feel.tap(), setView({ name: 'game', game: place.game! })) }] : []),
          { key: 'cards', label: '🃏 Learn with cards', run: () => (feel.tap(), openTab?.('learn')) },
        ]
          .slice(0, 2)
          .map((t, i) => ({ ...t, primary: i === 0 }));
  // Two different things the agent does, said plainly: answer your question (the team's HQ chat), or do a job for you
  // that you watch step by step (Watch it done, src/state/watch.ts).
  const offer = agentOffer(id);
  const hasHq = servicesIn(svc.districtId).length > 0;
  const doIt = () => {
    feel.send();
    setWatchFrom({ id, before: useCity.getState().taskOrder[0] });
    submitPrompt(offer?.prompt ?? `Show me ${svc.name} at work: ${place.teaches[Math.min(Math.max(tier, 0), 3)]}`);
  };
  const legend = signLegend({ inventory, findings, region: cityRegion, serviceId: id });

  return (
    <div className="card edge place" style={districtStyle(d.color)}>
      <div className="place-hero">
        <span className={`place-icon ${tier < 0 ? 'locked' : ''}`}>
          <AwsIcon serviceId={id} size={40} className={tier < 0 ? 'dim' : ''} />
          {tier >= 0 && <Portrait id={id} size={24} className="place-agent" />}
        </span>
        <div className="place-title">
          <h3>{place.place}</h3>
          <div className="muted">{svc.name}</div>
          {tier >= 0 && (
            <div className="place-tier">
              Level {level} · <b>{buildingLevelName(level, TIER_NAMES)}</b>
              {level > 4 && ' 👑'.repeat(level - 4)}
            </div>
          )}
        </div>
      </div>
      {isGlobalService(id) && (
        <p className="global-ribbon">
          🌐 <b>Global:</b> the same in every city, because AWS runs it worldwide.
        </p>
      )}
      <section className="place-what" aria-label="What is it?">
        <h4 className="label">What is it?</h4>
        <p className="blurb">
          <Plain text={place.simple ?? place.blurb} except={id} />
        </p>
      </section>
      {legend.length > 0 && (
        <ul className="sign-legend" aria-label="What its sign shows">
          {legend.map((l) => (
            <li key={l.mark}>
              <span className="sign-mark" aria-hidden="true">
                {l.mark}
              </span>{' '}
              {l.text}
            </li>
          ))}
        </ul>
      )}
      {tier < 0 ? (
        <p className="locked-note">🚧 Not built in this city yet. {agent} moves in when you ask about it, or when a quest brings you here.</p>
      ) : (
        <div className="tier">
          <div className="meter district" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Progress to ${TIER_NAMES[Math.min(tier + 1, 4)]}`}>
            <i style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
          <span className="muted">{tier < 4 ? `${xp} ⭐ · ${next - xp} more to grow to ${TIER_NAMES[tier + 1]}` : `${xp} ⭐ · Master`}</span>
          {/* What the next level adds (the map shows it over the building only with Everything on). */}
          {nextAdds && <span className="tier-adds">Next level adds “{nextAdds}”</span>}
          {tier >= 4 && <CrownNext progress={progress} id={id} level={level} />}
        </div>
      )}
      <section className="place-do" aria-label="What can I do here?">
        <h4 className="label">What can I do here?</h4>
        <div className="actions">
          {things.map((t) => (
            <button key={t.key} className={`btn ${t.primary ? 'primary' : ''} wide`} onClick={t.run}>
              {t.label}
            </button>
          ))}
        </div>
        {tier >= 0 && (
          <div className="agent-asks" role="group" aria-label={`What ${agent} can do`}>
            {hasHq && (
              <button className="btn tiny" title={`Chat with the ${d.name} team in ${d.hq}: ask anything, get an answer`} onClick={() => (feel.tap(), setView({ name: 'interior', districtId: svc.districtId }))}>
                💬 Ask a question
              </button>
            )}
            <button className="btn tiny" title={offer?.story ?? `${agent} does a small job here and you watch every step`} onClick={doIt}>
              🛠️ Watch it done
            </button>
          </div>
        )}
        {live && (
          <div ref={liveBox} className="place-live-task">
            <TaskCard key={live.taskId} task={live} openTab={openTab} />
          </div>
        )}
      </section>
      {comparisonsFor(id).length > 0 && (
        <section className="place-compare" aria-label="Which one should I pick?">
          <h4 className="label">Which one should I pick?</h4>
          <div className="compare-chips">
            {comparisonsFor(id).map((c) => (
              <button key={c.id} className="btn tiny" onClick={() => (feel.tap(), setCompare(c.id))}>
                ⚖️ {c.title}
              </button>
            ))}
          </div>
        </section>
      )}
      {workshopsFor(id).length > 0 && (
        <section className="place-workshops" aria-label="Hands-on workshops">
          <h4 className="label">Hands-on workshops</h4>
          <WorkshopList ids={workshopsFor(id).map((w) => w.id)} progress={progress.workshops} />
        </section>
      )}
      <ReadingShelf serviceId={id} />
      <CompareCard
        id={compare}
        onClose={() => setCompare(undefined)}
        onVisit={(serviceId) => {
          setCompare(undefined);
          selectPlace(serviceId);
        }}
      />
      {/* The detail stays one tap away: what it teaches at each level, its prices, the console and the team's HQ. */}
      <ForLearners>
        <p className="blurb">
          <Term text={place.blurb} />
        </p>
        <ol className="teaches">
          {place.teaches.map((t, i) => (
            <li key={t} className={i < tier ? (i === tier - 1 ? 'got now' : 'got') : ''}>
              <span className="lvl">{TIER_NAMES[i + 1]}</span>{' '}
              <span>
                <Term text={t} />
              </span>
            </li>
          ))}
        </ol>
        <RegionPrice serviceId={id} />
        {tier >= 0 && <RoleCard serviceId={id} />}
        <div className="actions quiet">
          <button className="btn ghost tiny" onClick={() => openConsole(id)}>
            Open {short} in the AWS console ↗
          </button>
          {servicesIn(svc.districtId).length > 0 && (
            <button className="btn ghost tiny" onClick={() => setView({ name: 'interior', districtId: svc.districtId })}>
              Visit {d.hq} →
            </button>
          )}
        </div>
      </ForLearners>
    </div>
  );
}

const SUGGEST_LABEL: Record<PlaceSuggestion['kind'], (s: PlaceSuggestion) => string> = {
  top: () => 'Your top building',
  close: (s) => `Almost there: ${s.toGo} ⭐ to the next level`,
  new: () => 'Not built yet',
};

/** Nothing picked: a few useful places to jump to, so the tab is never just an empty card. */
function PickAPlace() {
  const progress = useCity((s) => s.progress);
  const cityRegion = useCity((s) => s.cityRegion);
  const select = useCity((s) => s.select);
  const ideas = placeSuggestions(progress, cityRegion);
  return (
    <>
      <EmptyState title="Pick a place">Tap any building or helper in the city to see what it does.</EmptyState>
      {ideas.length > 0 && (
        <ul className="place-ideas" aria-label="Places to visit">
          {ideas.map((it) => {
            const s = serviceById(it.serviceId)!;
            return (
              <li key={it.kind}>
                <button
                  className="btn place-idea"
                  onClick={() => {
                    feel.tap();
                    select(it.serviceId);
                  }}
                >
                  <AwsIcon serviceId={it.serviceId} size={24} />
                  <span>
                    <b>{placeFor(it.serviceId)?.place ?? s.name}</b>
                    <span className="muted">{SUGGEST_LABEL[it.kind](it)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** Past Master: what the next gold crown asks (src/state/mastery.ts), so the building keeps growing with real knowledge. */
function CrownNext({ progress, id, level }: { progress: Progress; id: string; level: number }) {
  const crowns = level - 4;
  if (crowns >= MAX_CROWNS) return <p className="crown-next">👑 Every crown is on the tower. A true Legend!</p>;
  const steps = crownSteps(progress, id)[crowns]!;
  return (
    <div className="crown-next">
      <p>
        👑 Next crown: <b>{LEGEND_NAMES[crowns]}</b> (Lv {level + 1})
      </p>
      <ul>
        {steps.map((st) => (
          <li key={st.label} className={st.done ? 'got' : ''}>
            {st.done ? '✅' : '◻️'} {st.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
