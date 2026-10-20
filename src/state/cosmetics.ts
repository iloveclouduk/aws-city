// Cosmetics (contract v2.15): what the Daily Supply Drop, the season roads and the Service Codex's sets give. Every one
// is a look, never a power or a currency: a decoration to place free in Decorate (its sprite already in the atlas), or
// a colour for the City Lights windows. Pure data (no imports from the modules that award them, so nothing cycles).

export type Rarity = 'common' | 'rare' | 'epic';

export interface Cosmetic {
  id: string;
  name: string;
  icon: string;
  kind: 'decor' | 'glow';
  rarity: Rarity;
  /** decor: atlas sprites (the first is placed; R steps through the rest). */
  variants?: string[];
  /** decor: footprint in tiles. */
  size?: 1 | 2;
  /** glow: the window colour (0xRRGGBB) and how the swatch looks in the UI. */
  color?: number;
  css?: string;
}

const decor = (id: string, name: string, icon: string, rarity: Rarity, variants: string[], size: 1 | 2 = 1): Cosmetic => ({ id, name, icon, kind: 'decor', rarity, variants, size });
const glow = (id: string, name: string, color: number, rarity: Rarity = 'common'): Cosmetic => ({
  id,
  name,
  icon: '💡',
  kind: 'glow',
  rarity,
  color,
  css: `#${color.toString(16).padStart(6, '0')}`,
});

