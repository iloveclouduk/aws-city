// Types for scripts/launcher/panel.mjs (used by tests/launcher.test.ts).
export interface Step { id: string; title: string; status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'; detail?: string; started?: number; ended?: number; progress?: number }
export interface PanelState { subtitle?: string; steps: Step[]; status?: string; info?: string[]; infoTitle?: string; logs?: string[]; showLogs?: boolean; logTitle?: string; keys?: [string, string][]; note?: string }
export declare function renderPanel(state: PanelState, t: number, cols: number, rows: number, o?: { color?: boolean; now?: number; mini?: boolean }): string[];
export declare function createPanel(steps: { id: string; title: string }[], o?: { subtitle?: string; onInterrupt?: () => string[]; scene?: import('./banner.mjs').SceneLayout | null }): unknown;
export declare const panelReserve: (stepCount: number) => number;
export declare const isInteractive: () => boolean;
export declare function wrap(s: string, n: number, indent?: string): string[];
export declare const cut: (s: string, n: number) => string;
export declare function stepsGrowth(steps: Step[]): number;
export declare const miniSkyline: (growth: number) => string;
