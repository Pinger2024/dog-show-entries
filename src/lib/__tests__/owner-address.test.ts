import { describe, it, expect } from 'vitest';
import {
  addressesMatch,
  applySameAddress,
  deriveSameAddressFlags,
} from '@/lib/owner-address';

const HOUSEHOLD = '1 The Lane, Shotts, ML7 4AB';
const NAMED_HOUSE = 'Fortissat House, Shotts, ML7 4AB';

describe('addressesMatch', () => {
  it('matches identical addresses', () => {
    expect(addressesMatch(HOUSEHOLD, HOUSEHOLD)).toBe(true);
  });

  it('ignores case and stray whitespace', () => {
    expect(addressesMatch('1 the lane,  Shotts,   ML7 4AB', HOUSEHOLD)).toBe(true);
  });

  it('does not match two blank addresses', () => {
    expect(addressesMatch('', '')).toBe(false);
    expect(addressesMatch('   ', null)).toBe(false);
  });

  it('does not match different addresses', () => {
    expect(addressesMatch(NAMED_HOUSE, HOUSEHOLD)).toBe(false);
  });
});

describe('deriveSameAddressFlags', () => {
  it('never ticks Owner 1 — it is the address the others copy', () => {
    const flags = deriveSameAddressFlags([{ ownerAddress: HOUSEHOLD }]);
    expect(flags).toEqual([false]);
  });

  it('ticks a joint owner already sharing the primary address', () => {
    const flags = deriveSameAddressFlags([
      { ownerAddress: HOUSEHOLD },
      { ownerAddress: HOUSEHOLD },
    ]);
    expect(flags).toEqual([false, true]);
  });

  it('leaves a joint owner at their own address unticked', () => {
    const flags = deriveSameAddressFlags([
      { ownerAddress: HOUSEHOLD },
      { ownerAddress: NAMED_HOUSE },
    ]);
    expect(flags).toEqual([false, false]);
  });

  it('does not tick when the primary address is blank', () => {
    // Otherwise two empty rows would tick, hiding a required field behind a
    // tick the owner never chose.
    const flags = deriveSameAddressFlags([
      { ownerAddress: '' },
      { ownerAddress: '' },
    ]);
    expect(flags).toEqual([false, false]);
  });

  it('handles a household of four', () => {
    const flags = deriveSameAddressFlags([
      { ownerAddress: HOUSEHOLD },
      { ownerAddress: HOUSEHOLD },
      { ownerAddress: NAMED_HOUSE },
      { ownerAddress: HOUSEHOLD },
    ]);
    expect(flags).toEqual([false, true, false, true]);
  });
});

describe('applySameAddress', () => {
  it('copies the primary address onto ticked joint owners', () => {
    const owners = [
      { ownerName: 'Jean McArthur', ownerAddress: NAMED_HOUSE },
      { ownerName: 'Ian McArthur', ownerAddress: '' },
    ];
    const result = applySameAddress(owners, [false, true]);
    expect(result[1].ownerAddress).toBe(NAMED_HOUSE);
  });

  it('picks up a later edit to the primary address', () => {
    // The household moved: Owner 1's address is retyped, the ticked joint
    // owner follows on save without anyone editing their row.
    const owners = [
      { ownerAddress: 'Fortissat House, Shotts, ML7 9ZZ' },
      { ownerAddress: NAMED_HOUSE },
    ];
    const result = applySameAddress(owners, [false, true]);
    expect(result[1].ownerAddress).toBe('Fortissat House, Shotts, ML7 9ZZ');
  });

  it('leaves unticked joint owners alone', () => {
    const owners = [
      { ownerAddress: HOUSEHOLD },
      { ownerAddress: NAMED_HOUSE },
    ];
    const result = applySameAddress(owners, [false, false]);
    expect(result[1].ownerAddress).toBe(NAMED_HOUSE);
  });

  it('never rewrites Owner 1', () => {
    const owners = [
      { ownerAddress: HOUSEHOLD },
      { ownerAddress: NAMED_HOUSE },
    ];
    const result = applySameAddress(owners, [true, false]);
    expect(result[0].ownerAddress).toBe(HOUSEHOLD);
  });

  it('does not wipe a joint owner when the primary address is cleared', () => {
    // Clearing Owner 1's address mid-edit must not destroy a real address
    // sitting on a ticked row.
    const owners = [
      { ownerAddress: '' },
      { ownerAddress: NAMED_HOUSE },
    ];
    const result = applySameAddress(owners, [false, true]);
    expect(result[1].ownerAddress).toBe(NAMED_HOUSE);
  });

  it('does not mutate the rows it was given', () => {
    const owners = [{ ownerAddress: HOUSEHOLD }, { ownerAddress: '' }];
    applySameAddress(owners, [false, true]);
    expect(owners[1].ownerAddress).toBe('');
  });
});
