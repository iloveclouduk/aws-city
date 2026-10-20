// A small stand-in for art/tiles/infill.json (the art contract: in:<style>:<kind>:<fw>x<fh>:<v>, heights within each
// class's limit), so the infill tests run whether or not the sprites have been generated.
import type { HeightClass, InfillSprite, InfillStyle } from '@/game/infill';

const KINDS: [string, HeightClass, number, number, number][] = [
  ['brownstone', 'low', 1, 1, 34],
  ['brownstone', 'low', 2, 1, 36],
  ['corner', 'low', 1, 1, 30],
  ['brownstone', 'low', 1, 2, 36],
  ['rowhouse', 'low', 2, 1, 38],
  ['rowhouse', 'low', 1, 2, 38],
  ['walkup', 'mid', 1, 1, 64],
  ['loft', 'mid', 1, 1, 72],
  ['loft', 'mid', 2, 1, 76],
  ['loft', 'mid', 1, 2, 76],
  ['prewar', 'high', 2, 2, 120],
  ['slab', 'high', 1, 1, 110],
  ['slab', 'high', 2, 2, 128],
  ['setback', 'sky', 2, 2, 176],
];

export const fakeCatalogue = (styles: InfillStyle[] = ['warm', 'cool']): InfillSprite[] =>
  styles.flatMap((style) =>
    KINDS.flatMap(([kind, cls, fw, fh, h]) => [0, 1].map((v) => ({ name: `in:${style}:${kind}:${fw}x${fh}:${v}`, kind, cls, fw, fh, style, h: h - v * 2 }))),
  );
