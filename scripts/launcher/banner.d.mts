// Types for scripts/launcher/banner.mjs (used by tests/launcher.test.ts).
export declare const INTRO_SECONDS: number;
export declare const STILL_T: number;
export declare function frame(t: number, width: number, o?: { color?: boolean; compact?: boolean; pending?: number; tagline?: boolean; growth?: number; fireworks?: boolean }): string[];
export interface SceneLayout { compact: boolean; rows: number }
export declare function sceneLayout(cols: number, rows: number, reserve?: number): SceneLayout | null;
export declare function sceneLines(cols: number, layout: Pick<SceneLayout, 'compact'>, o?: { color?: boolean }): string[];
export declare function introLines(t: number, cols: number, layout: Pick<SceneLayout, 'compact'>, o?: { color?: boolean }): string[];
export declare function printScene(o?: { reserve?: number }): SceneLayout | null | undefined;
export declare function printBanner(): void;
export declare function playIntro(o?: { animate?: boolean; reserve?: number }): Promise<SceneLayout | null | undefined>;
export declare const ROOF_TIPS: string;
export declare const introGrowth: (t: number) => number;
export declare function lotsFor(width: number, o?: { compact?: boolean }): unknown[];
