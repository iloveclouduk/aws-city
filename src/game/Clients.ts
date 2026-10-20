// City Clients in the city (src/world/clients.ts places them): each business's site at its level (`client:<id>:<0..3>`,
// lit at night), and yellow "!" station markers (Among Us style) on the stations of the open jobs of the business the
// player is helping (store `clientFocus`). Tapping a business opens its jobs; tapping a "!" walks Kai there and the job
// opens on arrival. A level done grows the site: the next sprite with a bump and confetti (none under reduced motion).
//
// A business without art of its own (a new one, before art/tiles/clients_art.py draws it) borrows a building from the
// atlas (construction on an empty lot, then a culture hall), so the city never shows a hole. The airport hub draws only its own sprites when they exist: the
// airport itself (src/game/Airport.ts) is its building.
import Phaser from 'phaser';
import type { Progress } from '@/backend/contract';
import { clientById, clientName, clientProgress, clientSprite, currentLevel, levelCount, taskOpen, type ClientSite } from '@/world/clients';
import type { Tile } from '@/world/layout';
import { addSprite, hasSprite } from './assets';
import { click } from './audio';
import { CITY_ISO, cornerScreen, footprintDepth, toScreen } from './iso';
import { reducedMotion } from './motion';
import { crisp, TEXT_FONT } from './SpeechBubble';
import { COLOR, CSS, labelStyle } from './theme';

/** Stand-ins from the atlas while a business has no art of its own (level ≥ 1); an empty lot shows construction. */
const FALLBACK: Record<string, string> = {
  bank: 'culture:goldenhall',
  stadium: 'culture:expohall',
  hospital: 'culture:northhall',
  shop: 'culture:fulfilment',
  school: 'culture:day1office',
};
/** Footprints of the businesses' own art that don't fill the 4×4 lot (anchor: the footprint's N corner). */
const OWN_FOOT: Record<string, number> = { bank: 3, shop: 3 };
const MARK_DEPTH = 50_400;
const PAD = 'lotPad';
/** The empty-lot sign the city's undiscovered landmark lots use (src/game/decor.ts), reused for a business at level 0. */
const SOON = 'lotSign';

interface Placed {
  site: ClientSite;
  sprite: string;
  img?: Phaser.GameObjects.Image;
  lights?: Phaser.GameObjects.Image;
  pads: Phaser.GameObjects.Image[];
  /** Level 0: a "coming soon" sign on the empty lot's front corner. */
  sign?: Phaser.GameObjects.Image;
}

interface Marker {
  tile: Tile;
  taskId: string;
  text: Phaser.GameObjects.Text;
  bob?: Phaser.Tweens.Tween;
}

/** The sprite and where it's drawn: the business's own art over its lot, else a stand-in centred on it. */
export function siteArt(site: ClientSite, level: number): { sprite: string; x: number; y: number; w: number; h: number } | undefined {
  const own = clientSprite(clientById(site.clientId) ?? { art: `client:${site.clientId}` }, level);
  if (hasSprite(own)) {
    // art/tiles/clients_art.py: the bank and the shop stand on 3×3, the rest fill the 4×4 lot (paved plate included).
    const f = OWN_FOOT[site.clientId] ?? site.rect.w;
    const o = Math.floor((site.rect.w - f) / 2);
    return { sprite: own, x: site.rect.x + o, y: site.rect.y + o, w: f, h: f };
  }
  if (site.where === 'airport') return undefined;
  const fb = level <= 0 ? 'construction3x3' : FALLBACK[site.clientId] ?? 'culture:expohall';
  if (!hasSprite(fb)) return undefined;
  const off = (site.rect.w - 3) / 2;
  return { sprite: fb, x: site.rect.x + off, y: site.rect.y + off, w: 3, h: 3 };
}

export class ClientsLayer {
  private placed = new Map<string, Placed>();
  private markers: Marker[] = [];
  private markerKey = '';
  private night = 0;
  private tip?: Phaser.GameObjects.Text;
  private progress?: Progress;

  constructor(
    private scene: Phaser.Scene,
    private hooks: { openClient: (id: string) => void; goStation: (taskId: string) => void },
  ) {}

