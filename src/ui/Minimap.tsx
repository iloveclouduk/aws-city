// The minimap and the map credit, over the city (src/game/minimap.ts does the colours and the maths). The minimap is a
// small canvas in the city's own isometric turn: the camera's view is the gold box, a click (or drag) moves the camera
// there, and M (or the 🗺 button) shows or hides it. On by default in the full tab, behind the button in the side panel.
// Nothing here touches the network: the plan and the map data are bundled.
import { useEffect, useRef, useState } from 'react';
import type { Layout } from '@/app/runtime';
import { OSM_COPYRIGHT_URL, openOsmCopyright } from '@/app/runtime';
import { css, miniFocus, miniGrid, miniView, type MiniGrid } from '@/game/minimap';
import { bus, type MinimapState } from '@/state/bus';
import { isDiscovered, useCity } from '@/state/store';
import { cityPlanFor, isRealMap } from '@/world/plan';
import { DISTRICTS, servicesIn, type DistrictId } from '@/world/taxonomy';

/** Minimap size, CSS px (the map's diamond is 2:1). */
export const MINI_W = 168;
export const MINI_H = 92;
/** How often the camera box follows the camera. */
const TICK_MS = 200;

/** Whether the minimap shows: the player's choice, else on in the full tab and off in the side panel. */
export const minimapShown = (pref: boolean | undefined, layout: Layout) => pref ?? layout === 'full';

/** M toggles the minimap, unless the player is typing. */
export const isMinimapKey = (e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'> & { target: EventTarget | null }) => {
  if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'm' && e.key !== 'M')) return false;
  const t = e.target as HTMLElement | null;
  return !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? '')));
};

function useCityState(active: boolean) {
  const [state, setState] = useState<MinimapState>();
  useEffect(() => {
    if (!active) return;
    const ask = () => bus.emit('minimapState', { reply: setState });
    ask();
    const t = setInterval(ask, TICK_MS);
    return () => clearInterval(t);
  }, [active]);
  return active ? state : undefined;
}

export function Minimap({ layout }: { layout: Layout }) {
  const inCity = useCity((s) => s.view.name === 'city');
  const pref = useCity((s) => s.prefs.minimap);
  const setPref = useCity((s) => s.setPref);
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const shown = minimapShown(pref, layout);
  const state = useCityState(inCity && shown);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tiles = useRef<{ key: string; grid: MiniGrid; img: HTMLCanvasElement; core: number } | undefined>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!inCity || !isMinimapKey(e)) return;
      setPref('minimap', !minimapShown(useCity.getState().prefs.minimap, layout));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [inCity, layout, setPref]);

  // The grid is redrawn only when the plan, the landscape or a district's open state changes; the box every tick.
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !state) return;
    const open = (d: DistrictId) => servicesIn(d).some((s) => isDiscovered(progress, s.id, region));
    const opens = DISTRICTS.map((d) => (open(d.id) ? 1 : 0)).join('');
    const key = `${state.plan.id}|${region}|${state.terrain ? 1 : 0}|${opens}`;
    if (tiles.current?.key !== key) {
      const grid = miniGrid({ plan: state.plan, terrain: state.terrain, districtOpen: open });
      const img = document.createElement('canvas');
      img.width = img.height = grid.size;
      const g = img.getContext('2d');
      if (g) {
        const data = g.createImageData(grid.size, grid.size);
        grid.colours.forEach((col, i) => {
          data.data.set([(col >> 16) & 255, (col >> 8) & 255, col & 255, 255], i * 4);
        });
        g.putImageData(data, 0, 0);
      }
      tiles.current = { key, grid, img, core: state.plan.size };
    }
    const dpr = Math.max(1, Math.round(globalThis.devicePixelRatio || 1));
    if (c.width !== MINI_W * dpr) (c.width = MINI_W * dpr), (c.height = MINI_H * dpr);
    const v = miniView(tiles.current.grid, MINI_W, MINI_H, miniFocus(state.plan.size));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    const [a, b, cc, d, e, f] = v.gridMatrix;
    ctx.setTransform(a * dpr, b * dpr, cc * dpr, d * dpr, e * dpr, f * dpr);
    ctx.drawImage(tiles.current.img, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const box = v.box(state.view);
    ctx.strokeStyle = css(0xffc233);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.round(box.w), Math.round(box.h));
    // City Clients: the stations of the business being helped, as yellow dots (the "!" markers in the city).
    const min = tiles.current.grid.min;
    for (const t of state.stations ?? []) {
      const X = t.x - min + 0.5;
      const Y = t.y - min + 0.5;
      ctx.beginPath();
      ctx.arc(a * X + cc * Y + e, b * X + d * Y + f, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = css(0xffd23f);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = css(0x2a1a04);
      ctx.stroke();
    }
  }, [state, progress, region]);

  if (!inCity) return null;
  const toggle = (
    <button
      className={`minimap-btn ${shown ? 'on' : ''}`}
      aria-pressed={shown}
      aria-label={shown ? 'Hide the minimap (M)' : 'Show the minimap (M)'}
      title={shown ? 'Hide the minimap (M)' : 'Show the minimap (M)'}
      onClick={() => setPref('minimap', !shown)}
    >
      🗺
    </button>
  );
  if (!shown) return toggle;
  const pan = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = tiles.current;
    if (!t || (e.type === 'pointermove' && !e.buttons)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p = miniView(t.grid, MINI_W, MINI_H, miniFocus(t.core)).toWorld(((e.clientX - r.left) * MINI_W) / r.width, ((e.clientY - r.top) * MINI_H) / r.height);
    bus.emit('panTo', { x: Math.round(p.x), y: Math.round(p.y) });
  };
  const city = state?.plan.city;
  return (
    <>
      {toggle}
      <div className="minimap">
        <canvas
          ref={canvas}
          style={{ width: MINI_W, height: MINI_H }}
          role="img"
          aria-label={`Minimap of the city${city ? ` (streets of ${city})` : ''}: the gold box is what you see. Click a spot to look there.`}
          onPointerDown={pan}
          onPointerMove={pan}
        />
      </div>
    </>
  );
}

/** "© OpenStreetMap contributors" in the corner of a city built from a real street map (every zoom). */
export function MapCredit() {
  const inCity = useCity((s) => s.view.name === 'city');
  const region = useCity((s) => s.cityRegion);
  if (!inCity || !isRealMap(cityPlanFor(region))) return null;
  return (
    <div className="map-credit">
      <OsmCredit />
    </div>
  );
}

/** The credit with its link to the licence page (opened in a new tab, never fetched). */
export function OsmCredit() {
  return (
    <span className="osm-credit">
      ©{' '}
      <a
        href={OSM_COPYRIGHT_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          openOsmCopyright();
        }}
      >
        OpenStreetMap
      </a>{' '}
      contributors
    </span>
  );
}
