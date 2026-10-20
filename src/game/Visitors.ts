// The live city (contract v2.11): other players who are in this Region's city right now, with a public profile, walk
// its streets as visiting Mayors in Kai's gold jacket (crowd size), their generated name on the tag. It's presence,
// not position: where they walk is ours. They take pedestrians' places, so the crowd cap holds (CityScene.citizenTarget).
import Phaser from 'phaser';
import type { Tile } from '@/world/layout';
import { Agent, type AgentWorld } from './Agent';
import { crowdSheet } from './assets';
import { click } from './audio';

/** At most this many visiting Mayors walk at once (tab / side panel). */
export const VISITOR_CAP = { tab: 4, panel: 2 } as const;

export class Visitors {
  readonly list: Agent[] = [];
  private names: string[] = [];

  constructor(
    private scene: Phaser.Scene,
    private world: AgentWorld,
    private spawnTiles: () => Tile[],
  ) {}

  /** The mayors to show (the player's own name is left out by the caller); rebuilt only when the names change. */
  sync(mayors: { name: string; rank: string }[], cap: number) {
    const want = mayors.slice(0, cap);
    const key = want.map((m) => m.name);
    if (key.join('|') === this.names.join('|')) return;
    this.names = key;
    this.clear();
    const tiles = this.spawnTiles();
    want.forEach((m, i) => {
      if (!tiles.length) return;
      const a = new Agent(this.scene, this.world, {
        id: `visitor${i}`,
        sheet: crowdSheet('player-gold'),
        name: `Mayor ${m.name}`,
        tagName: `Mayor ${m.name} · ${m.rank}`,
        tile: tiles[Math.floor(Math.random() * tiles.length)],
        home: { x: 0, y: 0, w: this.world.gridW, h: this.world.gridH },
        speed: 1.4 + Math.random() * 0.5,
      });
      a.onClick(() => {
        click();
        a.emote('wave', 1200);
        a.say(`Hi! I'm visiting from another city. I'm a ${m.rank} Mayor too.`, { holdMs: 3000 });
      });
      this.list.push(a);
    });
  }

  update(time: number, dt: number) {
    for (const v of this.list) v.update(time, dt);
  }

  setUiScale(s: number) {
    for (const v of this.list) v.setUiScale(s);
  }

  clear() {
    for (const v of this.list) v.destroy();
    this.list.length = 0;
  }

  destroy() {
    this.clear();
    this.names = [];
  }
}
