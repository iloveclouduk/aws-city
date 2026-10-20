// The city airport (src/world/airport.ts lays it out): runway, tower, and a terminal and cargo hangar that open as this
// city's buildings reach Practitioner. When a building levels up, a cargo jet lands with its crates, taxis to the stand,
// unloads and takes off again: one visit at a time, a celebration of learning (never AWS activity), and none under
// reduced motion or while the city sleeps. Moved in the scene's update, no tweens; lights fade in at night.
import Phaser from 'phaser';
import type { Progress } from '@/backend/contract';
import { airportLayout, flightPlan, practitioners, stageHint, type AirportPiece, type FlightLeg } from '@/world/airport';
import type { Rect } from '@/world/layout';
import { addSprite, hasSprite } from './assets';
import { CITY_ISO, cornerScreen, dirFor, entityDepth, footprintDepth, toScreen } from './iso';
import { reducedMotion } from './motion';
import { crisp, TEXT_FONT } from './SpeechBubble';
import { CSS, labelStyle } from './theme';

const PLANE_DEPTH = 66_500;
const SHADOW_DEPTH = 65_000;
/** Screen px per second on each kind of leg, and how high the approach starts / the climb ends. */
const SPEED = { approach: 90, roll: 55, taxi: 22, unload: 0, takeoff: 80 } as const;
const APPROACH_ALT = 150;
const CLIMB_ALT = 170;
const UNLOAD_MS = 4_000;
/** At most this many visits wait their turn (a burst of tier-ups lands a couple of jets, not a queue of ten). */
const MAX_QUEUED = 2;

interface Placed {
  piece: AirportPiece;
  img: Phaser.GameObjects.Image;
  lights?: Phaser.GameObjects.Image;
}

interface Visit {
  legs: { phase: FlightLeg['phase']; pts: { x: number; y: number }[]; tiles: { x: number; y: number }[] }[];
  leg: number;
  seg: number;
  /** Distance along the current segment (px). */
  along: number;
  waited: number;
  img: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
  lights?: Phaser.GameObjects.Image;
  crates?: Phaser.GameObjects.Image;
}

export class Airport {
  private placed: Placed[] = [];
  private key = '';
  private site?: Rect;
  private night = 0;
  private tip?: Phaser.GameObjects.Text;
  private visit?: Visit;
  private queued = 0;
  private progress?: Progress;
  private region = '';

  constructor(private scene: Phaser.Scene) {}

