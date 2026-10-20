import { Fragment, type ReactNode } from 'react';

// The panel's icon set is pixel art, drawn on the same kind of grid as the city: 10×10 bitmaps rendered as
// crisp rects in currentColor. Sizes stay on multiples of 10 (10/20/30px) so every cell is whole pixels.

const BITMAPS = {
  home: ['....##....', '...####...', '..######..', '.########.', '##########', '.##....##.', '.##.##.##.', '.##.##.##.', '.##.##.##.', '.########.'],
  quests: ['.#........', '.#######..', '.########.', '.#######..', '.######...', '.#........', '.#........', '.#........', '.#........', '###.......'],
  learn: ['...######.', '...#....#.', '.######.#.', '.#....#.#.', '.#.##.#.#.', '.#....#.#.', '.#.##.#.#.', '.#....###.', '.#....#...', '.######...'],
  map: ['...####...', '..######..', '.###..###.', '.##....##.', '.###..###.', '..######..', '..######..', '...####...', '....##....', '....##....'],
  deploy: ['...####...', '..#....#..', '.#......#.', '#...##...#', '#..####..#', '#.######.#', '.#..##..#.', '....##....', '....##....', '....##....'],
  more: ['..........', '..........', '..........', '..........', '##..##..##', '##..##..##', '..........', '..........', '..........', '..........'],
  console: ['##########', '#........#', '#.#......#', '#..#.....#', '#.#..##..#', '#........#', '##########', '....##....', '..######..', '..........'],
  camera: ['..........', '...###....', '##########', '#...##...#', '#..#..#..#', '#..#..#..#', '#...##...#', '##########', '..........', '..........'],
  send: ['........##', '......####', '....###.##', '..###..##.', '###...##..', '..#..##...', '..#.##....', '..###.....', '..##......', '..#.......'],
  chevronUp: ['..........', '..........', '..........', '....##....', '...####...', '..##..##..', '.##....##.', '.#......#.', '..........', '..........'],
  chevronDown: ['..........', '..........', '.#......#.', '.##....##.', '..##..##..', '...####...', '....##....', '..........', '..........', '..........'],
  back: ['..........', '......#...', '.....##...', '....##....', '...##.....', '...##.....', '....##....', '.....##...', '......#...', '..........'],
  lock: ['..........', '...####...', '..##..##..', '..#....#..', '.########.', '.###..###.', '.###..###.', '.########.', '.########.', '..........'],
} as const;

export type IconName = keyof typeof BITMAPS;

/** One path of 1×1 squares per filled cell (merged per row run, so the SVG stays tiny). */
const PATHS = Object.fromEntries(
  Object.entries(BITMAPS).map(([name, rows]) => {
    let d = '';
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '#') continue;
        let w = 1;
        while (row[x + w] === '#') w++;
        d += `M${x} ${y}h${w}v1h-${w}z`;
        x += w - 1;
      }
    });
    return [name, d];
  }),
) as Record<IconName, string>;

export function Icon({ name, size = 20 }: { name: IconName; size?: 10 | 20 | 30 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true">
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  );
}

// City Coins: a pixel coin in its own colours, never the 🪙 emoji (it renders as a grey ball where there's no colour emoji
// font). `.` is empty, `r` the rim, `f` the face, `s` the shine, `m` the mark stamped on it.
const COIN = ['...rrrr...', '.rrffffrr.', '.rsfffffr.', 'rsfffmfffr', 'rffffmfffr', 'rffffmfffr', 'rffffmfffr', '.rffffffr.', '.rrffffrr.', '...rrrr...'];
export const COIN_EMOJI = '🪙';
const COIN_FILL: Record<string, string> = { r: '#a16207', f: '#facc15', s: '#fef9c3', m: '#a16207' };
const COIN_PATHS = Object.entries(COIN_FILL).map(([k, fill]) => {
  let d = '';
  COIN.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === k) d += `M${x} ${y}h1v1h-1z`;
  });
  return { fill, d };
});

/** A City Coin. `label` names it for screen readers (on its own it's decoration beside a number that says it). */
export function Coin({ size = 14, label }: { size?: number; label?: string }) {
  return (
    <svg
      className="icon coin"
      width={size}
      height={size}
      viewBox="0 0 10 10"
      shapeRendering="crispEdges"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {COIN_PATHS.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill} />
      ))}
    </svg>
  );
}

/** Text with each 🪙 drawn as the coin icon (toasts, logs and lines the state layer writes). */
export function withCoins(text: string): ReactNode {
  if (!text.includes(COIN_EMOJI)) return text;
  const parts = text.split(COIN_EMOJI);
  return parts.map((p, i) => (
    <Fragment key={i}>
      {p}
      {i < parts.length - 1 && <Coin label="City Coins" />}
    </Fragment>
  ));
}

/** The coin as SVG markup, for an element made outside React (CoinFly's flying coins). Built from constants only. */
export const coinMarkup = (size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true">${COIN_PATHS.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join('')}</svg>`;
