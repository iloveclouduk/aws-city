// Types for scripts/citymap/encode.mjs (used by tests/city-maps.test.ts).
import type { Plan } from './rasterise.mjs';
export type Street = [axis: 'x' | 'y', at: number, from: number, to: number, width: 1 | 2, cls: number, syn?: 1];
export interface CityMapFile {
  v: 1; region: string; city: string; centre: [number, number]; shift: [number, number]; mpt: number; bearing: number; rot: number;
  core: number; ring: number; streets: Street[]; square: [number, number]; day1: [number, number]; campus: [number, number];
  water: string; green: string; density: string; quality: { fidelity: number; dropped: number; synthetic: number; lots: number };
  attribution: string; licence: string; fetched: string; source: string;
}
export declare const ATTRIBUTION: string;
export declare const LICENCE: string;
export declare function rle(mask: ArrayLike<number>, n?: number): string;
export declare function unrle(s: string, n?: number): Uint8Array;
export declare function encodeMap(plan: Plan, meta: { region: string; city: string; centre: [number, number]; fetched: string; source: string }): CityMapFile;
