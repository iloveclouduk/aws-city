import { describe, expect, it } from 'vitest';
import { frame, ROOF_TIPS } from '../scripts/launcher/banner.mjs';
import { miniSkyline, renderPanel, stepsGrowth, type Step } from '../scripts/launcher/panel.mjs';

// The terminal city grows: the first run's intro raises the skyline lot by lot, and the panel's one-line skyline
// rises as the steps finish.
const width = (l: string) => [...l].length;
const lit = (lines: string[]) => lines.join('\n').split('').filter((c) => c === '▪').length;
const roofs = (lines: string[]) => lines.join('\n').split('').filter((c) => ROOF_TIPS.includes(c)).length;

describe('a growing skyline', () => {
  it('never runs past the edge, at any width or growth', () => {
    for (const w of [10, 20, 40, 60, 80, 84, 100, 120, 160, 200])
      for (const growth of [0, 0.3, 0.7, 1])
        for (const compact of [false, true]) for (const l of frame(2.2, w, { color: false, growth, compact })) expect(width(l), `${w} ${growth}`).toBeLessThanOrEqual(w);
  });

  it('lights more windows and tops out more roofs as it grows', () => {
    for (const w of [80, 120]) {
      const at = [0, 0.25, 0.5, 0.75, 1].map((growth) => frame(3, w, { color: false, growth }));
      for (let i = 1; i < at.length; i++) {
        expect(lit(at[i]), `${w} lights`).toBeGreaterThanOrEqual(lit(at[i - 1]));
        expect(roofs(at[i]), `${w} roofs`).toBeGreaterThanOrEqual(roofs(at[i - 1]));
      }
      expect(roofs(at[4])).toBeGreaterThan(roofs(at[0]));
    }
  });

  it('keeps one crane per unfinished step, whatever the growth', () => {
    for (const growth of [0, 0.5, 1]) for (const pending of [0, 1, 3]) expect(frame(1, 120, { color: false, growth, pending }).join('').split('┏').length - 1).toBe(pending);
  });
});

describe('the panel header skyline', () => {
  const step = (id: string, status: Step['status'], extra: Partial<Step> = {}): Step => ({ id, title: id, status, ...extra });

  it('is 0 before anything runs and 1 when everything is done or skipped', () => {
    expect(stepsGrowth([step('prepare', 'pending'), step('build', 'pending')])).toBe(0);
    expect(stepsGrowth([step('prepare', 'done'), step('build', 'skipped')])).toBe(1);
    expect(stepsGrowth([step('prepare', 'done'), step('build', 'running', { progress: 0.5 })])).toBeCloseTo(0.75);
    expect(stepsGrowth([step('prepare', 'done'), step('build', 'running')])).toBeCloseTo(0.75);
  });

  it('rises building by building and is always eight columns', () => {
    const height = (s: string) => [...s].reduce((n, ch) => n + '▁▂▃▄▅▆▇█'.indexOf(ch) + 1, 0);
    expect(miniSkyline(0)).toBe('▁▁▁▁▁▁▁▁');
    let last = 0;
    for (const g of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const line = miniSkyline(g);
      expect([...line].length).toBe(8);
      expect(height(line)).toBeGreaterThanOrEqual(last);
      last = height(line);
    }
    expect(miniSkyline(1)).toContain('█');
  });

  it('the panel shows it in its header and still fits small terminals', () => {
    const state = { steps: [step('prepare', 'done'), step('build', 'running', { progress: 0.4 }), step('open', 'pending')] };
    for (const [c, r] of [[80, 24], [120, 40], [200, 60]]) {
      const lines = renderPanel(state, 1, c, r, { color: false });
      expect(lines[0]).toContain(miniSkyline(stepsGrowth(state.steps)));
      expect(lines.length).toBeLessThan(r);
      for (const l of lines) expect(width(l)).toBeLessThan(c);
    }
  });
});
