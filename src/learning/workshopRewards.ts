// What a workshop pays its building. Doing it for real (checked in the account) is the hardest learning in the city,
// so it pays the most; practice in the simulated terminal pays a little, and doing a practised step for real later
// pays the rest. A step done again pays nothing, and finishing the whole workshop pays a bonus once. Each step pays at
// most once per mode, ever, so there's no daily ledger here: doing a whole workshop in one sitting pays the same as
// spreading it over a week.
import type { WorkshopProgress } from '@/backend/contract';

export const PRACTICE_STEP_XP = 3;
export const REAL_STEP_XP = 8;
export const FINISH_XP = 15;

export type StepMode = 'practice' | 'real';

/**
 * Stars for doing `stepId` in `mode`, given what was done before. Each hint taken on the step (the practice terminal's
 * Hint button) costs a star, but a step that pays still pays at least one.
 */
export function stepReward(prev: WorkshopProgress | undefined, stepId: string, mode: StepMode, hints = 0) {
  const had = prev?.steps[stepId];
  if (had === 'real' || had === mode) return 0;
  const full = mode === 'real' ? REAL_STEP_XP - (had === 'practice' ? PRACTICE_STEP_XP : 0) : PRACTICE_STEP_XP;
  return Math.max(1, full - Math.max(0, Math.floor(hints)));
}

/** In the offline demo nothing is real: a "for real" step there is practice (practice stars, never the For Real badge). */
export const honestMode = (mode: StepMode, demo: boolean): StepMode => (demo ? 'practice' : mode);

/** The workshop after this step, and whether this step finished it (every step done, once). */
export function withStep(prev: WorkshopProgress | undefined, stepIds: string[], stepId: string, mode: StepMode, today: string) {
  const had = prev?.steps[stepId];
  const steps = { ...prev?.steps, [stepId]: had === 'real' ? 'real' : mode } as WorkshopProgress['steps'];
  const finished = !prev?.done && stepIds.every((id) => steps[id]);
  const done = prev?.done ?? (finished ? today : undefined);
  return { next: done ? { steps, done } : { steps }, finished };
}

/** "3 of 6 steps", with how many were checked for real. */
export function workshopStatus(w: WorkshopProgress | undefined, stepIds: string[]) {
  const done = stepIds.filter((id) => w?.steps[id]).length;
  const real = stepIds.filter((id) => w?.steps[id] === 'real').length;
  return { done, real, of: stepIds.length, finished: !!w?.done };
}
