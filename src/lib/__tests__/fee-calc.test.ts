import { describe, it, expect } from 'vitest';
import { computeOrderFees, type FeeContext, type DogEntryInput } from '../fee-calc';

// Locked with Amanda 2026-05-14. The live show her demo user described:
//   non-member single class:  £20
//   member    single class:   £17
//   non-member 3+ dog package: £56
//   member    3+ dog package: £45
//   subsequent class (same dog): £10
//   JH and NFC are flat, never count toward multi-dog.
//
// Pence figures: £1 = 100p.

const STD: FeeContext = {
  firstEntryFeePence: 2000,
  subsequentEntryFeePence: 1000,
  nfcEntryFeePence: 500,
  juniorHandlerFeePence: 300,
  multiDogThreshold: null,
  multiDogPackagePence: null,
  discountGroup: null,
};

const STD_WITH_MULTI: FeeContext = {
  ...STD,
  multiDogThreshold: 3,
  multiDogPackagePence: 5600,
};

const MEMBER_GROUP = {
  firstEntryFeePence: 1700,
  multiDogPackagePence: 4500,
};

function dog(key: string, classCount = 1): DogEntryInput {
  return { key, kind: 'standard', classCount };
}
function jh(key: string): DogEntryInput {
  return { key, kind: 'junior_handler', classCount: 1 };
}
function nfc(key: string, classCount = 1): DogEntryInput {
  return { key, kind: 'nfc', classCount };
}

describe('computeOrderFees — single dog, single class', () => {
  it('charges first entry fee', () => {
    const r = computeOrderFees([dog('a')], STD);
    expect(r.total).toBe(2000);
    expect(r.multiDogApplied).toBe(false);
    expect(r.perEntry[0].perClassFees).toEqual([2000]);
  });

  it('charges member rate when member group declared', () => {
    const r = computeOrderFees([dog('a')], { ...STD, discountGroup: MEMBER_GROUP });
    expect(r.total).toBe(1700);
    expect(r.perEntry[0].perClassFees).toEqual([1700]);
  });
});

describe('computeOrderFees — same dog multiple classes (subsequent rate)', () => {
  it('charges first + subsequent for one dog in 3 classes', () => {
    const r = computeOrderFees([dog('a', 3)], STD);
    expect(r.total).toBe(2000 + 1000 + 1000);
    expect(r.perEntry[0].perClassFees).toEqual([2000, 1000, 1000]);
  });

  it('member rate replaces first-class fee only; subsequent stays standard', () => {
    const r = computeOrderFees([dog('a', 3)], { ...STD, discountGroup: MEMBER_GROUP });
    expect(r.total).toBe(1700 + 1000 + 1000);
    expect(r.perEntry[0].perClassFees).toEqual([1700, 1000, 1000]);
  });
});

describe('computeOrderFees — multi-dog package, below threshold', () => {
  it('2 dogs at threshold=3 → no package, charge per-dog', () => {
    const r = computeOrderFees([dog('a'), dog('b')], STD_WITH_MULTI);
    expect(r.multiDogApplied).toBe(false);
    expect(r.total).toBe(2000 * 2);
  });
});

describe('computeOrderFees — multi-dog package, at threshold', () => {
  it('3 dogs → standard package replaces sum of first-class fees', () => {
    const r = computeOrderFees([dog('a'), dog('b'), dog('c')], STD_WITH_MULTI);
    expect(r.multiDogApplied).toBe(true);
    expect(r.payingDogCount).toBe(3);
    expect(r.total).toBe(5600);
    expect(r.multiDogSavings).toBe(6000 - 5600);
  });

  it('3 dogs with member group → member package applies', () => {
    const r = computeOrderFees(
      [dog('a'), dog('b'), dog('c')],
      { ...STD_WITH_MULTI, discountGroup: MEMBER_GROUP },
    );
    expect(r.multiDogApplied).toBe(true);
    expect(r.total).toBe(4500);
    expect(r.multiDogSavings).toBe(1700 * 3 - 4500);
  });

  it('10 dogs at threshold=3 → still flat package price (Amanda explicit)', () => {
    const entries = Array.from({ length: 10 }, (_, i) => dog(`d${i}`));
    const r = computeOrderFees(entries, STD_WITH_MULTI);
    expect(r.multiDogApplied).toBe(true);
    expect(r.payingDogCount).toBe(10);
    expect(r.total).toBe(5600);
  });

  it('extra-class fees stack on top of the package', () => {
    // 3 dogs, one of them in 3 classes total.
    const r = computeOrderFees(
      [dog('a', 3), dog('b'), dog('c')],
      STD_WITH_MULTI,
    );
    expect(r.multiDogApplied).toBe(true);
    expect(r.total).toBe(5600 + 1000 + 1000);
  });

  it('package splits across paying entries with rounding on the last entry', () => {
    // £56 / 3 = £18.6666 → 1866, 1866, 1868 pence
    const r = computeOrderFees([dog('a'), dog('b'), dog('c')], STD_WITH_MULTI);
    const firstSlots = r.perEntry.map((e) => e.perClassFees[0]);
    expect(firstSlots[0]! + firstSlots[1]! + firstSlots[2]!).toBe(5600);
    expect(firstSlots[2]).toBeGreaterThanOrEqual(firstSlots[0]!);
  });
});

