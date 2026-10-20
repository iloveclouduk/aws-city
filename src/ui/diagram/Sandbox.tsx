import { useMemo, useRef, useState } from 'react';
import { readAsset } from '@/backend/assets';
import type { SavedDesign } from '@/backend/contract';
import { openDocs } from '@/app/runtime';
import { backwardArrows, designPasses, passGaps, reviewDesign } from '@/learning/designRules';
import { takeDaily } from '@/learning/dailyLedger';
import { isDiscovered } from '@/state/selectors';
import { useCity } from '@/state/store';
import { actorIconPath, groupIconPath, iconPath } from '@/world/icons';
import { placeFor } from '@/world/places';
import { SERVICES, serviceById } from '@/world/taxonomy';
import { COIN_PAY } from '@/state/wallet';
import { feel } from '../feedback';
import { readPref, writePref } from '../logic';
import { Coin } from '../icons';
import { Plain } from '../Term';
import { serviceColor } from './DiagramBoard';

const COLS = 8;
const ROWS = 6;
const CW = 72;
const CH = 80;
const BOX = 40;
/**
 * A passing design pays City Coins (not stars: the drawing board is free play, and stars are knowledge): this many for
 * each service on it, once a day per service across every design, at most 8 services a design.
 */
export const DESIGN_COINS = COIN_PAY.drawing;
/** The first-time guide was closed (this device). */
const GUIDE_KEY = 'awscity.drawingGuide';
const GROUPS: { kind: string; label: string; color: string; dashed?: boolean }[] = [
  { kind: 'region', label: 'Region', color: '#00a4a6', dashed: true },
  { kind: 'vpc', label: 'VPC', color: '#8c4fff' },
  { kind: 'az', label: 'Availability Zone', color: '#00a4a6', dashed: true },
  { kind: 'public', label: 'Public subnet', color: '#7aa116' },
  { kind: 'private', label: 'Private subnet', color: '#00a4a6' },
];
type Mode = { kind: 'idle' } | { kind: 'place'; item: string } | { kind: 'group'; group: string; corner?: { x: number; y: number } } | { kind: 'connect'; from?: string };
type Node = SavedDesign['nodes'][number];

const label = (kind: string) =>
  kind === 'actor:users' ? 'Users' : kind.startsWith('group:') ? (GROUPS.find((g) => `group:${g.kind}` === kind)?.label ?? kind) : (serviceById(kind)?.name.replace(/^(Amazon|AWS) /, '') ?? kind);
const centre = (n: Node) => ({ x: n.x * CW + CW / 2, y: n.y * CH + CH / 2 - 6 });
const empty = (): SavedDesign => ({ name: 'My design', updatedAt: new Date().toISOString(), nodes: [], edges: [] });
const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * The Drawing board (once "the sandbox"): draw anything with the official AWS icons of the services you've put up, AWS's
 * group boxes and arrows you wire yourself, then ask for a Well-Architected review (src/learning/designRules.ts: rules
 * only, each naming its best practice). A pass pays City Coins. An intro says what it's for, and a short guide shows
 * the first time. Designs are saved with your progress; export as SVG or PNG (a local download).
 */
