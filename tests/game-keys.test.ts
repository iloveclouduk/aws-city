import { describe, expect, it } from 'vitest';
import { keysBelongToUi, mayFocusGame } from '@/game/keys';

const el = (tagName: string) => ({ tagName }) as Element;

describe('arrow keys: game or UI', () => {
  const canvas = el('CANVAS') as HTMLCanvasElement;
  it('walk the player when nothing or the canvas has focus', () => {
    expect(keysBelongToUi(null, canvas)).toBe(false);
    expect(keysBelongToUi(el('BODY'), canvas)).toBe(false);
    expect(keysBelongToUi(canvas, canvas)).toBe(false);
  });
  it('stay with the UI on tabs, buttons, selects and inputs', () => {
    for (const t of ['BUTTON', 'SELECT', 'INPUT', 'TEXTAREA', 'DIV']) expect(keysBelongToUi(el(t), canvas)).toBe(true);
  });
});

describe('a scene that starts takes the keys', () => {
  const node = (tagName: string, more: { type?: string; isContentEditable?: boolean; modal?: boolean } = {}) =>
    ({ tagName, type: more.type, isContentEditable: !!more.isContentEditable, closest: () => (more.modal ? {} : null) }) as unknown as Element;
  it('from nothing, the canvas, or the button that launched it', () => {
    expect(mayFocusGame(null)).toBe(true);
    expect(mayFocusGame(node('BODY'))).toBe(true);
    expect(mayFocusGame(node('CANVAS'))).toBe(true);
    expect(mayFocusGame(node('BUTTON'))).toBe(true);
    expect(mayFocusGame(node('INPUT', { type: 'checkbox' }))).toBe(true);
  });
  it('never while the player is typing', () => {
    expect(mayFocusGame(node('INPUT'))).toBe(false);
    expect(mayFocusGame(node('INPUT', { type: 'text' }))).toBe(false);
    expect(mayFocusGame(node('INPUT', { type: 'search' }))).toBe(false);
    expect(mayFocusGame(node('TEXTAREA'))).toBe(false);
    expect(mayFocusGame(node('SELECT'))).toBe(false);
    expect(mayFocusGame(node('DIV', { isContentEditable: true }))).toBe(false);
  });
  it('never out of a modal dialog (the tour, a card)', () => {
    expect(mayFocusGame(node('BUTTON', { modal: true }))).toBe(false);
  });
});
