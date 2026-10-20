// A City Clients "Wire it" job as an architecture puzzle (the same board, src/ui/ArchitectureBoard.tsx): the job's
// data flow in a row (who uses it, then each service the data passes through), every other needed or bonus service
// on a second row, and the job's distractors in the tray. Small and laid out from the data, so a job needs no
// hand-drawn diagram. Pure.
import type { Diagram, DiagramEdge, DiagramNode, Puzzle } from '@/world/content';
import type { WireJob } from '@/world/clients';
import { placeFor } from '@/world/places';
import { serviceById } from '@/world/taxonomy';

const short = (id: string) => (serviceById(id)?.name ?? id).replace(/^(Amazon|AWS) /, '');

/** The puzzle a Wire it job plays as (`job:<task id>`, never stored in Progress.puzzles). */
export function puzzleForJob(task: { id: string; title: string; wire: WireJob }, districtId = 'compute'): Puzzle {
  const w = task.wire;
  const flow = [...new Set(w.flow)];
  const rest = [...w.required, ...w.optional].filter((s, i, all) => !flow.includes(s) && all.indexOf(s) === i);
  const nodes: DiagramNode[] = [{ id: 'who', actor: 'users', x: 0, y: 0, role: 'Customers' }];
  flow.forEach((s, i) => nodes.push({ id: `f${i}`, service: s, x: i + 1, y: 0, role: w.required.includes(s) ? `Step ${i + 1}` : 'Bonus' }));
  rest.forEach((s, i) => nodes.push({ id: `r${i}`, service: s, x: i + 1, y: 1, role: w.required.includes(s) ? 'Needed too' : 'Bonus' }));
  const edges: DiagramEdge[] = flow.map((s, i) => ({
    from: i ? `f${i - 1}` : 'who',
    to: `f${i}`,
    label: i ? 'then' : 'starts',
    caption: i ? `${short(flow[i - 1])} hands the data to ${short(s)}.` : `It starts at ${short(s)}.`,
    step: i + 1,
  }));
  const cols = Math.max(flow.length, rest.length) + 1;
  const diagram: Diagram = {
    cols,
    rows: rest.length ? 2 : 1,
    groups: [{ id: 'cloud', kind: 'cloud', label: 'AWS Cloud', x: 1, y: 0, w: cols - 1, h: rest.length ? 2 : 1 }],
    nodes,
    edges,
    rejects: Object.fromEntries(w.distractors.map((s) => [s, `${short(s)} isn’t part of this job. ${placeFor(s)?.blurb ?? ''}`.trim()])),
  };
  return {
    id: `job:${task.id}`,
    title: task.title,
    districtId,
    tier: 1,
    story: w.story,
    requirements: w.requirements,
    required: w.required,
    optional: w.optional,
    distractors: w.distractors,
    flow,
    why: w.why,
    simpleWhy: w.simpleWhy,
    pillarBonus: {} as Puzzle['pillarBonus'],
    reference: w.reference,
    diagram,
  };
}