export function Sandbox() {
  const progress = useCity((s) => s.progress);
  const saved = progress.designs ?? {};
  const [id, setId] = useState(() => Object.keys(saved)[0] ?? newId());
  const [design, setDesign] = useState<SavedDesign>(() => saved[id] ?? empty());
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [selected, setSelected] = useState<string>();
  /** The piece just put down (the hint says so, then what to do next). */
  const [placed, setPlaced] = useState<string>();
  const [reviewed, setReviewed] = useState(false);
  const [paid, setPaid] = useState<{ coins: number; places: string }>();
  const [guide, setGuide] = useState(() => readPref(GUIDE_KEY) !== '1');
  const closeGuide = () => {
    setGuide(false);
    writePref(GUIDE_KEY, '1');
  };
  const svg = useRef<SVGSVGElement>(null);
  const palette = useMemo(() => SERVICES.filter((s) => isDiscovered(progress, s.id)).map((s) => s.id), [progress]);
  const findings = useMemo(() => reviewDesign(design), [design]);
  const backward = useMemo(() => backwardArrows(design), [design]);
  const gaps = useMemo(() => passGaps(design, findings), [design, findings]);

  const commit = (next: SavedDesign) => {
    const d = { ...next, updatedAt: new Date().toISOString() };
    setDesign(d);
    setReviewed(false);
    useCity.getState().saveDesign(id, d);
  };
  const at = (x: number, y: number) => design.nodes.find((n) => !n.kind.startsWith('group:') && n.x === x && n.y === y);

  const tapCell = (x: number, y: number) => {
    const here = at(x, y);
    if (mode.kind === 'place') {
      if (here) return feel.bad();
      feel.tap();
      setPlaced(mode.item);
      return commit({ ...design, nodes: [...design.nodes, { id: newId(), kind: mode.item, x, y }] });
    }
    if (mode.kind === 'group') {
      if (!mode.corner) return setMode({ ...mode, corner: { x, y } });
      const g = { id: newId(), kind: `group:${mode.group}`, x: Math.min(x, mode.corner.x), y: Math.min(y, mode.corner.y), w: Math.abs(x - mode.corner.x) + 1, h: Math.abs(y - mode.corner.y) + 1 };
      feel.tap();
      setMode({ kind: 'idle' });
      return commit({ ...design, nodes: [g, ...design.nodes] });
    }
    if (mode.kind === 'connect') {
      if (!here) return;
      if (!mode.from) return setMode({ kind: 'connect', from: here.id });
      if (mode.from !== here.id && !design.edges.some((e) => e.from === mode.from && e.to === here.id)) {
        feel.tap();
        commit({ ...design, edges: [...design.edges, { from: mode.from, to: here.id }] });
      }
      return setMode({ kind: 'connect' });
    }
    setPlaced(undefined);
    setSelected(here?.id);
  };
  /** A new mode clears what the hint said about the last move. */
  const pick = (m: Mode) => {
    setPlaced(undefined);
    setSelected(undefined);
    setMode(m);
  };

  const remove = (nodeId: string) => {
    commit({ ...design, nodes: design.nodes.filter((n) => n.id !== nodeId), edges: design.edges.filter((e) => e.from !== nodeId && e.to !== nodeId) });
    setSelected(undefined);
  };

  const review = () => {
    setReviewed(true);
    const pass = designPasses(design, findings);
    // Each service pays once a day across every design (the daily ledger), so copying a design or re-checking one
    // after a tiny change grows nothing new.
    // A quest's "draw a design" step counts any design that passes, paid or not.
    if (pass) useCity.getState().questEvent((st) => st.kind === 'design');
    const kinds = pass ? [...new Set(design.nodes.filter((n) => serviceById(n.kind)).map((n) => n.kind))].slice(0, 8).filter((k) => takeDaily(`design:${k}`)) : [];
    if (kinds.length) {
      const coins = useCity.getState().earnCoins(DESIGN_COINS * kinds.length, 'a drawing-board design');
      useCity.getState().noteLearning('designs');
      setPaid({ coins, places: kinds.map((k) => placeFor(k)?.place ?? k).join(', ') });
      feel.win();
    } else {
      setPaid(undefined);
      feel.tap();
    }
  };

  /** The board as a standalone SVG: icons inlined as data URLs (an SVG drawn as an image can't load other files). */
  const standalone = async () => {
    const el = svg.current!.cloneNode(true) as SVGSVGElement;
    el.querySelectorAll('.sb-cell').forEach((c) => c.remove());
    await Promise.all(
      [...el.querySelectorAll('image')].map(async (img) => {
        const href = img.getAttribute('href');
        if (!href || href.startsWith('data:')) return;
        const blob = await readAsset(href);
        const data = await new Promise<string>((ok) => {
          const r = new FileReader();
          r.onload = () => ok(String(r.result));
          r.readAsDataURL(blob);
        });
        img.setAttribute('href', data);
      }),
    );
    return new XMLSerializer().serializeToString(el);
  };

  const exportSvg = async (png: boolean) => {
    if (!svg.current) return;
    const xml = await standalone().catch(() => new XMLSerializer().serializeToString(svg.current!));
    const name = `${design.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'design'}`;
    const save = (url: string, ext: string) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.${ext}`;
      a.click();
    };
    const svgUrl = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    feel.tap();
    if (!png) return save(svgUrl, 'svg'), setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = COLS * CW * 2;
      c.height = ROWS * CH * 2;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#15171b';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      save(c.toDataURL('image/png'), 'png');
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  };

  const groups = design.nodes.filter((n) => n.kind.startsWith('group:'));
  const items = design.nodes.filter((n) => !n.kind.startsWith('group:'));
  const byId = new Map(design.nodes.map((n) => [n.id, n]));
  const sel = selected ? byId.get(selected) : undefined;
  // One live line: what the tool in hand does next, said for the piece just placed or picked.
  const hint =
    mode.kind === 'place'
      ? placed === mode.item
        ? `${label(mode.item)} is on the board. Tap another empty square for one more, or pick ➜ Draw an arrow to wire it up.`
        : `Tap an empty square to put ${label(mode.item)} there.`
      : mode.kind === 'group'
        ? mode.corner
          ? 'Now tap the opposite corner of the box.'
          : `Tap one corner of the ${label(`group:${mode.group}`)} box.`
        : mode.kind === 'connect'
          ? mode.from
            ? `Tap where ${label(byId.get(mode.from)?.kind ?? '')} sends to.`
            : 'Tap the piece the arrow starts from.'
          : sel
            ? `${label(sel.kind)} is selected: draw an arrow from it, or remove it.`
            : 'Pick a piece below, then tap the board. Tap a piece on the board to select it.';

  return (
    <div className="sandbox">
      <section className="drawing-intro" aria-label="Drawing board">
        <h3>
          <span aria-hidden="true">✏️</span> Drawing board
        </h3>
        <p>
          A blank page for your own ideas: Puzzles give you a brief to solve, here you draw whatever you like and get a <Plain text="Well-Architected" /> review. A
          design that passes pays <Coin size={12} label="City Coins" /> City Coins for its services, once a day each.
        </p>
        {guide && (
          <div className="drawing-guide" role="note">
            <ol>
              <li>Pick a piece below, then tap the board to put it there.</li>
              <li>Tap “➜ Draw an arrow”, then the piece a request starts from, then where it goes next.</li>
              <li>Press “Review my design”: three services wired with arrows that point the way requests go, and nothing red, passes.</li>
            </ol>
            <button className="btn tiny" onClick={closeGuide}>
              Got it
            </button>
          </div>
        )}
      </section>
      <div className="sandbox-bar">
        <input className="sandbox-name" value={design.name} maxLength={60} aria-label="Design name" onChange={(e) => commit({ ...design, name: e.target.value || 'My design' })} />
        {Object.keys(saved).some((k) => k !== id) && (
          <select
            aria-label="Open a saved design"
            value=""
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              setId(next);
              setDesign(saved[next] ?? empty());
              setReviewed(false);
              setSelected(undefined);
            }}
          >
            <option value="">Open another…</option>
            {Object.entries(saved)
              .filter(([k]) => k !== id)
              .map(([k, d]) => (
                <option key={k} value={k}>
                  {d.name}
                </option>
              ))}
          </select>
        )}
        <button
          className="btn tiny"
          onClick={() => {
            const k = newId();
            setId(k);
            setDesign(empty());
            setReviewed(false);
            setSelected(undefined);
          }}
        >
          New
        </button>
      </div>
      <p className="muted small" aria-live="polite">
        {hint}
      </p>
      <svg ref={svg} className="sandbox-board" viewBox={`0 0 ${COLS * CW} ${ROWS * CH}`} xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Design board">
        <defs>
          <marker id="sb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#c9c4b8" />
          </marker>
        </defs>
        {groups.map((g) => {
          const def = GROUPS.find((x) => `group:${x.kind}` === g.kind)!;
          const icon = groupIconPath(def.kind);
          return (
            <g key={g.id} className={selected === g.id ? 'sb-selected' : undefined}>
              <rect x={g.x * CW + 3} y={g.y * CH + 3} width={(g.w ?? 1) * CW - 6} height={(g.h ?? 1) * CH - 6} fill="none" stroke={def.color} strokeWidth={1.5} strokeDasharray={def.dashed ? '5 4' : undefined} rx={3} />
              {icon && <image href={icon} x={g.x * CW + 5} y={g.y * CH + 5} width={14} height={14} />}
              <text x={g.x * CW + (icon ? 22 : 8)} y={g.y * CH + 16} fontSize={10} fill={def.color}>
                {def.label}
              </text>
            </g>
          );
        })}
        {design.edges.map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const p = centre(a);
          const q = centre(b);
          const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
          const k = (BOX / 2 + 4) / len;
          return <line key={i} x1={p.x + (q.x - p.x) * k} y1={p.y + (q.y - p.y) * k} x2={q.x - (q.x - p.x) * k} y2={q.y - (q.y - p.y) * k} stroke="#c9c4b8" strokeWidth={1.5} markerEnd="url(#sb-arrow)" />;
        })}
        {items.map((n) => {
          const c = centre(n);
          const icon = n.kind === 'actor:users' ? actorIconPath('users') : iconPath(n.kind);
          const on = selected === n.id || (mode.kind === 'connect' && mode.from === n.id);
          return (
            <g key={n.id}>
              <rect x={c.x - BOX / 2 - 2} y={c.y - BOX / 2 - 2} width={BOX + 4} height={BOX + 4} rx={6} fill={on ? '#f0a63a33' : 'none'} stroke={on ? '#f0a63a' : 'none'} />
              {icon ? (
                <image href={icon} x={c.x - BOX / 2} y={c.y - BOX / 2} width={BOX} height={BOX} />
              ) : (
                <rect x={c.x - BOX / 2} y={c.y - BOX / 2} width={BOX} height={BOX} rx={6} fill={serviceColor(n.kind)} />
              )}
              <text x={c.x} y={c.y + BOX / 2 + 12} fontSize={9} fill="#e6e2d8" textAnchor="middle">
                {label(n.kind).slice(0, 18)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: COLS * ROWS }, (_, i) => {
          const x = i % COLS;
          const y = Math.floor(i / COLS);
          const here = at(x, y);
          return (
            <rect
              key={i}
              x={x * CW}
              y={y * CH}
              width={CW}
              height={CH}
              fill="transparent"
              className="sb-cell"
              role="button"
              tabIndex={0}
              aria-label={here ? `${label(here.kind)}, row ${y + 1} column ${x + 1}` : `Empty square, row ${y + 1} column ${x + 1}`}
              onClick={() => tapCell(x, y)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), tapCell(x, y))}
            />
          );
        })}
      </svg>
      {selected && byId.get(selected) && (
        <div className="sandbox-selected">
          <b>{label(byId.get(selected)!.kind)}</b>
          {!byId.get(selected)!.kind.startsWith('group:') && (
            <button className="btn tiny" onClick={() => pick({ kind: 'connect', from: selected })}>
              ➜ Draw an arrow from here
            </button>
          )}
          <button className="btn tiny" onClick={() => remove(selected)}>
            Remove
          </button>
        </div>
      )}
      <div className="sandbox-palette" role="group" aria-label="Pieces">
        <button className={`sb-piece ${mode.kind === 'connect' ? 'on' : ''}`} onClick={() => pick(mode.kind === 'connect' ? { kind: 'idle' } : { kind: 'connect' })}>
          ➜ Draw an arrow
        </button>
        <button className={`sb-piece ${mode.kind === 'place' && mode.item === 'actor:users' ? 'on' : ''}`} onClick={() => pick({ kind: 'place', item: 'actor:users' })}>
          👥 Users
        </button>
        {GROUPS.map((g) => (
          <button key={g.kind} className={`sb-piece ${mode.kind === 'group' && mode.group === g.kind ? 'on' : ''}`} onClick={() => pick({ kind: 'group', group: g.kind })}>
            ▢ {g.label}
          </button>
        ))}
        {palette.map((s) => (
          <button key={s} className={`sb-piece ${mode.kind === 'place' && mode.item === s ? 'on' : ''}`} onClick={() => pick({ kind: 'place', item: s })} title={serviceById(s)?.name}>
            {iconPath(s) && <img src={iconPath(s)} alt="" width={16} height={16} />} {label(s)}
          </button>
        ))}
      </div>
      {palette.length < 3 && <p className="muted small">Put up more buildings in your city and their icons join your tray.</p>}
      <div className="actions">
        <button className="btn primary" disabled={!items.length} onClick={review}>
          Review my design
        </button>
        {reviewed && (
          <span className={`sandbox-verdict ${gaps.length ? 'fail' : 'pass'}`}>
            {gaps.length ? (
              '✗ Not yet: see below'
            ) : paid ? (
              <>
                ✓ Passed! +{paid.coins} <Coin size={12} label="City Coins" />
              </>
            ) : (
              '✓ Passed!'
            )}
          </span>
        )}
        <button className="btn tiny" disabled={!items.length} onClick={() => void exportSvg(true)}>
          Save PNG
        </button>
        <button className="btn tiny" disabled={!items.length} onClick={() => void exportSvg(false)}>
          Save SVG
        </button>
      </div>
      {reviewed && (
        <section className="sandbox-review" aria-label="Design review" role="status">
          {gaps.length > 0 ? (
            <div className="sandbox-gaps">
              <b>To pass:</b>
              <ul>
                {gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="ok-note">
              {paid ? (
                <>
                  Passed! +{paid.coins} <Coin size={12} label="City Coins" /> for {paid.places}.
                </>
              ) : (
                'Passed! These services already paid coins from a design today: full pay again tomorrow, or draw with other services.'
              )}
            </p>
          )}
          {backward.length > 0 && (
            <ul className="wa-checks">
              {backward.map((b) => (
                <li key={`${b.from}>${b.to}`} className="flagged">
                  <span aria-hidden="true">↩️</span>
                  <span>
                    <b>
                      {label(b.from)} → {label(b.to)} points the wrong way.
                    </b>{' '}
                    Requests go {label(b.to)} → {label(b.from)}, like in the {b.flow} pattern. Remove the arrow and draw it the other way.
                  </span>
                </li>
              ))}
            </ul>
          )}
          {findings.length === 0 ? (
            <p className="ok-note">No issues found by the review. Nice work.</p>
          ) : (
            <ul className="wa-checks">
              {findings.map((f) => (
                <li key={f.id} className="flagged">
                  <span aria-hidden="true">{f.severity === 'high' ? '🔴' : f.severity === 'medium' ? '🟠' : '🟡'}</span>
                  <span>
                    <b>{f.title}.</b> <Plain text={f.fix} />
                  </span>
                  <button className="chip-link" onClick={() => openDocs(f.bp.url)} title={f.bp.title}>
                    {f.bp.id} ↗
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