  /** Lays the airport out on `site`; only rebuilds when a stage opened (or the site moved). */
  sync(site: Rect | undefined, p: Progress, region: string) {
    this.progress = p;
    this.region = region;
    const pieces = site ? airportLayout(site, p, region) : [];
    const key = `${site ? `${site.x},${site.y}` : '-'}|${pieces.map((x) => x.sprite).join(',')}`;
    if (key === this.key) return;
    if (site?.x !== this.site?.x || site?.y !== this.site?.y) this.endVisit();
    this.key = key;
    this.site = site;
    this.clearPieces();
    for (const piece of pieces) {
      if (!hasSprite(piece.sprite)) continue;
      const n = cornerScreen(CITY_ISO, piece.x, piece.y);
      // Flat runway and apron tiles lie under everything; buildings sort with the city.
      // The stands and taxiway signs have upright kit, so they sort with the city like a building.
      const flat = piece.sprite.startsWith('air:rwy') || piece.sprite === 'air:taxi';
      const img = addSprite(this.scene, piece.sprite, n.x, n.y).setDepth(flat ? 0 : footprintDepth(CITY_ISO, piece));
      const lit = `${piece.sprite}@lights`;
      const lights = hasSprite(lit) ? addSprite(this.scene, lit, n.x, n.y).setDepth(70_001).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.night) : undefined;
      if (!flat) {
        img.setInteractive({ useHandCursor: false, pixelPerfect: true });
        img.on('pointerover', () => this.showTip(img, this.tipFor(piece)));
        img.on('pointerout', () => this.hideTip());
      }
      this.placed.push({ piece, img, lights });
    }
  }

  private tipFor(piece: AirportPiece) {
    if (piece.stage && this.progress) return piece.open ? `✈️ ${piece.stage.name}` : `🚧 ${stageHint(this.progress, piece.stage, this.region)}`;
    if (piece.sprite.startsWith('air:tower') && this.progress) {
      const n = practitioners(this.progress, this.region);
      return `🗼 Control tower: ${n} ${n === 1 ? 'building' : 'buildings'} at Practitioner. Each level-up flies in a cargo jet.`;
    }
    return '✈️ City airport';
  }

  /** A building levelled up: a cargo jet comes in (one at a time; a couple wait their turn). */
  land() {
    if (!this.site || reducedMotion() || !hasSprite('veh:plane:cargo:NW')) return;
    if (this.visit) {
      this.queued = Math.min(MAX_QUEUED, this.queued + 1);
      return;
    }
    const legs = flightPlan(this.site).map((l) => ({ phase: l.phase, tiles: l.path, pts: l.path.map((t) => toScreen(CITY_ISO, t.x, t.y)) }));
    const start = legs[0].pts[0];
    const img = addSprite(this.scene, 'veh:plane:cargo:NW', start.x, start.y).setDepth(PLANE_DEPTH);
    const shadow = hasSprite('veh:plane:cargo:shadow') ? addSprite(this.scene, 'veh:plane:cargo:shadow', start.x, start.y).setDepth(SHADOW_DEPTH).setAlpha(0.5) : undefined;
    const lights = hasSprite('veh:plane:cargo:NW@lights')
      ? addSprite(this.scene, 'veh:plane:cargo:NW@lights', start.x, start.y).setDepth(70_002).setBlendMode(Phaser.BlendModes.ADD).setAlpha(Math.max(0.35, this.night))
      : undefined;
    this.visit = { legs, leg: 0, seg: 0, along: 0, waited: 0, img, shadow, lights };
  }

  /** How many cargo jets are in the air or on the ground (the smoke checks there's at most one). */
  get flights() {
    return this.visit ? 1 : 0;
  }

  setNight(n: number) {
    this.night = n;
    for (const p of this.placed) p.lights?.setAlpha(n);
    this.visit?.lights?.setAlpha(Math.max(0.35, n));
  }

  update(dt: number) {
    const v = this.visit;
    if (!v) return;
    const leg = v.legs[v.leg];
    if (leg.phase === 'unload') {
      if (!v.crates && hasSprite('air:crates')) {
        const at = leg.pts[0];
        v.crates = addSprite(this.scene, 'air:crates', at.x + 18, at.y + 6).setDepth(entityDepth(at.y + 6));
      }
      v.waited += dt;
      if (v.waited >= UNLOAD_MS) {
        v.crates?.destroy();
        v.crates = undefined;
        this.nextLeg(v);
      }
      return;
    }
    const a = leg.pts[v.seg];
    const b = leg.pts[v.seg + 1];
    if (!b) return this.nextLeg(v);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    v.along += SPEED[leg.phase] * (dt / 1000);
    const t = Math.min(1, v.along / len);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const done = this.legDone(leg, v.seg, t);
    const alt = leg.phase === 'approach' ? APPROACH_ALT * (1 - done) : leg.phase === 'takeoff' ? CLIMB_ALT * Math.max(0, done * 2 - 0.6) : 0;
    const ta = leg.tiles[v.seg];
    const tb = leg.tiles[v.seg + 1];
    // Gear up once it's off the ground (the `:air` frames); the jet's anchor is its ground centre, so it sits on its tile.
    const ground = `veh:plane:cargo:${dirFor(tb.x - ta.x, tb.y - ta.y)}`;
    const sprite = alt > 4 && hasSprite(`${ground}:air`) ? `${ground}:air` : ground;
    if (v.img.frame.name !== sprite && hasSprite(sprite)) {
      v.img.setFrame(sprite);
      if (v.lights && hasSprite(`${sprite}@lights`)) v.lights.setFrame(`${sprite}@lights`);
    }
    const depth = alt > 4 ? PLANE_DEPTH : entityDepth(y);
    v.img.setPosition(Math.round(x), Math.round(y - alt)).setDepth(depth);
    v.lights?.setPosition(Math.round(x), Math.round(y - alt));
    v.shadow?.setPosition(Math.round(x + alt * 0.2), Math.round(y)).setAlpha(Math.max(0.15, 0.5 - alt / 400));
    if (t >= 1) {
      v.seg++;
      v.along = 0;
      if (v.seg >= leg.pts.length - 1) this.nextLeg(v);
    }
  }

  /** How far through the whole leg (0–1) the jet is, for the glide and the climb. */
  private legDone(leg: Visit['legs'][number], seg: number, t: number) {
    const lens = leg.pts.slice(1).map((p, i) => Math.hypot(p.x - leg.pts[i].x, p.y - leg.pts[i].y));
    const total = lens.reduce((s, l) => s + l, 0) || 1;
    const before = lens.slice(0, seg).reduce((s, l) => s + l, 0);
    return (before + lens[seg] * t) / total;
  }

  private nextLeg(v: Visit) {
    v.leg++;
    v.seg = 0;
    v.along = 0;
    v.waited = 0;
    if (v.leg < v.legs.length) return;
    this.endVisit();
    if (this.queued > 0) {
      this.queued--;
      this.land();
    }
  }

  private endVisit() {
    const v = this.visit;
    if (!v) return;
    v.img.destroy();
    v.shadow?.destroy();
    v.lights?.destroy();
    v.crates?.destroy();
    this.visit = undefined;
  }

  /** Reduced motion or a sleeping city: the jet that's out goes home, and nothing waits. */
  setStill(on: boolean) {
    if (!on) return;
    this.queued = 0;
    this.endVisit();
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

  private clearPieces() {
    this.hideTip();
    for (const p of this.placed) p.img.destroy(), p.lights?.destroy();
    this.placed = [];
  }

  destroy() {
    this.clearPieces();
    this.endVisit();
    this.key = '';
  }
}
