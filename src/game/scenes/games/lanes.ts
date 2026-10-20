// Red Team Range's lanes (pure: no Phaser), so requests never overlap: one live request per lane. A request takes the
// time it needs to be read whatever its length, so a short one behind a long one in the same lane would catch it up;
// a lane only takes a new request once the last one has left it. With every lane busy the next request waits.

/** A random free lane, or -1 when every lane is busy (try again shortly). */
export function freeLane(busy: readonly boolean[], rand: () => number = Math.random): number {
  const free = busy.map((b, i) => (b ? -1 : i)).filter((i) => i >= 0);
  return free.length ? free[Math.floor(rand() * free.length)] : -1;
}
