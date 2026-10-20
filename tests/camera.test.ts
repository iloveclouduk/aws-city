import { describe, expect, it } from 'vitest';
import { buildingFocusY, CORE, coreFor, fitZoom, frameTarget } from '@/game/camera';
import { CITY_ISO, toScreen } from '@/game/iso';
import { GRID, TOWN_SQUARE } from '@/world/layout';
import { somePlans } from './support/plans';

describe('camera framing', () => {
  it('the core is the 40-tile diamond (~1280×640 at zoom 1) plus a little room', () => {
    expect(CORE.w).toBeGreaterThanOrEqual(2 * GRID * CITY_ISO.halfW);
    expect(CORE.h).toBeGreaterThanOrEqual(2 * GRID * CITY_ISO.halfH);
    expect(CORE.w).toBeLessThan(1300);
    expect(CORE.h).toBeLessThan(700);
  });

  it('the side panel (400×560) gets zoom 1 on the Town Square', () => {
    const f = frameTarget(400, 560);
    expect(f.zoom).toBe(1);
    expect(f.target).toBe('square');
    const r = TOWN_SQUARE.rect;
    expect({ x: f.x, y: f.y }).toEqual(toScreen(CITY_ISO, r.x + (r.w - 1) / 2, r.y + (r.h - 1) / 2));
  });

  it('a laptop tab (1400×880) shows the whole core at zoom 1', () => {
    expect(frameTarget(1400, 880)).toMatchObject({ zoom: 1, target: 'core' });
  });

  it('a big screen (2600×1400) gets zoom 2', () => {
    expect(frameTarget(2600, 1400)).toMatchObject({ zoom: 2, target: 'core' });
  });

  it('zoom is always a whole number in [1, 4]', () => {
    for (const [w, h] of [[300, 200], [1300, 700], [5200, 2800], [20000, 20000]]) {
      const z = frameTarget(w, h).zoom;
      expect(Number.isInteger(z)).toBe(true);
      expect(z).toBeGreaterThanOrEqual(1);
      expect(z).toBeLessThanOrEqual(4);
    }
    expect(fitZoom(20000, 20000)).toBe(4);
    expect(fitZoom(300, 200)).toBe(0);
  });
});

describe('framing a building (buildingFocusY)', () => {
  it('frames a short building just above its ground, as before', () => {
    expect(buildingFocusY(500, 460, 800, 2)).toBe(470);
  });

  it('frames a tall tower by its middle, so the tower and its crown show', () => {
    expect(buildingFocusY(500, 260, 800, 2)).toBe(380);
  });

  it('never so high that the ground leaves the view', () => {
    // 200 world px visible at zoom 4: the ground stays 40 px above the bottom edge
    const y = buildingFocusY(500, 100, 800, 4);
    expect(y).toBe(500 - 100 + 40);
    expect(500 - y).toBeLessThan(800 / 4 / 2);
  });
});

describe.each(somePlans().map((s) => [s.name, s] as const))('framing the real streets of %s', (_n, s) => {
  const p = s.plan;
  it('a 64×64 core doesn’t fit a laptop or the panel: they open on the Town Square at zoom 1', () => {
    for (const [w, h] of [[400, 560], [1400, 880]]) {
      const f = frameTarget(w, h, p);
      expect(f).toMatchObject({ zoom: 1, target: 'square' });
      expect({ x: f.x, y: f.y }).toEqual(toScreen(CITY_ISO, p.square.x + 5.5, p.square.y + 5.5));
    }
  });
  it('a 4K screen sees the whole core, on a whole-number zoom', () => {
    const f = frameTarget(3840, 2160, p);
    expect(f.target).toBe('core');
    expect(Number.isInteger(f.zoom)).toBe(true);
    expect(f).toMatchObject({ x: coreFor(64).x, y: coreFor(64).y });
  });
});