describe('computeOrderFees — JH and NFC excluded from multi-dog', () => {
  it('JH-only dog does not count toward threshold', () => {
    // 2 paying + 1 JH = only 2 paying dogs, below threshold of 3
    const r = computeOrderFees([dog('a'), dog('b'), jh('c')], STD_WITH_MULTI);
    expect(r.multiDogApplied).toBe(false);
    expect(r.payingDogCount).toBe(2);
    // 2 × £20 paying + £3 JH
    expect(r.total).toBe(2000 * 2 + 300);
  });

  it('NFC-only dog does not count toward threshold', () => {
    const r = computeOrderFees([dog('a'), dog('b'), nfc('c')], STD_WITH_MULTI);
    expect(r.multiDogApplied).toBe(false);
    expect(r.payingDogCount).toBe(2);
    expect(r.total).toBe(2000 * 2 + 500);
  });

  it('3 paying dogs + 1 JH → package applies to paying dogs, JH stays flat', () => {
    const r = computeOrderFees(
      [dog('a'), dog('b'), dog('c'), jh('d')],
      STD_WITH_MULTI,
    );
    expect(r.multiDogApplied).toBe(true);
    expect(r.total).toBe(5600 + 300);
  });
});

describe('computeOrderFees — JH and NFC pricing', () => {
  it('JH is flat regardless of class count', () => {
    const r = computeOrderFees([jh('a')], STD);
    expect(r.total).toBe(300);
    expect(r.perEntry[0].perClassFees).toEqual([300]);
  });

  it('NFC charges per class (1 minimum)', () => {
    const r = computeOrderFees([nfc('a', 2)], STD);
    expect(r.total).toBe(500 * 2);
  });

  it('member discount group does not affect JH or NFC fees', () => {
    const r = computeOrderFees([jh('a'), nfc('b')], { ...STD, discountGroup: MEMBER_GROUP });
    expect(r.total).toBe(300 + 500);
  });
});

describe('computeOrderFees — discount group without multi-dog config', () => {
  it('member rate applies even when multi-dog is not configured', () => {
    const r = computeOrderFees([dog('a'), dog('b')], { ...STD, discountGroup: MEMBER_GROUP });
    expect(r.multiDogApplied).toBe(false);
    expect(r.total).toBe(1700 * 2);
  });
});

describe('computeOrderFees — discount group without member package falls back to standard package', () => {
  it('member with no group multi-dog package uses standard package above threshold', () => {
    const groupWithoutPackage = { firstEntryFeePence: 1700, multiDogPackagePence: null };
    const r = computeOrderFees(
      [dog('a'), dog('b'), dog('c')],
      { ...STD_WITH_MULTI, discountGroup: groupWithoutPackage },
    );
    expect(r.multiDogApplied).toBe(true);
    expect(r.total).toBe(5600);
  });
});

describe('computeOrderFees — Amanda live show fixture', () => {
  // Mirrors the secretary spec her demo user described:
  //   £20 single, £17 single member, £56 3+ package, £45 3+ member package.
  // These four cases must all match exactly — they're the user's actual prices.
  it('1 non-member dog 1 class = £20', () => {
    const r = computeOrderFees([dog('a')], STD_WITH_MULTI);
    expect(r.total).toBe(2000);
  });

  it('1 member dog 1 class = £17', () => {
    const r = computeOrderFees([dog('a')], { ...STD_WITH_MULTI, discountGroup: MEMBER_GROUP });
    expect(r.total).toBe(1700);
  });

  it('3 non-member dogs 1 class each = £56 (package)', () => {
    const r = computeOrderFees([dog('a'), dog('b'), dog('c')], STD_WITH_MULTI);
    expect(r.total).toBe(5600);
  });

  it('3 member dogs 1 class each = £45 (member package)', () => {
    const r = computeOrderFees(
      [dog('a'), dog('b'), dog('c')],
      { ...STD_WITH_MULTI, discountGroup: MEMBER_GROUP },
    );
    expect(r.total).toBe(4500);
  });
});
