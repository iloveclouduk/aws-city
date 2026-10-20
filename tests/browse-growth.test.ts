import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bus } from '@/state/bus';
import { browsedText, consoleName, useCity } from '@/state/store';
import { isDiscovered } from '@/state/selectors';
import type { PageFocus } from '@/state/types';

// "Browsing grew it": opening a service's console page is a moment the player sees: a toast with the building's icon,
// what grew and its growth line, and the camera flies there. The pay rule is unchanged (2⭐, once a minute a service).
const s = () => useCity.getState();
const S3: PageFocus = { url: 'https://us-west-2.console.aws.amazon.com/s3/buckets', title: 'S3', kind: 'console', serviceId: 's3', tabId: 1 };
let clock = Date.UTC(2026, 9, 19, 9);

beforeEach(() => {
  vi.useFakeTimers();
  // Each test starts well past the last one's once-a-minute window.
  clock += 10 * 60_000;
  vi.setSystemTime(clock);
  s().resetSession();
  s().clearToasts();
  s().setView({ name: 'city' });
});
afterEach(() => {
  s().resetSession();
  vi.useRealTimers();
});

const flights = () => {
  const ids: string[] = [];
  const off = bus.on('flyTo', ({ id }) => ids.push(id));
  return { ids, off };
};

describe('browsing grew it', () => {
  it('names the console and the building', () => {
    expect(consoleName('s3')).toBe('S3');
    expect(consoleName('lambda')).toBe('Lambda');
    expect(browsedText('s3', 2)).toBe('You opened the S3 console: S3 Lake +2⭐');
    expect(browsedText('s3', 0)).toMatch(/^You opened the S3 console: S3 Lake is going up!$/);
  });

  it('a first visit finds the building with the browsing toast (not the generic one)', () => {
    const f = flights();
    s().setFocus(S3);
    f.off();
    expect(isDiscovered(s().progress, 's3', s().cityRegion)).toBe(true);
    expect(s().toasts).toHaveLength(1);
    expect(s().toasts[0]).toMatchObject({ serviceId: 's3', text: browsedText('s3', 0) });
    expect(s().toasts[0].detail).toMatch(/^S3 Lake · 0\/\d+ to /);
    // The discovery flies the camera itself (CityScene.onDiscovered): no second flight.
    expect(f.ids).toEqual([]);
  });

  it('a later visit pays 2⭐ once a minute, with its growth line, and flies the camera there', () => {
    s().setFocus(S3);
    s().clearToasts();
    vi.setSystemTime(clock + 61_000);
    const f = flights();
    s().setFocus(S3);
    expect(s().toasts[0]).toMatchObject({ serviceId: 's3', text: 'You opened the S3 console: S3 Lake +2⭐' });
    expect(s().toasts[0].detail).toMatch(/^S3 Lake · 2\/\d+ to /);
    expect(f.ids).toEqual(['s3']);
    // Within the minute: nothing more (no stars, no toast, no flight).
    s().clearToasts();
    vi.setSystemTime(clock + 90_000);
    s().setFocus({ ...S3, url: `${S3.url}?again` });
    f.off();
    expect(s().toasts).toHaveLength(0);
    expect(f.ids).toEqual(['s3']);
  });

  it('waits behind a celebration card or a game: the toast queues, the camera stays put', () => {
    s().setFocus(S3);
    s().clearToasts();
    vi.setSystemTime(clock + 61_000);
    s().setView({ name: 'game', game: 'fishing' });
    const f = flights();
    s().setFocus(S3);
    f.off();
    expect(f.ids).toEqual([]);
    expect(s().toasts).toHaveLength(0); // held, shown once the game closes
  });

  it('docs pages and other sites never make the moment', () => {
    s().setFocus(S3);
    s().clearToasts();
    vi.setSystemTime(clock + 61_000);
    const f = flights();
    s().setFocus({ url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html', title: 'S3 docs', kind: 'docs', serviceId: 's3' });
    f.off();
    expect(s().toasts).toHaveLength(0);
    expect(f.ids).toEqual([]);
  });
});
