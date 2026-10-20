// Juice (plan round 3, Step 2): earned City Coins fly to the HUD's coin counter, from where the player just pressed (or
// the middle of the page), and the counter bumps as they land. Purely visual: the coins are already in the wallet.
// Nothing flies under reduced motion (the counter's bump says it), while the page is hidden, or without the counter.
import { useEffect } from 'react';
import { bus } from '@/state/bus';
import { coinMarkup } from './icons';

const still = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Where the player last pressed (CSS px), for a coin's start. */
let lastPress: { x: number; y: number; at: number } | undefined;

export function CoinFly() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => (lastPress = { x: e.clientX, y: e.clientY, at: Date.now() });
    window.addEventListener('pointerdown', onDown, true);
    const off = bus.on('coins', ({ n, from }) => {
      if (n <= 0 || still() || document.hidden) return;
      const target = document.querySelector('.hud-coins');
      if (!target || typeof (target as HTMLElement).animate !== 'function') return;
      const to = target.getBoundingClientRect();
      const recent = lastPress && Date.now() - lastPress.at < 4_000 ? lastPress : undefined;
      const start = from ?? recent ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.6 };
      const count = Math.min(5, Math.max(1, Math.ceil(n / 10)));
      for (let i = 0; i < count; i++) {
        const el = document.createElement('span');
        el.className = 'coin-fly';
        el.innerHTML = coinMarkup(18); // the pixel coin (the emoji is a grey ball without a colour emoji font)
        el.setAttribute('aria-hidden', 'true');
        el.style.left = `${start.x}px`;
        el.style.top = `${start.y}px`;
        document.body.appendChild(el);
        const dx = to.left + to.width / 2 - start.x;
        const dy = to.top + to.height / 2 - start.y;
        // A little arc: up and sideways first, then into the counter.
        const lift = -40 - i * 8;
        const anim = el.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
            { transform: `translate(calc(-50% + ${dx * 0.3 + (i - count / 2) * 10}px), calc(-50% + ${lift}px)) scale(1.1)`, opacity: 1, offset: 0.35 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.7)`, opacity: 0.9 },
          ],
          { duration: 700 + i * 70, delay: i * 60, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' },
        );
        anim.onfinish = () => el.remove();
        anim.oncancel = () => el.remove();
      }
    });
    return () => {
      off();
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, []);
  return null;
}
