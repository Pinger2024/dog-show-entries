import { describe, it, expect } from 'vitest';
import { svCoatDisplayName, formatSvClassName } from '../class-labels';

/**
 * Regional coat-type WORDING (regional groups' decision 2026-08-11, via
 * Amanda): "Long Coat" / "Short Coat" everywhere a coat type is shown on a
 * show class — replacing the old "Stock Coat" / "Long Stock Coat" wording.
 * `svCoatDisplayName` is the single source every call site should go
 * through instead of its own stock/long_stock → string mapping.
 */
describe('svCoatDisplayName', () => {
  it('returns "Short Coat" for stock', () => {
    expect(svCoatDisplayName('stock')).toBe('Short Coat');
  });

  it('returns "Long Coat" for long_stock', () => {
    expect(svCoatDisplayName('long_stock')).toBe('Long Coat');
  });

  it('returns null for null/undefined (no coat split on this class)', () => {
    expect(svCoatDisplayName(null)).toBeNull();
    expect(svCoatDisplayName(undefined)).toBeNull();
  });
});

describe('formatSvClassName', () => {
  it('appends " — Long Coat" for long_stock', () => {
    expect(formatSvClassName('SV Junior', 'long_stock')).toBe('Junior — Long Coat');
  });

  it('appends " — Short Coat" for stock', () => {
    expect(formatSvClassName('SV Junior', 'stock')).toBe('Junior — Short Coat');
  });

  it('leaves the name bare when there is no coat split', () => {
    expect(formatSvClassName('SV Junior', null)).toBe('Junior');
    expect(formatSvClassName('Working', null)).toBe('Working');
  });

  it('strips the "SV " prefix and falls back to "Unknown Class" for a missing name', () => {
    expect(formatSvClassName(null, null)).toBe('Unknown Class');
  });
});
