// @vitest-environment jsdom
// The minimap (colours from the plan, the minimap ↔ world mapping, M and its default per surface) and the
// OpenStreetMap credit (shown only on a real street map, linking only to the licence page, never fetched).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { CITY_ISO, cornerScreen } from '@/game/iso';
import { dim, MINI, miniFocus, miniGrid, miniView } from '@/game/minimap';
import { DISTRICTS } from '@/world/taxonomy';
import { legacyPlan } from '@/world/plan';
import { ringOf } from '@/world/terrain';
import { samplePlans } from './support/plans';

const { isOsmUrl, OSM_COPYRIGHT_URL, openOsmCopyright } = await import('@/app/runtime');
const { isMinimapKey, MapCredit, minimapShown, OsmCredit } = await import('@/ui/Minimap');
const { useCity } = await import('@/state/store');

afterEach(() => cleanup());

describe('the minimap', () => {
  const [s] = samplePlans();
  const p = s.plan;

  it('colours every tile of the map from the plan: roads, the square, districts, water', () => {
    const g = miniGrid({ plan: p });
    const { min, size } = ringOf(p.size);
    expect([g.min, g.size, g.colours.length]).toEqual([min, size, size * size]);
    const at = (x: number, y: number) => g.colours[(y - min) * size + (x - min)];
    expect([MINI.road, MINI.avenue]).toContain(at(0, 0));
    expect(at(p.square.x + 1, p.square.y + 1)).toBe(MINI.square);
    expect(at(p.campus.x + 1, p.campus.y + 1)).toBe(MINI.campus);
    const s3 = p.landmarkLayout('s3')!.footprint;
    expect(at(s3.x, s3.y)).toBe(DISTRICTS.find((d) => d.id === 'storage')!.color);
    for (let y = 0; y < p.size; y++) for (let x = 0; x < p.size; x++) if (p.isWater?.(x, y)) expect(at(x, y)).toBe(MINI.sea);
  });

  it('dims a locked district', () => {
    const locked = miniGrid({ plan: p, districtOpen: (d) => d !== 'storage' });
    const s3 = p.landmarkLayout('s3')!.footprint;
    const { min, size } = locked;
    expect(locked.colours[(s3.y - min) * size + (s3.x - min)]).toBe(dim(DISTRICTS.find((d) => d.id === 'storage')!.color));
  });

  it('works on the legacy city too', () => {
    const g = miniGrid({ plan: legacyPlan() });
    expect(g.size).toBe(ringOf(40).size);
  });

  it('maps the minimap to world pixels and back, the core filling the box, the grid drawn as diamonds', () => {
    const g = miniGrid({ plan: p });
    const v = miniView(g, 168, 92, miniFocus(p.size));
    const w = { x: 123, y: -456 };
    const m = v.toMini(w.x, w.y);
    const back = v.toWorld(m.x, m.y);
    expect(back.x).toBeCloseTo(w.x, 6);
    expect(back.y).toBeCloseTo(w.y, 6);
    for (const [x, y] of [[-7, -7], [p.size + 7, -7], [-7, p.size + 7], [p.size + 7, p.size + 7]]) {
      const c = cornerScreen(CITY_ISO, x, y);
      const q = v.toMini(c.x, c.y);
      expect(q.x).toBeGreaterThanOrEqual(-0.01);
      expect(q.x).toBeLessThanOrEqual(168.01);
      expect(q.y).toBeGreaterThanOrEqual(-0.01);
      expect(q.y).toBeLessThanOrEqual(92.01);
    }
    const [a, b, c, d, e, f] = v.gridMatrix;
    const i = 30;
    const j = 12;
    const n = cornerScreen(CITY_ISO, g.min + i, g.min + j);
    const want = v.toMini(n.x, n.y);
    expect(a * i + c * j + e).toBeCloseTo(want.x, 6);
    expect(b * i + d * j + f).toBeCloseTo(want.y, 6);
  });

  it('is on in the full tab and off in the side panel until the player chooses', () => {
    expect(minimapShown(undefined, 'full')).toBe(true);
    expect(minimapShown(undefined, 'panel')).toBe(false);
    expect(minimapShown(true, 'panel')).toBe(true);
    expect(minimapShown(false, 'full')).toBe(false);
  });

  it('M toggles it, but not while typing or with a modifier', () => {
    const div = document.createElement('div');
    const input = document.createElement('input');
    expect(isMinimapKey({ key: 'm', ctrlKey: false, metaKey: false, altKey: false, target: div })).toBe(true);
    expect(isMinimapKey({ key: 'M', ctrlKey: false, metaKey: false, altKey: false, target: div })).toBe(true);
    expect(isMinimapKey({ key: 'm', ctrlKey: false, metaKey: false, altKey: false, target: input })).toBe(false);
    expect(isMinimapKey({ key: 'm', ctrlKey: true, metaKey: false, altKey: false, target: div })).toBe(false);
    expect(isMinimapKey({ key: 'n', ctrlKey: false, metaKey: false, altKey: false, target: div })).toBe(false);
  });
});

describe('the OpenStreetMap credit', () => {
  it('opens only the licence page on www.openstreetmap.org', async () => {
    expect(OSM_COPYRIGHT_URL).toBe('https://www.openstreetmap.org/copyright');
    expect(isOsmUrl(OSM_COPYRIGHT_URL)).toBe(true);
    for (const bad of ['http://www.openstreetmap.org/copyright', 'https://openstreetmap.org.evil.example/', 'https://u@www.openstreetmap.org/', 'javascript:alert(1)', 'https://tile.openstreetmap.org/1/1/1.png'])
      expect(isOsmUrl(bad), bad).toBe(false);
    fakeBrowser.reset();
    const create = vi.spyOn(fakeBrowser.tabs, 'create');
    openOsmCopyright('https://evil.example/');
    expect(create).not.toHaveBeenCalled();
    render(<OsmCredit />);
    fireEvent.click(screen.getByRole('link', { name: 'OpenStreetMap' }));
    expect(create).toHaveBeenCalledWith({ url: OSM_COPYRIGHT_URL });
  });

  it('shows over a city built from a real street map, and not over the legacy city or the world map', () => {
    const real = samplePlans().find((x) => !x.name.startsWith('fixture:'));
    if (real) {
      useCity.setState({ cityRegion: real.region, view: { name: 'city' } });
      const { container, unmount } = render(<MapCredit />);
      expect(container.textContent).toBe('© OpenStreetMap contributors');
      unmount();
      useCity.setState({ view: { name: 'world' } });
      expect(render(<MapCredit />).container.textContent).toBe('');
      cleanup();
    }
    useCity.setState({ cityRegion: 'xx-nowhere-1', view: { name: 'city' } });
    expect(render(<MapCredit />).container.textContent).toBe('');
  });
});
