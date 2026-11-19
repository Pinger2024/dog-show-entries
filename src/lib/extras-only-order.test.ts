import { describe, it, expect } from 'vitest';
import { isExtrasOnlyOrder } from './extras-only-order';

// The one definition of an extras-only order (Mandy, 15 Oct 2026).
describe('isExtrasOnlyOrder', () => {
  it('is extras only with no live entry and at least one extra', () => {
    expect(isExtrasOnlyOrder({ liveEntryCount: 0, sundryLineCount: 1 })).toBe(true);
  });
  it('is not extras only when a dog (or a withdrawn dog, still live) is on it', () => {
    expect(isExtrasOnlyOrder({ liveEntryCount: 1, sundryLineCount: 2 })).toBe(false);
  });
  it('is not extras only with nothing bought at all', () => {
    expect(isExtrasOnlyOrder({ liveEntryCount: 0, sundryLineCount: 0 })).toBe(false);
  });
});
