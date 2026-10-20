// Types for scripts/citymap/rasterise.mjs (used by tests/city-maps.test.ts).
export declare const CORE: number;
export declare const RING: number;
export declare const N: number;
export declare const C0: number;
export declare const C1: number;
export declare const MIN_BLOCK: number;
export declare const OVERLAP: number;
export declare const SB: number;
export declare const MPTS: number[];
export declare const MIN_LOTS: number;
export type Pt = [number, number];
export interface OsmData { roads: { cls: string; pts: Pt[]; tunnel: boolean; bridge: boolean }[]; coast: Pt[][]; rivers: { pts: Pt[]; widthM: number }[]; water: Pt[][][]; park: Pt[][][]; buildings: Pt[] }
export interface Line { axis: 'x' | 'y'; pos: number; w: 1 | 2; from: number; to: number; cls: number; syn: boolean; src: string; weight: number; ring?: boolean; reserved?: boolean }
export interface Plan {
  mpt: number; bearing: number; rot: number; shift: [number, number];
  water: Uint8Array; green: Uint8Array; road: Uint8Array; lines: Line[]; rects: { id: string; x: number; y: number }[];
  lots: Pt[]; density: string; errors: string[];
  metrics: { mpt: number; fidelity: number; water: number; candidates: number; kept: number; dropped: number; synthetic: number; added: number; streets: number; avenues: number; lots: number; edgeWater: number; ringWater: number };
}
export declare function parseOsm(json: unknown, centre: { lat: number; lon: number }): OsmData;
export declare function assemble(lines: Pt[][]): Pt[][];
export declare function dominantBearing(roads: OsmData['roads']): number;
export declare function rasterise(d: OsmData, opts?: { bearing?: number; rots?: number[]; mpts?: number[] }): { pick: Plan | null; tries: Plan[] };
export declare function validate(lines: Line[], rects: Plan['rects'], water?: Uint8Array): string[];
