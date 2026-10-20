// Types for scripts/launcher/boot.mjs (used by tests/launcher.test.ts).
export interface DepsFacts { hasModules: boolean; missing?: string[]; hasLock: boolean; lockMtime?: number; hiddenMtime?: number }
export type DepsPlan = { install: false } | { install: true; reason: 'missing' | 'incomplete' | 'changed'; args: string[] };
export declare const INSTALL_LOG: string;
export declare const KEY_PACKAGES: string[];
export declare function depsPlan(facts: DepsFacts): DepsPlan;
export declare const installMessage: (reason: string) => string;
export declare function explainNpmError(output?: string, code?: string | number | null): string;
export declare function readDepsFacts(root?: string): DepsFacts;
export declare function boot(): Promise<void>;
