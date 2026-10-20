import { useRef } from 'react';
import { openLeaderboard } from '@/app/runtime';
import { mayorOf } from '@/state/rank';
import { useCity } from '@/state/store';
import { PLACES } from '@/world/places';
import { regionInfo } from '@/world/regions';
import { feel } from './feedback';
import { useDialog } from './useDialog';

const GAME_NAMES: Record<string, string> = { fishing: 'S3 Fishing', shield: 'Shield Wall', route53: 'Dance Hall', lambda: 'Food Stall', ec2: 'Rush Hour', dynamodb: 'Sorting Office', redteam: 'Red Team Range', queue: 'Queue Juggler', iamgate: 'Permission Gate', edge: 'Edge Cache', launch: 'Launch Day' };
export const boardName = (board: string) => (board.startsWith('mayors:') ? `Mayors of ${regionInfo(board.slice(7))?.city ?? board.slice(7)}` : (GAME_NAMES[board] ?? board));

/**
 * This week's leaderboards: the Mayors of this Region (city rank) and each mini-game. You appear only with a public
 * profile, under a generated Mayor name (no free text, nothing personal), and you can turn it off any time.
 */
export function Leaderboard() {
  const board = useCity((s) => s.boardOpen);
  const state = useCity((s) => (s.boardOpen ? s.boards[s.boardOpen] : undefined));
  const profile = useCity((s) => s.progress.profile);
  const region = useCity((s) => s.cityRegion);
  const played = useCity((s) => [...PLACES.flatMap((p) => (p.game && s.progress.games?.[p.game] ? [p.game] : [])), ...(s.progress.games?.launch ? ['launch'] : [])].join(',')).split(',').filter(Boolean);
  const close = () => useCity.getState().openBoard(undefined);
  const box = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useDialog(!!board, box, close, closeBtn);
  if (!board) return null;
  const tabs = [`mayors:${region}`, ...played];
  return (
    <div className="finding-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <section ref={box} className="finding-card collection-card" role="dialog" aria-modal="true" aria-labelledby="board-title">
        <header className="finding-head">
          <span className="incident-icon" aria-hidden="true">
            🏆
          </span>
          <div className="finding-who">
            <b id="board-title">{boardName(board)}</b>
            <span className="muted">
              This week{state ? ` (${state.week})` : ''}
              {state?.practice ? ' · practice board: the other names are made up' : ''}
            </span>
          </div>
          <button ref={closeBtn} className="btn icon ghost" aria-label="Close" onClick={close}>
            ✕
          </button>
        </header>
        <div className="seg" role="group" aria-label="Boards">
          {tabs.map((t) => (
            <button key={t} aria-pressed={t === board} onClick={() => (feel.tap(), openLeaderboard(t))}>
              {boardName(t)}
            </button>
          ))}
        </div>
        {!state ? (
          <p className="muted">Loading the board…</p>
        ) : state.entries.length === 0 ? (
          <p className="muted">Nobody on this board yet this week. Be the first.</p>
        ) : (
          <ol className="board-list">
            {state.entries.map((e, i) => (
              <li key={`${e.name}-${i}`} className={e.you ? 'you' : ''}>
                <span className="board-rank">{i + 1}</span>
                <span>Mayor {e.name}</span>
                <b>{e.score}</b>
              </li>
            ))}
          </ol>
        )}
        <section className="board-profile" aria-label="Your public profile">
          <label className="toggle-row">
            <input type="checkbox" checked={!!profile?.public} onChange={(e) => (feel.tap(), useCity.getState().setPublic(e.target.checked))} />
            <span>
              Show me on leaderboards and in the live city as <b>Mayor {profile?.name ?? 'a made-up name'}</b>
            </span>
          </label>
          {profile?.public && (
            <button className="btn tiny" onClick={() => (feel.tap(), useCity.getState().setPublic(true, true))}>
              🎲 New name
            </button>
          )}
          <p className="muted small">
            Only this two-word name and your scores are shown, never your account. Turn it off and you leave every board at once. You're {mayorOf(region)}.
          </p>
        </section>
      </section>
    </div>
  );
}

/** "👥 4 in Oregon": how many learners are in this city now (the demo's are practice). Opens the Mayors board. */
export function OnlineChip() {
  const presence = useCity((s) => s.presence);
  const region = useCity((s) => s.cityRegion);
  if (!presence) return null;
  const city = regionInfo(region)?.city ?? region;
  return (
    <button
      className="btn ghost tiny rank-chip"
      onClick={() => openLeaderboard(`mayors:${region}`)}
      title={`${presence.online} ${presence.online === 1 ? 'learner' : 'learners'} in ${city} now${presence.practice ? ' (practice: made-up mayors in the demo)' : ''}`}
    >
      <span aria-hidden="true">👥</span> {presence.online}
    </button>
  );
}
