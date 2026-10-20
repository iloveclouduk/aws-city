import { Coin, withCoins } from './icons';
import { useEffect, useRef, useState } from 'react';
import { bus } from '@/state/bus';
import { CATALOGUE, CATEGORIES, cityDecor, coinsToSpend, counterText, forSale, itemOfKind, lockedBecause, priceFor, type BuildCategory } from '@/state/buildmode';
import { useCity, type BuildTool } from '@/state/store';

const TOOLS: { id: BuildTool; label: string; icon: string }[] = [
  { id: 'place', label: 'Place', icon: '🌳' },
  { id: 'move', label: 'Move', icon: '✋' },
  { id: 'remove', label: 'Remove', icon: '🧹' },
];

const KEY_OF: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** The ⋯ menu's and the HUD's Decorate switch (build mode: decorations bought with City Coins). */
export function BuildToggle({ menu }: { menu?: () => void }) {
  const on = useCity((s) => !!s.build);
  const setBuild = useCity((s) => s.setBuild);
  if (menu)
    return (
      <button
        role="menuitemcheckbox"
        aria-checked={on}
        title="Decorate your city with City Coins: trees, fountains, benches, a sign with its name"
        onClick={() => {
          setBuild(!on);
          menu();
        }}
      >
        <span>🌳 Decorate</span>
        <span className={`switch ${on ? 'on' : ''}`} aria-hidden="true" />
      </button>
    );
  return (
    <button className={`btn tiny build-toggle ${on ? 'on' : ''}`} aria-pressed={on} title="Decorate your city with City Coins" onClick={() => setBuild(!on)}>
      🌳<span className="build-word"> Decorate</span>
    </button>
  );
}

/**
 * Decorate's drawer (build mode) over the bottom of the city: the tools, a palette by category (price, how many are placed, what
 * unlocks a locked one), the counter, Undo and Done, and the last result. The ghost and placing are the city's
 * (src/game/BuildLayer.ts); keys pressed here (arrows, Enter on the drawer, R, Esc) are passed to it.
 */
export function BuildDrawer() {
  const build = useCity((s) => s.build);
  const progress = useCity((s) => s.progress);
  const region = useCity((s) => s.cityRegion);
  const { buildPick, buildTool, buildUndo, setBuild } = useCity.getState();
  const [cat, setCat] = useState<BuildCategory>(() => (build?.kind && itemOfKind(build.kind)?.category) || 'nature');
  const box = useRef<HTMLElement>(null);
  const open = !!build;
  // Keys pressed in the drawer go to the city: arrows move the ghost, R turns it, Esc leaves, Ctrl/⌘+Z undoes. (Enter
  // stays the focused button's; "✔ Here" builds on the highlighted tile.)
  useEffect(() => {
    const el = box.current;
    if (!open || !el) return;
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_OF[e.key];
      if (dir) {
        e.preventDefault();
        bus.emit('buildKey', { key: dir });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        useCity.getState().setBuild(false);
      } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) bus.emit('buildKey', { key: 'turn' });
      else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        useCity.getState().buildUndo();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [open]);
  if (!build) return null;
  const props = cityDecor(progress, region).props;
  const owned = (id: string) => props.filter((q) => itemOfKind(q.kind)?.id === id).length;
  const wallet = coinsToSpend(progress);
  const picked = build.kind ? itemOfKind(build.kind) : undefined;
  const hint =
    build.tool === 'place'
      ? picked
        ? `Tap a green tile to build ${picked.name.toLowerCase()}.${picked.variants.length > 1 ? ` R: another ${picked.variantNoun ?? 'style'}.` : ''}`
        : 'Pick something to build.'
      : build.tool === 'move'
        ? build.moving
          ? 'Tap where it goes.'
          : 'Tap a decoration to pick it up.'
        : 'Tap a decoration to remove it (half its coins back).';

  return (
    <section className="build-drawer" aria-label="Decorate" ref={box}>
      <div className="bd-head">
        <h2 className="bd-title">🌳 Decorate</h2>
        <span className="bd-count" title={`Decorations in this city (at most ${counterText(progress, region).split('/')[1]})`} aria-label={`${props.length} of ${counterText(progress, region).split('/')[1]} decorations in this city`}>
          {counterText(progress, region)}
        </span>
        <span className="bd-stars bd-coins" title="City Coins to spend. Jobs, mini-games, workshops and the drawing board pay them; your ⭐ stars are never spent">
          <Coin size={14} /> <b>{wallet}</b>
        </span>
        <button className="btn tiny" onClick={buildUndo} disabled={!build.undo.length} title="Undo (Ctrl+Z)">
          ↶ Undo
        </button>
        <button className="btn tiny primary" onClick={() => setBuild(false)} title="Stop decorating (Esc)">
          Done
        </button>
      </div>
      <div className="bd-tools" role="group" aria-label="Tool">
        {TOOLS.map((t) => (
          <button key={t.id} aria-pressed={build.tool === t.id} className={`chip ${build.tool === t.id ? 'on' : ''}`} onClick={() => buildTool(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
        <button className="chip" onClick={() => bus.emit('buildKey', { key: 'place' })} title="Use the tool on the highlighted tile (Enter)">
          ✔ Here
        </button>
      </div>
      {build.tool === 'place' && (
        <>
          <div className="bd-cats" role="group" aria-label="Categories">
            {CATEGORIES.map((c) => (
              <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
          <ul className="bd-palette" aria-label={CATEGORIES.find((c) => c.id === cat)?.name}>
            {CATALOGUE.filter((it) => it.category === cat).map((it) => {
              const locked = lockedBecause(progress, region, it);
              // What one more costs here now (copies and a crowded city cost more; a reward not won yet is bought too).
              const price = priceFor(progress, region, it).total;
              const sale = !locked && !!forSale(progress, it);
              const poor = !locked && wallet < price;
              const n = owned(it.id);
              const on = picked?.id === it.id;
              return (
                <li key={it.id}>
                  <button
                    className={`bd-item ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    disabled={!!locked}
                    title={locked?.replace(/\s*🪙/g, ' coins') ?? (poor ? `Needs ${price} coins (you have ${wallet})` : `${it.name}: ${price ? `${price} coins` : 'free'}${sale ? ' (not won yet: buy it here)' : ''}${it.size === 2 ? ', 2×2 tiles' : ''}`)}
                    onClick={() => buildPick(on ? undefined : (build.kind && itemOfKind(build.kind) === it ? build.kind : it.variants[0]))}
                  >
                    <span className="bd-icon" aria-hidden="true">
                      {locked ? '🔒' : it.icon}
                    </span>
                    <span className="bd-name">{it.name}</span>
                    {sale && <span className="bd-sale">Buy</span>}
                    <span className={`bd-price ${poor ? 'poor' : ''}`}>{price ? (
                        <>
                          {price} <Coin size={12} label="City Coins" />
                        </>
                      ) : (
                        'Free'
                      )}</span>
                    {n > 0 && <span className="bd-owned" aria-label={`${n} placed`}>×{n}</span>}
                    {locked && <span className="sr-only">Locked. {locked}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="bd-note" role="status" aria-live="polite">
        {withCoins(build.note ?? hint)}
      </p>
      <p className="bd-keys">Arrows move · Enter builds · R turns · Esc leaves · drag to look around</p>
    </section>
  );
}
