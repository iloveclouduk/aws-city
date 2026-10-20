// Public Mayor names: two words from fixed lists ("Kind Otter"), never typed by a player, so there's nothing to
// moderate and nothing personal in them. The server accepts only this shape (server/src/contract/progress.ts).
const ADJECTIVES = ['Brave', 'Bright', 'Calm', 'Clever', 'Cosy', 'Eager', 'Gentle', 'Happy', 'Jolly', 'Keen', 'Kind', 'Lively', 'Lucky', 'Mellow', 'Merry', 'Nimble', 'Plucky', 'Quick', 'Quiet', 'Sunny', 'Swift', 'Tidy', 'Witty', 'Zesty'];
const ANIMALS = ['Badger', 'Beaver', 'Crane', 'Dolphin', 'Falcon', 'Ferret', 'Fox', 'Gecko', 'Heron', 'Koala', 'Lynx', 'Marten', 'Otter', 'Owl', 'Panda', 'Puffin', 'Quokka', 'Raven', 'Robin', 'Seal', 'Sparrow', 'Squirrel', 'Turtle', 'Wombat'];

/** A random Mayor name; `rand` is injectable for tests. */
export function mayorName(rand: () => number = Math.random) {
  return `${ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)]} ${ANIMALS[Math.floor(rand() * ANIMALS.length)]}`;
}

export const NAME_SHAPE = /^[A-Z][a-z]{1,15} [A-Z][a-z]{1,15}$/;
