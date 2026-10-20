import { describe, expect, it } from 'vitest';
import { boxOfImage, CELL, cellsInView, cellsOf, cellKey, Culler, MARGIN, MOVE_PX, viewMoved } from '@/game/cull';

const fake = () => {
  const o = { visible: true, calls: 0, setVisible(v: boolean) { o.visible = v; o.calls++; } };
  return o;
};
const view = (x: number, y: number, w = 400, h = 300) => ({ x, y, width: w, height: h });

describe('static prop culling (src/game/cull.ts)', () => {
  it('puts a box in every grid cell it covers', () => {
    expect(cellsOf({ x: 10, y: 10, w: 20, h: 20 })).toEqual([cellKey(0, 0)]);
    expect(cellsOf({ x: CELL - 5, y: -5, w: 10, h: 10 }).sort()).toEqual([cellKey(0, -1), cellKey(1, -1), cellKey(0, 0), cellKey(1, 0)].sort());
    // A box ending exactly on a cell line stays in its own cell.
    expect(cellsOf({ x: 0, y: 0, w: CELL, h: CELL })).toEqual([cellKey(0, 0)]);
  });

  it('a view covers its cells plus the margin', () => {
    const cs = cellsInView({ x: 0, y: 0, w: CELL, h: CELL });
    expect(cs).toContain(cellKey(0, 0));
    expect(cs).toContain(cellKey(-1, -1)); // the margin reaches back over the line
    expect(MARGIN).toBeGreaterThan(MOVE_PX); // the view can drift MOVE_PX between updates and still show what's there
  });

  it('works the visible set out again only when the view moves more than MOVE_PX or zooms', () => {
    const last = { x: 0, y: 0, w: 400, h: 300, zoom: 2 };
    expect(viewMoved(undefined, last, 2)).toBe(true);
    expect(viewMoved(last, { x: MOVE_PX, y: 0, w: 400, h: 300 }, 2)).toBe(false);
    expect(viewMoved(last, { x: MOVE_PX + 1, y: 0, w: 400, h: 300 }, 2)).toBe(true);
    expect(viewMoved(last, { x: 0, y: 0, w: 400, h: 300 }, 3)).toBe(true);
  });

  it('shows what is near the view and hides the rest, touching only objects whose state changes', () => {
    const c = new Culler();
    const near = fake();
    const far = fake();
    const wide = fake();
    c.add(near, { x: 50, y: 50, w: 32, h: 32 });
    c.add(far, { x: 3000, y: 3000, w: 32, h: 32 });
    c.add(wide, { x: -100, y: 2000, w: 10, h: 1200 }); // tall: its top cell is far, its foot reaches the view later
    expect(near.visible && far.visible).toBe(true); // no view yet: everything shows
    expect(c.update(view(0, 0), 1)).toBe(true);
    expect(near.visible).toBe(true);
    expect(far.visible).toBe(false);
    expect(wide.visible).toBe(false);
    expect(c.stats()).toEqual({ culled: 3, visible: 1 });
    const calls = near.calls;
    expect(c.update(view(10, 10), 1)).toBe(false); // under MOVE_PX: nothing to do
    c.update(view(2900, 2900), 1);
    expect(near.visible).toBe(false);
    expect(far.visible).toBe(true);
    expect(near.calls).toBe(calls + 1);
    c.update(view(-300, 2600), 1);
    expect(wide.visible).toBe(true);
  });

  it('a newly added object matches the current view at once, and a removed one is forgotten', () => {
    const c = new Culler();
    c.update(view(0, 0), 1);
    const late = fake();
    c.add(late, { x: 5000, y: 5000, w: 8, h: 8 });
    expect(late.visible).toBe(false);
    const here = fake();
    c.add(here, { x: 0, y: 0, w: 8, h: 8 });
    expect(here.visible).toBe(true);
    c.remove(here);
    c.update(view(5000, 5000), 1);
    expect(here.visible).toBe(true); // left as it was: the owner destroys it
    expect(late.visible).toBe(true);
    expect(c.stats().culled).toBe(1);
  });

  it("reads an Image's box from its origin and size", () => {
    expect(boxOfImage({ x: 100, y: 200, originX: 0.5, originY: 1, displayWidth: 40, displayHeight: 60 })).toEqual({ x: 80, y: 140, w: 40, h: 60 });
  });
});
