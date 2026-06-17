import { describe, it, expect } from 'vitest';
import {
  AUTO_RELOAD_CAP,
  AUTO_RELOAD_COUNT_KEY,
  autoReloadCount,
  canAutoReload,
  resetAutoReloads,
  isChunkError,
} from '../chunk-recovery';

function stubLocalStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  return store;
}

// The lifetime auto-reload cap is the backstop that stops chunk/error recovery
// from becoming an iOS-Safari "A problem repeatedly occurred" reload storm
// (April Shaikh / BAGSD, 2026-06-17). error.tsx and global-error.tsx inline
// copies of this logic — these tests pin the shared contract.
describe('chunk-recovery auto-reload cap', () => {
  it('counts zero when unset and allows a reload', () => {
    stubLocalStorage();
    expect(autoReloadCount()).toBe(0);
    expect(canAutoReload()).toBe(true);
  });

  it('allows reloads up to the cap, then refuses', () => {
    const store = stubLocalStorage();
    store[AUTO_RELOAD_COUNT_KEY] = String(AUTO_RELOAD_CAP - 1);
    expect(canAutoReload()).toBe(true);
    store[AUTO_RELOAD_COUNT_KEY] = String(AUTO_RELOAD_CAP);
    expect(canAutoReload()).toBe(false);
    store[AUTO_RELOAD_COUNT_KEY] = String(AUTO_RELOAD_CAP + 5);
    expect(canAutoReload()).toBe(false);
  });

  it('resetAutoReloads clears the counter so a future deploy can recover again', () => {
    stubLocalStorage({ [AUTO_RELOAD_COUNT_KEY]: '9' });
    expect(canAutoReload()).toBe(false);
    resetAutoReloads();
    expect(autoReloadCount()).toBe(0);
    expect(canAutoReload()).toBe(true);
  });

  it('treats a corrupt counter value as zero (fails safe → allows recovery)', () => {
    stubLocalStorage({ [AUTO_RELOAD_COUNT_KEY]: 'not-a-number' });
    expect(autoReloadCount()).toBe(0);
    expect(canAutoReload()).toBe(true);
  });

  it('falls back to allowing recovery when localStorage throws (private mode)', () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem() { throw new Error('private mode'); },
      setItem() { throw new Error('private mode'); },
      removeItem() { throw new Error('private mode'); },
    };
    expect(autoReloadCount()).toBe(0);
    expect(canAutoReload()).toBe(true);
  });
});

// isChunkError is the ONLY gate into the reload-recovery machinery. A Stripe
// failure (declined card, canceled PaymentIntent, network error) must NEVER
// match it — otherwise a payment hiccup could feed the reload loop. This test
// locks that boundary (the 2026-06-17 root-cause hinged on it).
describe('isChunkError', () => {
  it('matches known chunk / dynamic-import load failures', () => {
    expect(isChunkError('ChunkLoadError: Loading chunk 42 failed')).toBe(true);
    expect(isChunkError('Loading chunk app/page failed')).toBe(true);
    expect(isChunkError('Failed to fetch dynamically imported module: https://x/_next/y.js')).toBe(true);
    expect(isChunkError('Importing a module script failed.')).toBe(true);
    expect(isChunkError('error loading dynamically imported module')).toBe(true);
  });

  it('does NOT match Stripe / render errors (they must not trigger reloads)', () => {
    expect(isChunkError('Your card was declined.')).toBe(false);
    expect(isChunkError('The PaymentIntent has been canceled.')).toBe(false);
    expect(isChunkError("Cannot read properties of undefined (reading 'status')")).toBe(false);
    expect(isChunkError('Rendered more hooks than during the previous render')).toBe(false);
    expect(isChunkError('')).toBe(false);
  });
});
