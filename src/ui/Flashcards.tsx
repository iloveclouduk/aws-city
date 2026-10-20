import { useEffect, useMemo, useRef, useState } from 'react';
import { backIn, isDue, questPracticeDeck, type Grade } from '@/learning/srs';
import { dayKey } from '@/state/progress';
import { dueDeck, isKnown, newCardsLeft, type NewCardLog } from '@/state/srs';
import { isDiscovered, useCity } from '@/state/store';
import { growthLine, growthOf } from '@/state/growth';
import { REMEMBERED_STARS } from '@/state/mastery';
import { cardsFor, type Flashcard } from '@/world/content';
import { placeFor, TIER_NAMES } from '@/world/places';
import { SERVICES, serviceById } from '@/world/taxonomy';
import { AwsIcon } from './AwsIcon';
import { feel } from './feedback';
import { Portrait } from './Portrait';
import { NEW_CARDS_KEY, readPref, writePref } from './logic';
import { Plain } from './Term';
import { EmptyState } from './EmptyState';
import { bus } from '@/state/bus';

/** Today's new-card count (this device). */
const readNewLog = (): NewCardLog | undefined => {
  try {
    const v = JSON.parse(readPref(NEW_CARDS_KEY) ?? 'null');
    return v && typeof v.day === 'string' && typeof v.n === 'number' ? v : undefined;
  } catch {
    return undefined;
  }
};
const noteNewCard = () => {
  const today = dayKey();
  const log = readNewLog();
  writePref(NEW_CARDS_KEY, JSON.stringify({ day: today, n: (log?.day === today ? log.n : 0) + 1 }));
};

