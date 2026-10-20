// The infill sprites the art generator drew (art/tiles/infill.json, art/tiles/infill_art.py): name, kind, height class,
// footprint, style and height above the anchor, so the runtime never measures images. Bundled at build time; empty
// until the art exists (a glob finds no file), and the map draws only the ones in the atlas (hasSprite).
import type { InfillSprite } from './infill';

const FILES = import.meta.glob('../../art/tiles/infill.json', { eager: true, import: 'default' }) as Record<string, unknown>;

const parse = (raw: unknown): InfillSprite[] => {
  const list = Array.isArray(raw) ? raw : ((raw as { sprites?: unknown[] } | undefined)?.sprites ?? []);
  return list.filter(
    (s): s is InfillSprite =>
      !!s &&
      typeof (s as InfillSprite).name === 'string' &&
      ['low', 'mid', 'high', 'sky'].includes((s as InfillSprite).cls) &&
      ['warm', 'cool'].includes((s as InfillSprite).style) &&
      Number.isInteger((s as InfillSprite).fw) &&
      Number.isInteger((s as InfillSprite).fh) &&
      typeof (s as InfillSprite).h === 'number',
  );
};

export const INFILL_CATALOGUE: readonly InfillSprite[] = parse(Object.values(FILES)[0]);
