// Juice (plan round 3, Step 2): small, generous feedback for the player's own actions, shared by the panel and the
// city. A right answer rises in pitch while the run lasts; a beam of light runs from the card into its building; coins
// fly to the HUD's counter (src/ui/CoinFly.tsx); an upgrade pushes the camera in a step and back; and at night the
// City Lights (src/state/lights.ts) glow as windows on the buildings. Everything here respects reduced motion (callers
// pass `still`), and sounds go through src/game/audio.ts, so mute and captions hold. The pure parts are tested
// (tests/juice.test.ts); the scene parts take the scene as an argument and keep nothing.
import type Phaser from 'phaser';

// ── A run of right answers: the chime climbs a pentatonic step each time ──

/** A run ends after this long without an answer. */
export const RUN_GAP_MS = 20_000;
/** Semitones above the plain chime for each answer in a run (C-major pentatonic, so any step sounds kind). */
export const RUN_STEPS = [0, 2, 4, 7, 9, 12, 14, 16] as const;

export interface AnswerRun {
  n: number;
  at: number;
}

/** The run after an answer: a right one adds a step (a gap of RUN_GAP_MS starts over), a wrong one ends it. */
export function nextRun(run: AnswerRun | undefined, ok: boolean, now: number): AnswerRun {
  if (!ok) return { n: 0, at: now };
  const going = run && run.n > 0 && now - run.at <= RUN_GAP_MS;
  return { n: going ? run.n + 1 : 1, at: now };
}

/** The chime's pitch multiplier for the n-th right answer in a run (1 = the plain chime; holds at the top step). */
export const pitchOf = (n: number) => 2 ** (RUN_STEPS[Math.max(0, Math.min(RUN_STEPS.length - 1, n - 1))] / 12);

// ── City Lights: windows on the buildings at night ──

/** A building the windows may sit on: its image's top-left in world px, its size, and whether a pixel is solid. */
export interface WindowHost {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when the image is solid at (px, py), its own pixel coordinates. */
  solid: (px: number, py: number) => boolean;
}

/** FNV-1a with a murmur finish, so neighbouring keys ("s3:4", "s3:5") land far apart. */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};

/**
 * `n` window spots spread over the buildings, round-robin in id order, each on a solid pixel of the building's body
 * (the middle three fifths across, from a fifth down to the bottom fifth: walls, not roofs or the ground). The same
 * buildings always give the same spots, so the skyline doesn't shuffle. A building with no solid spot left is skipped.
 */
export function windowSpots(hosts: readonly WindowHost[], n: number): { x: number; y: number; host: string }[] {
  const order = [...hosts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: { x: number; y: number; host: string }[] = [];
  const used = new Set<string>();
  const tries = new Map<string, number>();
  for (let round = 0; out.length < n && round < n + 4; round++) {
    let placed = false;
    for (const b of order) {
      if (out.length >= n) break;
      let k = tries.get(b.id) ?? 0;
      for (let t = 0; t < 24; t++, k++) {
        const h = hash(`${b.id}:${k}`);
        // A 4×4 grid of window slots keeps them apart and lined up like real windows.
        const px = Math.floor(b.w * 0.2 + ((h % 997) / 997) * b.w * 0.6) & ~3;
        const py = Math.floor(b.h * 0.2 + (((h >>> 10) % 991) / 991) * b.h * 0.6) & ~3;
        const key = `${b.id}:${px}:${py}`;
        if (used.has(key) || !b.solid(px, py) || !b.solid(px + 2, py + 1)) continue;
        used.add(key);
        out.push({ x: b.x + px, y: b.y + py, host: b.id });
        placed = true;
        k++;
        break;
      }
      tries.set(b.id, k);
    }
    if (!placed) break;
  }
  return out;
}

// ── Scene helpers ──

/** A beam of light from `from` into `to` (world px), fading in half a second. Nothing under reduced motion. */
export function beam(scene: Phaser.Scene, from: { x: number; y: number }, to: { x: number; y: number }, color: number, still: boolean) {
  if (still) return;
  const g = scene.add.graphics().setDepth(70_003).setBlendMode('ADD');
  const draw = (k: number) => {
    g.clear();
    // The head runs ahead; the tail follows, so it reads as light travelling into the building.
    const head = Math.min(1, k * 1.6);
    const tail = Math.max(0, k * 1.6 - 0.6);
    const at = (t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    const a = at(tail);
    const b = at(head);
    g.lineStyle(7, color, 0.25 * (1 - k)).lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(3, color, 0.9 * (1 - k * 0.6)).lineBetween(a.x, a.y, b.x, b.y);
    if (head >= 1) g.fillStyle(color, 0.6 * (1 - k)).fillCircle(to.x, to.y, 10 * (1 - k) + 4);
  };
  const o = { k: 0 };
  scene.tweens.add({ targets: o, k: 1, duration: 650, ease: 'Sine.easeOut', onUpdate: () => draw(o.k), onComplete: () => g.destroy() });
}

/**
 * An upgrade's push-in: the camera steps one zoom level in and back (integer zoom at rest, as the city needs). Only
 * from an integer zoom below `max`, and never under reduced motion.
 */
export function pushIn(scene: Phaser.Scene, cam: Phaser.Cameras.Scene2D.Camera, max: number, still: boolean) {
  const z = cam.zoom;
  if (still || z >= max || z !== Math.round(z)) return false;
  cam.zoomTo(z + 1, 450, 'Sine.easeInOut', true);
  scene.time.delayedCall(1_900, () => {
    // The player zoomed meanwhile: leave their choice alone.
    if (Math.abs(cam.zoom - (z + 1)) < 0.01) cam.zoomTo(z, 600, 'Sine.easeInOut', true);
  });
  return true;
}
