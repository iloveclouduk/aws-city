import { cityHealth, openFindings, severityRank, useCity, type FindingView } from '@/state/store';
import { dayKey, type DayLog } from '@/state/progress';
import { lightsOf, lightsView } from '@/state/lights';
import { citizenById } from '@/world/citizens';
import { placeFor } from '@/world/places';
import { serviceById } from '@/world/taxonomy';
import { feel } from './feedback';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1 card reviewed, 1 puzzle passed", or null when nothing's done yet today. */
function todayText(log: DayLog | undefined, day: string) {
  if (!log || log.day !== day) return null;
  const parts = [
    log.cards && `${plural(log.cards, 'card')} reviewed`,
    log.puzzles && `${plural(log.puzzles, 'puzzle')} passed`,
    log.fixes && `${plural(log.fixes, 'fix', 'fixes')} approved`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** The citizen with the most urgent open finding speaks for the city: "Priya found a problem near S3 Lake". */
export function urgent(open: FindingView[]) {
  const top = [...open].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.seenAt - a.seenAt)[0];
  if (!top) return undefined;
  const who = citizenById(top.citizenId)?.name ?? 'A citizen';
  const where = placeFor(top.serviceId)?.place ?? serviceById(top.serviceId)?.name ?? 'town';
  const more = open.length - 1;
  return { finding: top, text: `${who} found a problem near ${where}${more ? ` (and ${more} more)` : ''}` };
}

/**
 * One line on Home: the city's health (from open findings), who found what, and your City Lights.
 * Tapping it opens the most urgent finding.
 */
export function CityHealth() {
  const findings = useCity((s) => s.findings);
  const streak = useCity((s) => s.progress.streak);
  const lights = useCity((s) => s.progress.lights);
  const log = useCity((s) => s.today);
  const openCard = useCity((s) => s.openFinding);
  const day = dayKey();

  const all = Object.values(findings);
  const open = openFindings(findings);
  const done = todayText(log, day);
  // Nothing to say yet: no city to look after and no learning so far.
  if (!all.length && !streak && !lights && !done) return null;

  const { score, label } = cityHealth(open);
  const tone = score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad';
  const lead = urgent(open);
  // City Lights (src/state/lights.ts): a window per learning day; a break dims one, it never ends anything.
  const lit = lightsView(lightsOf({ lights, streak }), day);
  const streakText = lit.total ? `💡 ${lit.glowing} ${lit.glowing === 1 ? 'window' : 'windows'} lit` : 'No windows lit yet';
  const say = lead ? lead.text : open.length ? label : all.length ? 'Everything is fixed' : label;
  const body = (
    <>
      {/* Named, not a bare number: it's the city's health out of 100 (open problems lower it). */}
      <span className={`health-score ${tone}`} aria-label={`City health ${score} out of 100`}>
        Health {score}
      </span>
      <span className="health-sum">
        <b>{say}</b> · {streakText}
        {done ? ` · today: ${done}` : ''}
      </span>
    </>
  );

  return (
    <section className="health compact" aria-label="City health">
      {lead ? (
        <button
          className="health-line"
          title={`City health ${score}: ${label}. Tap to see the problem.`}
          onClick={() => {
            feel.tap();
            openCard(lead.finding.id);
          }}
        >
          {body}
          <span className="health-chev" aria-hidden="true">
            ›
          </span>
        </button>
      ) : (
        <div className="health-line" title={`City health ${score}: ${label}. ${streakText}`}>
          {body}
        </div>
      )}
    </section>
  );
}
