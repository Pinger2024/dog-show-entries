import { describe, it, expect } from 'vitest';
import {
  requiredGuarantorCount,
  hasEnoughGuarantors,
  showFeesConfigured,
} from '@/lib/show-setup-requirements';

describe('requiredGuarantorCount', () => {
  it('is 6 for a championship RKC show', () => {
    expect(requiredGuarantorCount({ showType: 'championship', showRuleset: 'rkc' })).toBe(6);
  });

  it('is 3 for an open RKC show', () => {
    expect(requiredGuarantorCount({ showType: 'open', showRuleset: 'rkc' })).toBe(3);
  });

  it('is 0 for a WUSV regional show, championship or not', () => {
    expect(requiredGuarantorCount({ showType: 'championship', showRuleset: 'wusv' })).toBe(0);
    expect(requiredGuarantorCount({ showType: 'open', showRuleset: 'wusv' })).toBe(0);
  });
});

describe('hasEnoughGuarantors', () => {
  it('fails below the minimum', () => {
    expect(hasEnoughGuarantors({ showType: 'championship', showRuleset: 'rkc' }, 5)).toBe(false);
  });

  it('passes at exactly the minimum', () => {
    expect(hasEnoughGuarantors({ showType: 'championship', showRuleset: 'rkc' }, 6)).toBe(true);
    expect(hasEnoughGuarantors({ showType: 'open', showRuleset: 'rkc' }, 3)).toBe(true);
  });

  it('a WUSV show always has enough, even with zero guarantors', () => {
    expect(hasEnoughGuarantors({ showType: 'championship', showRuleset: 'wusv' }, 0)).toBe(true);
  });
});

describe('showFeesConfigured', () => {
  it('false with neither a first fee nor regional tiers', () => {
    expect(showFeesConfigured({ firstEntryFee: null, regionalFeeConfig: null })).toBe(false);
    expect(showFeesConfigured({ firstEntryFee: 0, regionalFeeConfig: null })).toBe(false);
  });

  it('true with a positive first-entry fee', () => {
    expect(showFeesConfigured({ firstEntryFee: 1500, regionalFeeConfig: null })).toBe(true);
  });

  it('true with a regional tier config even when firstEntryFee is unset', () => {
    expect(
      showFeesConfigured({
        firstEntryFee: null,
        regionalFeeConfig: { tiers: [{ price: 500 }] },
      }),
    ).toBe(true);
  });

  it('false with an empty regional tiers array and no first fee', () => {
    expect(
      showFeesConfigured({ firstEntryFee: null, regionalFeeConfig: { tiers: [] } }),
    ).toBe(false);
  });
});
