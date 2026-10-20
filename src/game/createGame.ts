import Phaser from 'phaser';
import { useCity, type View } from '@/state/store';
import { attachAudio } from './audio';
import { mayFocusGame } from './keys';
import { SEA_CSS } from './palette';
import { BootScene } from './scenes/BootScene';
import { CityScene } from './scenes/CityScene';
import { FishingScene } from './scenes/FishingScene';
import { InteriorScene } from './scenes/InteriorScene';
import { WorldScene } from './scenes/WorldScene';
import { DanceGame } from './scenes/games/DanceGame';
import { KitchenGame } from './scenes/games/KitchenGame';
import { RushGame } from './scenes/games/RushGame';
import { ShieldGame } from './scenes/games/ShieldGame';
import { SortGame } from './scenes/games/SortGame';
import { RedTeamGame } from './scenes/games/RedTeamGame';
import { QueueGame } from './scenes/games/QueueGame';
import { IamGateGame } from './scenes/games/IamGateGame';
import { EdgeGame } from './scenes/games/EdgeGame';

const GAME_SCENES = { fishing: 'fishing', shield: 'game:shield', route53: 'game:route53', lambda: 'game:lambda', ec2: 'game:ec2', dynamodb: 'game:dynamodb', redteam: 'game:redteam', queue: 'game:queue', iamgate: 'game:iamgate', edge: 'game:edge' } as const;

/** Boots Phaser into `parent` and switches scenes when the store's `view` changes. */
export function createGame(parent: HTMLElement) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: SEA_CSS,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 400, height: parent.clientHeight || 400 },
    scene: [BootScene, CityScene, WorldScene, InteriorScene, FishingScene, ShieldGame, DanceGame, KitchenGame, RushGame, SortGame, RedTeamGame, QueueGame, IamGateGame, EdgeGame],
    input: { mouse: { preventDefaultWheel: true } },
    pixelArt: true,
    roundPixels: true,
  });
  attachAudio(game);
  // Focusable, so keyboard players can Tab into the city and the arrow keys walk (see keys.ts).
  game.events.once(Phaser.Core.Events.READY, () => {
    game.canvas.tabIndex = 0;
    game.canvas.setAttribute('aria-label', 'AWS City map. Arrow keys or WASD walk, E talks to whoever is nearest, ] and [ step through the buildings, + and − zoom.');
    // Phaser prevents the default on mousedown, so a click never focused the canvas: the keys stayed with the last button.
    game.canvas.addEventListener('pointerdown', () => game.canvas.focus({ preventScroll: true }));
  });
  // A scene that starts (a mini-game from the panel, back to the city) takes the keys at once, unless the player is
  // typing or in a dialog (keys.ts). After the frame, so React's own focus moves (a card closing) have settled.
  // Once more a moment later: a card that closed as the game opened hands focus back to the button that opened it
  // (useDialog), and the game's keys then did nothing until the canvas was clicked.
  let focusFrame = 0;
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  const focusNow = () => {
    if (game.canvas && document.activeElement !== game.canvas && mayFocusGame(document.activeElement)) game.canvas.focus({ preventScroll: true });
  };
  const focusSoon = () => {
    cancelAnimationFrame(focusFrame);
    clearTimeout(focusTimer);
    focusFrame = requestAnimationFrame(focusNow);
    focusTimer = setTimeout(() => useCity.getState().view.name === 'game' && focusNow(), 250);
  };

  const apply = (v: View) => {
    const sm = game.scene;
    if (!sm.isActive('city') && !sm.isSleeping('city')) return; // still booting
    for (const k of ['interior', 'world', ...Object.values(GAME_SCENES)]) if (sm.isActive(k) || sm.isPaused(k)) sm.stop(k);
    if (v.name === 'city' || v.name === 'game') focusSoon();
    if (v.name === 'city') {
      if (sm.isSleeping('city')) sm.wake('city');
      return;
    }
    if (!sm.isSleeping('city')) sm.sleep('city');
    if (v.name === 'world') sm.start('world');
    if (v.name === 'interior') sm.start('interior', { districtId: v.districtId });
    if (v.name === 'game') sm.start(GAME_SCENES[v.game]);
  };
  const unsub = useCity.subscribe((s, prev) => s.view !== prev.view && apply(s.view));
  // The first view may not be the city (a first run opens on the world map): apply it once the city is up.
  game.events.once(Phaser.Core.Events.READY, () => game.scene.getScene('city')?.events.once(Phaser.Scenes.Events.CREATE, () => apply(useCity.getState().view)));

  return () => {
    unsub();
    cancelAnimationFrame(focusFrame);
    clearTimeout(focusTimer);
    game.destroy(true);
  };
}
