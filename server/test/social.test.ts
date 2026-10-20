import { describe, expect, it } from 'vitest';
import { isBoard, isoWeekUtc, maxScore, memorySocial, PRESENCE_MS, socialFor, whoOf, withPresenceCache } from '../src/social.js';

// The live city and leaderboards (contract v2.11): only a public profile is ever named, scores are clamped and the best
// of the week kept, presence expires, and a private or deleted player leaves everything.
const at = (ms: number) => () => ms;

describe('live city and leaderboards', () => {
  it('names only public profiles; private players are counted, not shown', async () => {
    const store = memorySocial(at(1_000));
    const pub = socialFor({ store, sub: 'a', profile: async () => ({ public: true, name: 'Kind Otter' }) });
    const priv = socialFor({ store, sub: 'b', profile: async () => ({ public: false, name: 'Shy Owl' }) });
    await priv.beat('us-west-2', 'Town');
    const s = await pub.beat('us-west-2', 'City');
    expect(s).toEqual({ type: 'presence.state', region: 'us-west-2', online: 2, mayors: [{ name: 'Kind Otter', rank: 'City' }] });
  });

  it('presence expires, and moving city leaves the last one', async () => {
    let now = 0;
    const store = memorySocial(() => now);
    const me = socialFor({ store, sub: 'a', profile: async () => ({ public: true, name: 'Kind Otter' }) });
    await me.beat('us-west-2', 'Town');
    await me.beat('eu-west-1', 'Town');
    expect((await store.presence('us-west-2')).online).toBe(0);
    now = PRESENCE_MS + 1;
    expect((await store.presence('eu-west-1')).online).toBe(0);
  });

  it('keeps the best score of the week, clamped, and only for a public profile on a real board', async () => {
    const store = memorySocial();
    const now = () => new Date('2026-10-17T12:00:00Z');
    const me = socialFor({ store, sub: 'a', profile: async () => ({ public: true, name: 'Kind Otter' }), now });
    const priv = socialFor({ store, sub: 'b', profile: async () => undefined, now });
    await me.submit('shield', 120);
    await me.submit('shield', 80);
    await priv.submit('shield', 999);
    const board = await me.submit('shield', 1e9);
    expect(board).toMatchObject({ board: 'shield', week: '2026-W42', entries: [{ name: 'Kind Otter', score: maxScore('shield'), you: true }] });
    await me.submit('not-a-game', 50);
    expect((await me.board('not-a-game')).entries).toEqual([]);
  });

  it('forget removes presence and every board row', async () => {
    const store = memorySocial();
    const me = socialFor({ store, sub: 'a', profile: async () => ({ public: true, name: 'Kind Otter' }) });
    await me.beat('us-west-2', 'Town');
    await me.submit('fishing', 40);
    await store.forget('a');
    expect((await store.presence('us-west-2')).online).toBe(0);
    expect((await me.board('fishing')).entries).toEqual([]);
  });

  it('files players under a salted hash, knows its boards, and caches presence', async () => {
    expect(whoOf('abc')).toMatch(/^[0-9a-f]{20}$/);
    expect(whoOf('abc')).not.toContain('abc');
    expect(isBoard('shield') && isBoard('mayors:us-west-2')).toBe(true);
    expect(isBoard('mayors:../x') || isBoard('drop table')).toBe(false);
    expect(isoWeekUtc(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
    let calls = 0;
    const base = memorySocial();
    const cached = withPresenceCache({ ...base, presence: async (r) => (calls++, base.presence(r)) }, 15_000, at(0));
    await cached.presence('us-west-2');
    await cached.presence('us-west-2');
    expect(calls).toBe(1);
  });
});