export const COSMETICS: Cosmetic[] = [
  // Small decorations (the drop's commons and the roads' early steps).
  decor('snowman', 'Snowman', '⛄', 'common', ['season:winter:snowman']),
  decor('beach-umbrella', 'Beach umbrella', '⛱️', 'common', ['season:summer:umbrella0', 'season:summer:umbrella1']),
  decor('maple', 'Autumn maple', '🍁', 'common', ['season:autumn:tree0', 'season:autumn:tree1']),
  decor('blossom', 'Blossom tree', '🌸', 'common', ['season:spring:tree0', 'season:spring:tree1']),
  decor('snowy-pine', 'Snowy pine', '🌲', 'common', ['season:winter:pine']),
  decor('summer-tree', 'Summer shade tree', '🌳', 'common', ['season:summer:tree1']),
  decor('garden-gazebo', 'Garden gazebo', '🛖', 'rare', ['park:gazebo']),
  decor('hedge-maze', 'Hedge maze', '🌿', 'epic', ['park:maze'], 2),
  decor('amphitheatre', 'Open-air stage', '🎭', 'epic', ['park:amphitheatre'], 2),
  // v2.16 seasonal variants: the city's own seasonal sprites, as decorations (more for crates to hold, renewably).
  decor('frosted-oak', 'Frosted oak', '❄️', 'common', ['season:winter:deco:oak']),
  decor('golden-oak', 'Golden autumn oak', '🍂', 'common', ['season:autumn:deco:oak']),
  decor('spring-oak', 'Spring oak', '🌱', 'common', ['season:spring:deco:oak']),
  decor('frosted-pine', 'Frosted pine', '🌲', 'common', ['season:winter:deco:pine']),
  decor('frosted-hedge', 'Frosted hedge', '🌿', 'common', ['season:winter:deco:hedge']),
  decor('season-bush', 'Four-seasons bush', '🌳', 'common', ['season:spring:bush', 'season:summer:bush', 'season:autumn:bush', 'season:winter:bush']),
  decor('winter-flowers', 'Winter flower bed', '🌼', 'common', ['season:winter:flowers']),
  decor('street-tree', 'Seasonal street tree', '🌳', 'common', ['season:spring:tree:street:0', 'season:autumn:tree:street:0', 'season:winter:tree:street:0']),
  decor('frosted-cherry', 'Frosted cherry', '🌸', 'rare', ['season:winter:deco:cherry']),
  decor('pocket-park', 'Pocket park', '🏞️', 'rare', ['park:pocket:0', 'park:pocket:1', 'park:pocket:2', 'park:pocket:3']),
  decor('ticket-booth', 'Ticket booth', '🎟️', 'rare', ['park:booth']),
  // Monuments (season landmarks and the Codex's finished sets): the generic Region signature motifs.
  decor('mon-pavilion-gold', 'Golden pavilion', '🏯', 'epic', ['sig:pavilion:gold'], 2),
  decor('mon-pavilion-green', 'Garden pavilion', '🏯', 'epic', ['sig:pavilion:green'], 2),
  decor('mon-dome-glass', 'Glass dome', '🔮', 'epic', ['sig:dome:glass'], 2),
  decor('mon-dome-geodesic', 'Geodesic dome', '🌐', 'epic', ['sig:dome:geodesic'], 2),
  decor('mon-dome-stone', 'Stone dome', '🏛️', 'epic', ['sig:dome:stone'], 2),
  decor('mon-needle-white', 'White needle tower', '🗼', 'epic', ['sig:needle:white'], 2),
  decor('mon-needle-red', 'Red needle tower', '🗼', 'epic', ['sig:needle:red'], 2),
  decor('mon-lattice-bronze', 'Bronze lattice tower', '🗼', 'epic', ['sig:lattice:bronze'], 2),
  decor('mon-spire-clock', 'Clock spire', '🕰️', 'epic', ['sig:spire:clock'], 2),
  decor('mon-spire-alpine', 'Alpine spire', '⛪', 'epic', ['sig:spire:alpine'], 2),
  decor('mon-gate-arch', 'Grand arch', '🏛️', 'epic', ['sig:gate:arch'], 2),
  decor('mon-gate-columns', 'Column gate', '🏛️', 'epic', ['sig:gate:columns'], 2),
  decor('mon-shells', 'Shell-roof hall', '🐚', 'epic', ['sig:shells:white'], 2),
  decor('mon-harbour', 'Harbour towers', '🏙️', 'epic', ['sig:harbour:glass'], 2),
  decor('mon-windtower', 'Wind tower', '🏜️', 'epic', ['sig:windtower:sand'], 2),
  decor('mon-modernist', 'Modern gallery', '🖼️', 'epic', ['sig:modernist:red'], 2),
  decor('mon-campus', 'Green campus', '🏫', 'epic', ['sig:campus:green'], 2),
  decor('mon-bridge', 'Arched footbridge', '🌉', 'epic', ['sig:bridge:arches'], 2),
  decor('mon-rowhouses', 'Bright row houses', '🏘️', 'epic', ['sig:rowhouses:bright'], 2),
  decor('mon-lattice-red', 'Red lattice tower', '🗼', 'epic', ['sig:lattice:red'], 2),
  decor('mon-pavilion-red', 'Red pavilion', '🏯', 'epic', ['sig:pavilion:red'], 2),
  decor('mon-pavilion-teak', 'Teak pavilion', '🏯', 'epic', ['sig:pavilion:teak'], 2),
  decor('mon-spire-brick', 'Brick spire', '⛪', 'epic', ['sig:spire:brick'], 2),
  decor('mon-windtower-coral', 'Coral wind tower', '🏜️', 'epic', ['sig:windtower:coral'], 2),
  // City Lights window colours (the default is warm gold).
  glow('glow-rose', 'Rose windows', 0xff8fb1),
  glow('glow-mint', 'Mint windows', 0x8ff0c8),
  glow('glow-sky', 'Sky-blue windows', 0x8fd3ff),
  glow('glow-lilac', 'Lilac windows', 0xc8a8ff),
  glow('glow-ember', 'Ember windows', 0xff9a4d),
  glow('glow-lime', 'Lime windows', 0xd4ff70),
  glow('glow-ice', 'Ice windows', 0xd8f4ff, 'rare'),
  glow('glow-gold', 'Golden windows', 0xffd34d, 'rare'),
  glow('glow-coral', 'Coral windows', 0xff7a6b),
  glow('glow-teal', 'Teal windows', 0x4de0d0),
  glow('glow-violet', 'Violet windows', 0x9a7bff),
  glow('glow-rainbow', 'Aurora windows', 0x9dffb0, 'epic'),
  // v2.16: more window colours for the crates.
  glow('glow-peach', 'Peach windows', 0xffc29a),
  glow('glow-cyan', 'Cyan windows', 0x7ff6ff),
  glow('glow-magenta', 'Magenta windows', 0xff7ae0),
  glow('glow-amber', 'Amber windows', 0xffb347),
  glow('glow-sea', 'Sea-green windows', 0x5fd6a4),
  glow('glow-pearl', 'Pearl windows', 0xf3ecff, 'rare'),
  glow('glow-sunset', 'Sunset windows', 0xff8a5c, 'epic'),
];

/** Season landmarks and the Codex's monuments are earned there, never from a crate (nor bought): the rest is the crate pool. */
export const DROP_POOL: Cosmetic[] = COSMETICS.filter((c) => !c.id.startsWith('mon-'));

/** The default City Lights colour (warm window light). */
export const DEFAULT_GLOW = 0xffd98a;

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c] as const));
export const cosmeticById = (id: string) => BY_ID.get(id);
export const RARITY_NAME: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic' };
