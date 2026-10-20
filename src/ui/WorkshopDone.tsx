import { useEffect, useRef, useState } from 'react';
import { FINISH_XP, workshopStatus } from '@/learning/workshopRewards';
import { bus } from '@/state/bus';
import { useCity } from '@/state/store';
import { placeFor, SPECIAL_AGENTS } from '@/world/places';
import { workshopById, WORKSHOPS } from '@/world/workshops';
import { AwsIcon } from './AwsIcon';
import { feel } from './feedback';
import { GrowLine } from './Flashcards';
import { Portrait } from './Portrait';
import { useDialog, useShieldGame } from './useDialog';

/** Long enough for the last step's stars to float in the workshop before the card takes over. */
export const DONE_CARD_MS = 1200;

/**
 * The one big moment a finished workshop gets (store `workshopDone`): the card says the building is established and
 * how, while the city drops the gold plaque in front of it (CityScene, on the `workshopDone` bus event). The badge it
 * may earn is the badges' own toast (app/runtime.ts watchBadges), held until this card closes (store `toastsHeld`).
 */
export function WorkshopDone() {
  // The store holds the floor from the moment the workshop finishes (toasts wait); the card itself comes up a beat later.
  const held = useCity((s) => s.workshopDone);
  const [done, setDone] = useState<{ workshopId: string; serviceId: string }>();
  const box = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const progress = useCity((s) => s.progress.workshops);
  const demo = useCity((s) => s.backendKind === 'mock');
  useEffect(() => {
    const w = held ? workshopById(held) : undefined;
    if (!w) return setDone(undefined);
    const timer = setTimeout(() => {
      // The workshop's own panel makes way: one card at a time.
      if (useCity.getState().workshopOpen === w.id) useCity.getState().openWorkshop(undefined);
      setDone({ workshopId: w.id, serviceId: w.serviceId });
      feel.win();
    }, DONE_CARD_MS);
    return () => clearTimeout(timer);
  }, [held]);
  const close = () => useCity.getState().celebrateWorkshop(undefined);
  const w = done ? workshopById(done.workshopId) : undefined;
  useDialog(!!w, box, close, first);
  useShieldGame(!!w, scrim);
  if (!w || !done) return null;

  const place = placeFor(w.serviceId)?.place ?? w.serviceId;
  const st = workshopStatus(progress?.[w.id], w.steps.map((s) => s.id));
  const next = WORKSHOPS.find((x) => x.id !== w.id && !progress?.[x.id]?.done);
  const see = () => {
    close();
    feel.tap();
    bus.emit('flyTo', { id: w.serviceId });
  };
  return (
    <div ref={scrim} className="finding-scrim app-modal celebrate-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <section ref={box} className="finding-card celebrate workshop-done" role="dialog" aria-modal="true" aria-labelledby="workshop-done-title">
        <div className="celebrate-burst" aria-hidden="true">
          🏅
        </div>
        <h3 id="workshop-done-title">Workshop complete!</h3>
        <p className="celebrate-name">
          <AwsIcon serviceId={w.serviceId} size={20} /> {w.title}
        </p>
        <p className="celebrate-stars" aria-label={`A bonus of ${FINISH_XP} stars`}>
          +{FINISH_XP} ⭐ bonus
        </p>
        <div className="workshop-plaque" aria-hidden="true">
          <span>ESTABLISHED</span>
        </div>
        <p>
          {place} is established: a gold plaque now stands in front of it.{' '}
          {st.real > 0 ? `${st.real} of ${st.of} steps were checked in your account.` : demo ? 'Every step was practice (this is the demo).' : `All ${st.of} steps done in practice. Run them for real in CloudShell for more stars.`}
        </p>
        <GrowLine serviceId={w.serviceId} />
        <div className="celebrate-say">
          <Portrait id="builder" size={32} />
          <p>
            <b>{SPECIAL_AGENTS.builder.name.split(' the ')[0]}:</b> Hands on is how it sticks. {next ? `Next up, if you fancy it: “${next.title}”.` : 'That was the last one: every workshop is done!'}
          </p>
        </div>
        <div className="celebrate-actions">
          <button ref={first} className="btn primary wide" onClick={see}>
            See {place} in the city
          </button>
          {next && (
            <button
              className="btn ghost wide"
              onClick={() => {
                close();
                feel.tap();
                useCity.getState().openWorkshop(next.id);
              }}
            >
              Next workshop: {next.title} →
            </button>
          )}
          <button className="btn ghost wide" onClick={close}>
            Keep exploring
          </button>
        </div>
      </section>
    </div>
  );
}
