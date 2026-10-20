// The one read of the extension's own files from UI code (CLAUDE.md "One seam to the backend": only src/backend/ does
// network I/O). The sandbox's SVG export inlines its icons, so it reads them here. Only the extension's own bundled
// assets: a relative or root-relative path under /assets/ on the page's own origin; anything else is refused unread.

/** Schemes an extension page (or the dev server) is served from. */
const OWN_SCHEMES = new Set(['chrome-extension:', 'moz-extension:', 'safari-web-extension:', 'http:', 'https:']);

/** `href` resolved against the page, if it's one of the extension's own assets; otherwise undefined. */
export function assetUrl(href: string, base: string | undefined = globalThis.location?.href): URL | undefined {
  if (!base || /^[a-z][a-z0-9+.-]*:|^\/\/|\\/i.test(href)) return undefined; // relative paths only: no scheme, no //host
  let page: URL;
  let url: URL;
  try {
    page = new URL(base);
    url = new URL(href, page);
  } catch {
    return undefined;
  }
  // Compared by scheme and host: an extension origin reads as "null" in some URL implementations.
  if (!OWN_SCHEMES.has(page.protocol) || url.protocol !== page.protocol || url.host !== page.host || !page.host) return undefined;
  return url.pathname.startsWith('/assets/') ? url : undefined;
}

/** Reads one of the extension's own assets as a Blob; refuses any other URL without fetching it. */
export async function readAsset(href: string, base?: string): Promise<Blob> {
  const url = assetUrl(href, base ?? globalThis.location?.href);
  if (!url) throw new Error(`not one of the extension's own assets: ${href}`);
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`couldn't read ${url.pathname} (${res.status})`);
  return res.blob();
}
