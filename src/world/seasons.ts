// The city's season (plan round 3, Step 3): snow, autumn leaves, spring blossom and summer by the real calendar and the
// Region's hemisphere (its latitude, shared/regions.json). Pure, so tests can pin the date. The art swaps
// `<name>` for `season:<season>:<name>` where that sprite exists (art/tiles: same canvas and anchor as the original),
// plus a ground tint and a few seasonal props within the decor that's already there (src/game/decor.ts).
import { regionInfo } from './regions';

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export const SEASONS: Season[] = ['winter', 'spring', 'summer', 'autumn'];

/** Inside the tropics (|latitude| under this) there's no winter to draw: the city stays in summer all year. */
export const TROPICS = 23.44;

/** Meteorological seasons in the north: Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn. */
const NORTH: Season[] = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
const FLIP: Record<Season, Season> = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };

/** The season at a latitude on a date (the month in UTC: a day either side of a month's end doesn't matter here). */
export function seasonAt(date: Date, lat: number): Season {
  if (Math.abs(lat) < TROPICS) return 'summer';
  const north = NORTH[date.getUTCMonth()];
  return lat >= 0 ? north : FLIP[north];
}

/** `winter` / `Winter` → 'winter'; anything else → undefined. */
export const parseSeason = (s: unknown): Season | undefined => {
  const v = typeof s === 'string' ? s.trim().toLowerCase() : '';
  return (SEASONS as string[]).includes(v) ? (v as Season) : undefined;
};

/** A Region city's season now: an override (the `?season=` dev param, or prefs) wins; an unknown Region is temperate north. */
export function seasonFor(region: string, date: Date = new Date(), override?: unknown): Season {
  return parseSeason(override) ?? seasonAt(date, regionInfo(region)?.lat ?? 45);
}

/**
 * A soft multiply over the baked ground, one per season (no extra draw call: it's the RenderTextures' own tint).
 * Close to white so the palette stays the palette: winter a little cold, autumn warm, spring fresh, summer bright.
 */
export const SEASON_TINT: Record<Season, number> = { winter: 0xe4ecf8, spring: 0xfaf8fc, summer: 0xfffcf2, autumn: 0xfff0dc };

/** Flat ground decals stamped into the baked ground over grass (no extra draw calls), and their share of grass tiles. */
export const SEASON_DECALS: Record<Season, { names: string[]; share: number }> = {
  winter: { names: ['season:winter:snow0', 'season:winter:snow1', 'season:winter:snow2'], share: 0.3 },
  autumn: { names: ['season:autumn:leaves0', 'season:autumn:leaves1'], share: 0.22 },
  spring: { names: ['season:spring:petals'], share: 0.12 },
  summer: { names: [], share: 0 },
};

/**
 * Props a season puts in place of some of the flower beds decor already plants (so the caps hold: nothing is added):
 * snowmen in winter, beach umbrellas in summer. Spring and autumn show in the trees and the ground instead.
 */
export const SEASON_PROPS: Record<Season, string[]> = {
  winter: ['season:winter:snowman'],
  summer: ['season:summer:umbrella0', 'season:summer:umbrella1'],
  spring: [],
  autumn: [],
};
/** Share of flower beds a season's prop takes. */
export const SEASON_PROP_SHARE = 0.5;
