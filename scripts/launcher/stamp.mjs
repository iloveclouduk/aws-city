// "Did anything change since the last build?" for `npm start`: a fingerprint of every file the extension is built
// from (paths, sizes and modification times, not contents, so it takes milliseconds) plus the build's settings.
// The launcher keeps the last one per output folder in .cache/launcher.json and skips the build when it matches.
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** What a build reads: these folders, whole, and these files at the top. */
export const STAMP_DIRS = ['src', 'shared', 'public'];
export const STAMP_FILES = ['wxt.config.ts', 'package-lock.json', 'package.json', 'tsconfig.json', '.env', '.env.local', '.env.production'];

/** One fingerprint for a list of [path, size, mtimeMs] and the build's settings. Pure (unit-tested). */
export function stampOf(entries, settings = {}) {
  const h = createHash('sha1');
  for (const [p, size, mtime] of [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) h.update(`${p}\0${size}\0${Math.round(mtime)}\n`);
  h.update(JSON.stringify(Object.keys(settings).sort().map((k) => [k, settings[k]])));
  return h.digest('hex').slice(0, 16);
}

/** Walks the build's inputs under `root`. A missing file just isn't listed (so adding it later changes the stamp). */
export function sourceEntries(root, { dirs = STAMP_DIRS, files = STAMP_FILES } = {}) {
  const out = [];
  const add = (rel) => {
    try {
      const st = statSync(path.join(root, rel));
      if (st.isFile()) out.push([rel.split(path.sep).join('/'), st.size, st.mtimeMs]);
    } catch {
      // not there
    }
  };
  const walk = (rel) => {
    let names;
    try {
      names = readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      if (d.name === '.DS_Store') continue;
      const child = path.join(rel, d.name);
      if (d.isDirectory()) walk(child);
      else if (d.isFile()) add(child);
    }
  };
  for (const d of dirs) walk(d);
  for (const f of files) add(f);
  return out;
}

/** The env a WXT build sees that can change its output (WXT_ and VITE_ variables). */
export const buildEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => /^(WXT|VITE)_/.test(k)));

/** The fingerprint of building `target` (chrome | firefox | safari) under `root` with `env`. */
export const sourceStamp = (root, target, env = {}) => stampOf(sourceEntries(root), { target, ...buildEnv({ ...process.env, ...env }) });
