import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetUrl, readAsset } from '@/backend/assets';

// The sandbox's SVG export reads its icons through src/backend/assets.ts: the extension's own assets, nothing else.
const PAGE = 'chrome-extension://abcdefgh/city.html';

describe('readAsset (the one asset read outside the backend)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts the extension’s own assets, relative or root-relative', () => {
    expect(assetUrl('/assets/aws-icons/ec2.svg', PAGE)?.href).toBe('chrome-extension://abcdefgh/assets/aws-icons/ec2.svg');
    expect(assetUrl('assets/aws-icons/s3.svg', PAGE)?.href).toBe('chrome-extension://abcdefgh/assets/aws-icons/s3.svg');
    expect(assetUrl('/assets/aws-icons/s3.svg', 'moz-extension://1234-5678/city.html')).toBeTruthy();
    expect(assetUrl('/assets/aws-icons/s3.svg', 'http://localhost:3000/city.html')).toBeTruthy();
  });

  it('refuses any other URL: other origins, schemes, protocol-relative, outside /assets/, no page', () => {
    for (const href of [
      'https://evil.example/assets/x.svg',
      '//evil.example/assets/x.svg',
      'chrome-extension://otherid/assets/x.svg',
      'data:image/svg+xml,<svg/>',
      'javascript:alert(1)',
      'file:///etc/passwd',
      '/\\evil.example/assets/x.svg',
      '/city.html',
      '/assets/../popup.html',
    ])
      expect(assetUrl(href, PAGE), href).toBeUndefined();
    expect(assetUrl('/assets/x.svg', undefined)).toBeUndefined();
    expect(assetUrl('/assets/x.svg', 'about:blank')).toBeUndefined();
  });

  it('fetches an own asset, and never fetches a refused one', async () => {
    const fetch = vi.fn(async () => new Response('<svg/>', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const blob = await readAsset('/assets/aws-icons/ec2.svg', PAGE);
    expect(await blob.text()).toBe('<svg/>');
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe('chrome-extension://abcdefgh/assets/aws-icons/ec2.svg');
    await expect(readAsset('https://evil.example/assets/x.svg', PAGE)).rejects.toThrow(/own assets/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
