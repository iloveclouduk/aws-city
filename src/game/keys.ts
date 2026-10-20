/**
 * Phaser listens for keys on the whole window. Arrow keys and E belong to the game only when nothing
 * (the body) or the game canvas has focus; tabs, menus, the tour and form fields all use them too.
 */
export function keysBelongToUi(active: Element | null, canvas: HTMLCanvasElement | undefined): boolean {
  if (!active || active.tagName === 'BODY' || active.tagName === 'HTML') return false;
  return active !== canvas;
}

/** Input types that are only clicked, never typed into: a scene starting from one of them may take focus. */
const CLICKED_INPUTS = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image']);

/**
 * Whether a scene that just started (a mini-game, the city) may move focus to the canvas, so its keys work at once.
 * Not while the player is typing (an input, a textarea, a select, editable text: a typed command can start a
 * scene) and not out of a modal dialog (the tour, a card): those keep their focus, and Tab still reaches the canvas.
 */
export function mayFocusGame(active: Element | null): boolean {
  if (!active || active.tagName === 'BODY' || active.tagName === 'HTML' || active.tagName === 'CANVAS') return true;
  const tag = active.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (tag === 'INPUT' && !CLICKED_INPUTS.has(((active as HTMLInputElement).type || 'text').toLowerCase())) return false;
  if ((active as HTMLElement).isContentEditable) return false;
  return !active.closest?.('[aria-modal="true"]');
}