/** Spaced-repetition flashcards per landmark. Correct answers grow the landmark (XP) and its agent. */
export function Flashcards() {
  const progress = useCity((s) => s.progress);
  const selected = useCity((s) => s.selected);
  const reviewCard = useCity((s) => s.reviewCard);
  // Memoised so the queue below is only rebuilt when progress changes, not on every render.
  const discovered = useMemo(() => SERVICES.filter((s) => isDiscovered(progress, s.id)), [progress]);
  const [deck, setDeck] = useState<string>(() => (selected && serviceById(selected) && isDiscovered(progress, selected) ? selected : (discovered[0]?.id ?? 'due')));
  const [flipped, setFlipped] = useState(false);
  // A quest's "Go →" selects its building and opens Learn while this is mounted: follow the selection to its deck.
  const [following, setFollowing] = useState(selected);
  if (selected !== following) {
    setFollowing(selected);
    if (selected && serviceById(selected) && isDiscovered(progress, selected) && selected !== deck) {
      setDeck(selected);
      setFlipped(false);
    }
  }
  const [done, setDone] = useState(0);
  /** A "Didn't know" wobbles the card softly (juice; none under reduced motion, see 27-loops.css). */
  const [wobble, setWobble] = useState(false);
  /** The last grade's reward, floated up over the card (keyed so it replays). */
  const [reward, setReward] = useState<{ xp: number; key: number; remembered?: boolean }>();
  /** When the last graded card comes back ("in 3 days"), or that it was practice. */
  const [back, setBack] = useState<string>();
  /** Cards practised this sitting for a quest (they go to the back of the practice line). */
  const [practiced, setPracticed] = useState<ReadonlySet<string>>(new Set());

  // "All my decks": reviewed cards that are due, then at most 10 new ones a day. A single deck shows everything due,
  // topped up with practice cards while a quest's cards step for it needs more than that (src/learning/srs.ts).
  const { queue, practice } = useMemo((): { queue: Flashcard[]; practice: ReadonlySet<string> } => {
    if (deck === 'due') return { queue: dueDeck(progress, discovered.map((s) => s.id), newCardsLeft(readNewLog(), dayKey())), practice: new Set() };
    const due = cardsFor(deck).filter((c) => isDue(progress.cards?.[c.id])).sort((a, b) => a.tier - b.tier);
    const extra = questPracticeDeck(progress, deck, due.length, practiced);
    return { queue: [...due, ...extra], practice: new Set(extra.map((c) => c.id)) };
  }, [deck, progress, discovered, practiced]);
  const card = queue[0];
  const practising = !!card && practice.has(card.id);
  const serviceId = card?.id.replace(/-\d+$/, '');

  const flip = () => {
    feel.flip();
    setFlipped((f) => !f);
  };
  // The hidden face is inert, so keep keyboard focus on the face that's showing after a flip (or a grade).
  const faceHit = useRef<{ front: HTMLButtonElement | null; back: HTMLButtonElement | null }>({ front: null, back: null });
  const shownFace = useRef(flipped);
  useEffect(() => {
    if (shownFace.current === flipped) return;
    shownFace.current = flipped;
    const el = document.activeElement;
    if (!el || el === document.body || el.closest('.flash')) faceHit.current[flipped ? 'back' : 'front']?.focus({ preventScroll: true });
  }, [flipped]);

  const grade = (g: Grade) => {
    if (!card) return;
    if (!progress.cards?.[card.id]) noteNewCard();
    if (g === 'again') feel.bad();
    else feel.good();
    // Juice: a right answer sends a beam of light from the card into its building; a miss wobbles the card.
    if (serviceId) bus.emit('answer', { serviceId, ok: g !== 'again' });
    setWobble(g === 'again');
    const isPractice = practice.has(card.id);
    const { stars, remembered } = reviewCard(card.id, g, { practice: isPractice });
    setReward(stars > 0 ? { xp: stars, key: Date.now(), remembered } : undefined);
    if (isPractice) setPracticed((s) => new Set(s).add(card.id));
    const after = useCity.getState().progress.cards?.[card.id];
    setBack(isPractice ? 'That was practice for your quest: the card keeps its place in the schedule.' : after ? `That card comes back ${backIn(after)}.` : undefined);
    setFlipped(false);
    setDone((n) => n + 1);
  };

  // Keyboard: F flips, 1 / 2 / 3 grade Again / Good / Easy once the answer shows (not while typing or picking a deck,
  // and not while a mini-game is open: its own keys, e.g. the sorting office's 1-3, must not grade a card too).
  const keys = useRef({ card, flipped, grade });
  keys.current = { card, flipped, grade };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (useCity.getState().view.name === 'game') return;
      const { card: c, flipped: f, grade: g } = keys.current;
      if (!c) return;
      if (e.key === 'f') {
        feel.flip();
        setFlipped((x) => !x);
      } else if (f && (e.key === '1' || e.key === '2' || e.key === '3')) g((['again', 'good', 'easy'] as const)[Number(e.key) - 1]);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const all = deck === 'due' ? discovered.flatMap((s) => cardsFor(s.id)) : cardsFor(deck);
  const total = all.length;
  // Learned means known: answered Knew it / Easy (a "Didn't know" doesn't count until it's known again).
  const learned = all.filter((c) => isKnown(progress.cards?.[c.id])).length;
  return (
    <div className="cards">
      <div className="row">
        <select value={deck} onChange={(e) => (setDeck(e.target.value), setFlipped(false))} aria-label="Deck">
          <option value="due">All my decks</option>
          {SERVICES.map((s) => {
            const open = isDiscovered(progress, s.id);
            return (
              <option key={s.id} value={s.id} disabled={!open}>
                {placeFor(s.id)?.place}
                {open ? ` · ${cardsFor(s.id).length} cards` : ' · locked'}
              </option>
            );
          })}
        </select>
      </div>
      {deck !== 'due' && discovered.length < 4 && discovered.length < SERVICES.length && <div className="muted">More decks open as you discover places.</div>}
      <div className="deck-progress">
        <span>
          <b>{queue.length}</b> to review · {learned} of {total} learned
        </span>
        <div className="meter district" aria-hidden="true">
          <i style={{ width: `${total ? Math.round((learned / total) * 100) : 0}%` }} />
        </div>
        {done > 0 && <span className="muted">+{done} today</span>}
      </div>
      {back && (
        <p key={reward?.key ?? back} className="muted flash-back" role="status">
          🔁 {back}
          {reward?.remembered ? ` You’ve remembered it for a week: +${REMEMBERED_STARS} ⭐ bonus.` : ''}
        </p>
      )}
      {card ? (
        <div className={`flash-wrap ${wobble ? 'juice-wobble' : ''}`} onAnimationEnd={() => setWobble(false)}>
          {/* Each face is a flip button laid under its text, so the answer's term buttons are never nested in a button. */}
          <div className={`flash ${flipped ? 'back' : ''}`}>
            <div className="flash-inner">
              <div className="flash-face front" inert={flipped}>
                <button ref={(b) => void (faceHit.current.front = b)} className="flash-hit" onClick={flip} aria-label={`Question: ${card.q}. Press to reveal the answer`} />
                <span className="flash-meta">
                  <AwsIcon serviceId={serviceId!} size={16} /> {placeFor(serviceId!)?.place} · {TIER_NAMES[card.tier]}
                  {practising ? ' · practice for your quest' : ''}
                </span>
                {/* Terms here are marked, not buttons: a tap anywhere on the question flips it. Their definitions are
                    one tap away on the answer side, under the question. */}
                <span className="flash-text">
                  <Plain text={card.q} except={serviceId} still />
                </span>
                <span className="flash-hint">tap or press F to reveal</span>
              </div>
              <div className="flash-face back-face" inert={!flipped}>
                <button ref={(b) => void (faceHit.current.back = b)} className="flash-hit" onClick={flip} aria-label="Answer shown. Press to see the question" />
                <span className="flash-meta">
                  <Portrait id={serviceId!} size={20} /> {placeFor(serviceId!)?.agentName}
                </span>
                <span className="flash-q">
                  <Plain text={card.q} except={serviceId} />
                </span>
                <span className="flash-text">
                  <Plain text={card.simple ?? card.a} except={serviceId} />
                </span>
                {card.simple && (
                  // Simple words first; the full answer is one tap away (its own control, so it never flips the card).
                  <details className="tell-more">
                    <summary>Tell me more</summary>
                    <span className="tell-more-text">
                      <Plain text={card.a} except={serviceId} />
                    </span>
                  </details>
                )}
                <span className="flash-hint">tap the card to see the question again</span>
              </div>
            </div>
          </div>
          {reward && (
            <span key={reward.key} className="xp-float" aria-hidden="true">
              +{reward.xp} ⭐{reward.remembered ? ' remembered!' : ''}
            </span>
          )}
          {serviceId && <GrowLine serviceId={serviceId} bump={reward?.key} />}
        </div>
      ) : discovered.length === 0 ? (
        <EmptyState title="No cards yet">Start a quest, or tap a building and ask its helper. Its cards then open here.</EmptyState>
      ) : (
        <EmptyState title="All caught up" emoji="🎉">
          Cards come back right before you’d forget them. Try another deck, or come back later.
        </EmptyState>
      )}
      <div className="sr-only" aria-live="polite">
        {card && flipped ? `Answer: ${card.simple ?? card.a}` : ''}
      </div>
      {card && flipped && (
        <>
          <div className="actions grades">
            <button className="btn" onClick={() => grade('again')}>
              Didn’t know <span className="kbd">1</span>
            </button>
            <button className="btn" onClick={() => grade('good')}>
              Knew it <span className="kbd">2</span>
            </button>
            <button className="btn" onClick={() => grade('easy')}>
              Easy <span className="kbd">3</span>
            </button>
          </div>
          <a className="source" href={card.source} target="_blank" rel="noreferrer">
            📖 Read more in the AWS docs
          </a>
        </>
      )}
    </div>
  );
}

/** The building this deck grows, and how far: every card you review builds it a little (src/state/growth.ts). */
export function GrowLine({ serviceId, bump }: { serviceId: string; bump?: number }) {
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const g = growthOf(progress, serviceId, region);
  return (
    <div key={bump} className={`grow-line ${bump ? 'bumped' : ''}`} title="Every card, puzzle and game here grows this building">
      <span>🏗️ {growthLine(g)}</span>
      <span className="meter district" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.pct * 100)} aria-label={`${g.place} growth`}>
        <i style={{ width: `${Math.max(4, Math.round(g.pct * 100))}%` }} />
      </span>
    </div>
  );
}