  /** Draws each site at its level and the focused business's station markers; rebuilds only what changed. */
  sync(sites: ClientSite[], p: Progress, focus: string | undefined, region: string) {
    this.progress = p;
    const seen = new Set<string>();
    for (const site of sites) {
      seen.add(site.clientId);
      const level = clientProgress(p, site.clientId).level;
      const art = siteArt(site, level);
      const key = `${site.rect.x},${site.rect.y}|${art?.sprite ?? '-'}`;
      const cur = this.placed.get(site.clientId);
      if (cur && cur.sprite === key) {
        cur.site = site;
        continue;
      }
      if (cur) this.drop(cur);
      this.placed.set(site.clientId, this.draw(site, art, key));
    }
    for (const [id, pl] of this.placed) if (!seen.has(id)) (this.drop(pl), this.placed.delete(id));
    this.syncMarkers(sites, p, focus, region);
  }

  private draw(site: ClientSite, art: ReturnType<typeof siteArt>, key: string): Placed {
    const pads: Phaser.GameObjects.Image[] = [];
    // A paved lot under a business in the landscape (the core's lots are grass, like a neighbourhood's gardens).
    if (site.where === 'ring' && hasSprite(PAD) && !art?.sprite.startsWith('client:'))
      for (let j = 0; j < site.rect.h; j++)
        for (let i = 0; i < site.rect.w; i++) {
          const n = cornerScreen(CITY_ISO, site.rect.x + i, site.rect.y + j);
          pads.push(addSprite(this.scene, PAD, n.x, n.y).setDepth(0.5));
        }
    if (!art) return { site, sprite: key, pads };
    const n = cornerScreen(CITY_ISO, art.x, art.y);
    const img = addSprite(this.scene, art.sprite, n.x, n.y).setDepth(footprintDepth(CITY_ISO, art));
    const lit = `${art.sprite}@lights`;
    const lights = hasSprite(lit) ? addSprite(this.scene, lit, n.x, n.y).setDepth(70_001).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.night) : undefined;
    const id = site.clientId;
    // An empty site (level 0) reads as a business to come: a small sign on its front corner, tappable like the lot.
    const empty = site.where !== 'airport' && (!this.progress || clientProgress(this.progress, id).level <= 0);
    let sign: Phaser.GameObjects.Image | undefined;
    if (empty && hasSprite(SOON)) {
      const t = { x: site.rect.x + 1, y: site.rect.y + site.rect.h - 1, w: 1, h: 1 };
      const at = cornerScreen(CITY_ISO, t.x, t.y);
      sign = addSprite(this.scene, SOON, at.x, at.y).setDepth(Math.max(footprintDepth(CITY_ISO, t), footprintDepth(CITY_ISO, art)) + 0.5);
    }
    for (const target of sign ? [img, sign] : [img]) {
      target.setInteractive({ useHandCursor: true });
      target.on('pointerup', (ptr: Phaser.Input.Pointer) => {
        if (ptr.getDistance() >= 8) return; // a drag pans the camera
        click();
        this.hooks.openClient(id);
      });
      target.on('pointerover', () => {
        const b = clientById(id);
        const p = this.progress;
        if (!b || !p) return;
        const lv = currentLevel(p, b);
        const c = levelCount(p, b, lv);
        const level = clientProgress(p, id).level;
        this.showTip(img, level <= 0 ? `🏢 ${clientName(b)} · coming soon: help with its first jobs` : `🏢 ${clientName(b)} · Lv ${level}${lv ? ` · ${c.done} of ${c.of} jobs` : ''}`);
      });
      target.on('pointerout', () => this.hideTip());
    }
    return { site, sprite: key, img, lights, pads, sign };
  }

  /** The yellow "!" over each station with an open job of the focused business (one per station). */
  private syncMarkers(sites: ClientSite[], p: Progress, focus: string | undefined, region: string) {
    const site = focus ? sites.find((s) => s.clientId === focus) : undefined;
    const b = focus ? clientById(focus) : undefined;
    const lv = b ? currentLevel(p, b) : undefined;
    const want: { tile: Tile; taskId: string }[] = [];
    if (site && lv)
      for (const t of lv.tasks) {
        const tile = site.stations[t.station];
        if (!tile || !taskOpen(p, t.id, region) || want.some((w) => w.tile.x === tile.x && w.tile.y === tile.y)) continue;
        want.push({ tile, taskId: t.id });
      }
    const key = want.map((w) => `${w.taskId}@${w.tile.x},${w.tile.y}`).join(';');
    if (key === this.markerKey) return;
    this.markerKey = key;
    this.clearMarkers();
    for (const w of want) {
      const c = toScreen(CITY_ISO, w.tile.x, w.tile.y);
      const text = crisp(this.scene.add.text(Math.round(c.x), Math.round(c.y - 30), '!', { ...labelStyle(TEXT_FONT, CSS.accentInk), fontSize: '15px', fontStyle: '900', backgroundColor: CSS.gold, padding: { x: 6, y: 2 } }))
        .setOrigin(0.5, 1)
        .setDepth(MARK_DEPTH)
        .setScale(1 / (this.scene.cameras.main.zoom || 1));
      text.setInteractive({ useHandCursor: true }).on('pointerup', (ptr: Phaser.Input.Pointer) => {
        if (ptr.getDistance() >= 8) return;
        click();
        this.hooks.goStation(w.taskId);
      });
      const bob = reducedMotion() ? undefined : this.scene.tweens.add({ targets: text, y: '-=4', yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });
      this.markers.push({ tile: w.tile, taskId: w.taskId, text, bob });
    }
  }

  /** Station tiles with a marker now (the minimap draws them as yellow dots). */
  stationTiles(): Tile[] {
    return this.markers.map((m) => m.tile);
  }

  setUiScale(ui: number) {
    for (const m of this.markers) m.text.setScale(ui);
  }

  setNight(n: number) {
    this.night = n;
    for (const p of this.placed.values()) p.lights?.setAlpha(n);
  }

  /** A level done: the new sprite is in (sync ran), now the bump and the confetti. */
  grow(clientId: string) {
    const p = this.placed.get(clientId);
    if (!p?.img || reducedMotion()) return;
    const img = p.img;
    const sy = img.scaleY;
    this.scene.tweens.add({ targets: img, scaleY: { from: sy * 0.6, to: sy }, duration: 520, ease: 'Back.easeOut' });
    const c = toScreen(CITY_ISO, p.site.rect.x + p.site.rect.w / 2, p.site.rect.y + p.site.rect.h / 2);
    const colors = [COLOR.gold, COLOR.accent, COLOR.good, COLOR.info, COLOR.bad, COLOR.goldHi];
    for (let i = 0; i < 36; i++) {
      const r = this.scene.add.rectangle(c.x, c.y - 40, 5 + (i % 3), 5 + (i % 3), colors[i % colors.length]).setDepth(58_000);
      const ang = (i / 36) * Math.PI * 2;
      const reach = 50 + (i % 5) * 9;
      this.scene.tweens.add({ targets: r, x: c.x + Math.cos(ang) * reach, y: c.y - 40 + Math.sin(ang) * reach * 0.6 - 20, angle: i % 2 ? 180 : -180, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
    }
  }

  /** Where a business stands (the camera flies there), as a world point. */
  centre(clientId: string): { x: number; y: number } | undefined {
    const p = this.placed.get(clientId);
    return p && toScreen(CITY_ISO, p.site.rect.x + p.site.rect.w / 2, p.site.rect.y + p.site.rect.h / 2);
  }

  private showTip(img: Phaser.GameObjects.Image, text: string) {
    this.hideTip();
    const top = img.getTopCenter();
    const zoom = this.scene.cameras.main.zoom || 1;
    this.tip = crisp(this.scene.add.text(Math.round(top.x ?? 0), Math.round((top.y ?? 0) - 4), text, labelStyle(TEXT_FONT, CSS.inkHi)))
      .setOrigin(0.5, 1)
      .setDepth(40_001)
      .setScale(1 / zoom);
  }

  private hideTip() {
    this.tip?.destroy();
    this.tip = undefined;
  }

  private clearMarkers() {
    for (const m of this.markers) (m.bob?.remove(), m.text.destroy());
    this.markers = [];
  }

  private drop(p: Placed) {
    p.img?.destroy();
    p.lights?.destroy();
    p.sign?.destroy();
    for (const pad of p.pads) pad.destroy();
  }

  destroy() {
    this.hideTip();
    this.clearMarkers();
    for (const p of this.placed.values()) this.drop(p);
    this.placed.clear();
    this.markerKey = '';
  }
}
