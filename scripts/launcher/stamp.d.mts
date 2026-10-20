// Types for scripts/launcher/stamp.mjs (used by tests/launcher.test.ts).
export declare const STAMP_DIRS: string[];
export declare const STAMP_FILES: string[];
export declare function stampOf(entries: [string, number, number][], settings?: Record<string, unknown>): string;
export declare function sourceEntries(root: string, o?: { dirs?: string[]; files?: string[] }): [string, number, number][];
export declare const buildEnv: (env?: Record<string, string | undefined>) => Record<string, string | undefined>;
export declare const sourceStamp: (root: string, target: string, env?: Record<string, string>) => string;
