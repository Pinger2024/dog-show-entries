import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoundedCache } from '@/lib/bounded-cache';

describe('BoundedCache', () => {
  it('evicts the least-recently-used entry past its limit', () => {
    const cache = new BoundedCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // pushes out 'a'

    expect(cache.size).toBe(3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('d')).toBe(4);
  });

  it('counts a read as a use, so the read key survives eviction', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // 'a' is now newest, 'b' is the LRU
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('never exceeds its limit however many keys are written', () => {
    const cache = new BoundedCache<number, number>(10);
    for (let i = 0; i < 1000; i++) cache.set(i, i);
    expect(cache.size).toBe(10);
  });

  it('rejects a nonsensical limit', () => {
    expect(() => new BoundedCache<string, string>(0)).toThrow(/maxEntries/);
  });
});

/**
 * The tonal-wash cache is the one that actually mattered: it is keyed by a
 * club's brand colours and holds full-page 1748x2480 PNG buffers, so on a
 * long-lived server it grew one large buffer per distinct colour pair ever
 * rendered. It also cached the *promise*, which meant one transient sharp
 * failure was replayed to every later caller for the life of the process.
 */
describe('sv-tonal-wash cache', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not cache a failed bake (a transient error must not poison the key)', async () => {
    let calls = 0;
    vi.doMock('sharp', () => ({
      default: () => {
        calls++;
        return {
          blur: () => ({
            png: () => ({
              toBuffer: async () => {
                // Fail only the first bake.
                if (calls === 1) throw new Error('transient sharp failure');
                return Buffer.from('png');
              },
            }),
          }),
        };
      },
    }));

    const { getTonalWash } = await import('@/server/services/sv-tonal-wash');

    await expect(getTonalWash('#111111', '#222222', 'cover')).rejects.toThrow(/transient/);

    // Same key again: must re-bake and succeed rather than replay the rejection.
    await expect(getTonalWash('#111111', '#222222', 'cover')).resolves.toBeInstanceOf(Buffer);
    expect(calls).toBe(2);
  });

  it('reuses a successful bake for the same colours', async () => {
    let calls = 0;
    vi.doMock('sharp', () => ({
      default: () => {
        calls++;
        return {
          blur: () => ({
            png: () => ({ toBuffer: async () => Buffer.from('png') }),
          }),
        };
      },
    }));

    const { getTonalWash } = await import('@/server/services/sv-tonal-wash');

    await getTonalWash('#333333', '#444444', 'cover');
    await getTonalWash('#333333', '#444444', 'cover');
    expect(calls).toBe(1);
  });

  it('re-bakes a colour pair that has been evicted by newer ones', async () => {
    let calls = 0;
    vi.doMock('sharp', () => ({
      default: () => {
        calls++;
        return {
          blur: () => ({ png: () => ({ toBuffer: async () => Buffer.from('png') }) }),
        };
      },
    }));

    const { getTonalWash } = await import('@/server/services/sv-tonal-wash');

    const first = '#aa0000';
    await getTonalWash(first, first, 'cover');
    const callsAfterFirst = calls;

    // Push well past the cache limit (32) with distinct colour pairs, so the
    // first entry must have been evicted rather than retained forever.
    for (let i = 0; i < 64; i++) {
      const hex = `#${i.toString(16).padStart(6, '0')}`;
      await getTonalWash(hex, hex, 'cover');
    }

    // Re-requesting the original pair bakes again — proof it was dropped. With
    // the old unbounded Map this returned the retained buffer and baked 0 times.
    const before = calls;
    await getTonalWash(first, first, 'cover');
    expect(calls).toBe(before + 1);
    expect(callsAfterFirst).toBe(1);
  });
});
