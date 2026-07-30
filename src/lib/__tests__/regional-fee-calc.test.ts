import { describe, it, expect } from 'vitest';
import {
  buildRegionalFeeScaleRows,
  computeRegionalOrderFees,
  regionalClassFlatFee,
  DEFAULT_REGIONAL_FEE_TIERS,
  type RegionalFeeContext,
} from '@/lib/regional-fee-calc';

/** BRG default schedule: 1st £20, 2nd £20, 3rd £16, 4th+ £0 (member £17/£17/£11/£0). */
const base: RegionalFeeContext = {
  tiers: DEFAULT_REGIONAL_FEE_TIERS,
  isMember: false,
  firstTimeExhibitor: false,
  juniorHandlerFeePence: 0,
};

const dogs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ key: `d${i}`, kind: 'standard' as const }));

describe('computeRegionalOrderFees — tiered per-dog scale', () => {
  it('charges one dog the first-tier standard rate', () => {
    const r = computeRegionalOrderFees(dogs(1), base);
    expect(r.entriesTotal).toBe(2000);
    expect(r.payingDogCount).toBe(1);
  });

  it("matches Mandy's example: 3 member dogs = £17 + £17 + £11 = £45", () => {
    const r = computeRegionalOrderFees(dogs(3), { ...base, isMember: true });
    expect(r.entriesTotal).toBe(4500);
    expect(r.perEntry.map((e) => e.fee)).toEqual([1700, 1700, 1100]);
  });

  it('charges 3 non-member dogs £20 + £20 + £16 = £56', () => {
    const r = computeRegionalOrderFees(dogs(3), base);
    expect(r.entriesTotal).toBe(5600);
    expect(r.perEntry.map((e) => e.fee)).toEqual([2000, 2000, 1600]);
  });

  it('makes the 4th dog free', () => {
    const r = computeRegionalOrderFees(dogs(4), base);
    expect(r.entriesTotal).toBe(5600); // 20 + 20 + 16 + 0
    expect(r.perEntry[3]!.fee).toBe(0);
  });

  it('applies the last tier to the 5th dog and beyond', () => {
    const r = computeRegionalOrderFees(dogs(6), base);
    // 20 + 20 + 16 + 0 + 0 + 0
    expect(r.entriesTotal).toBe(5600);
    expect(r.perEntry.map((e) => e.fee)).toEqual([2000, 2000, 1600, 0, 0, 0]);
    expect(r.payingDogCount).toBe(6);
  });

  it('tracks the 1-based dog position on each standard entry', () => {
    const r = computeRegionalOrderFees(dogs(3), base);
    expect(r.perEntry.map((e) => e.position)).toEqual([1, 2, 3]);
  });

  it('exposes a single-class perClassFees array per dog', () => {
    const r = computeRegionalOrderFees(dogs(2), base);
    expect(r.perEntry.map((e) => e.perClassFees)).toEqual([[2000], [2000]]);
  });
});

describe('computeRegionalOrderFees — member column', () => {
  it('uses the member rate for a single member dog', () => {
    expect(computeRegionalOrderFees(dogs(1), { ...base, isMember: true }).entriesTotal).toBe(1700);
  });
  it('uses the standard rate when not a member', () => {
    expect(computeRegionalOrderFees(dogs(1), base).entriesTotal).toBe(2000);
  });
});

describe('computeRegionalOrderFees — first-time exhibitor', () => {
  it('frees only the FIRST dog; the rest pay their normal tier position', () => {
    // Mandy 2026-07-05: "one entry free" — 1st free, then 2nd £20, 3rd £16.
    const r = computeRegionalOrderFees(dogs(3), { ...base, firstTimeExhibitor: true });
    expect(r.perEntry.map((e) => e.fee)).toEqual([0, 2000, 1600]);
    expect(r.entriesTotal).toBe(3600);
  });

  it('a first-timer with a single dog pays nothing', () => {
    expect(computeRegionalOrderFees(dogs(1), { ...base, firstTimeExhibitor: true }).entriesTotal).toBe(0);
  });

  it('honours a configurable first-time first-dog rate over the tier price', () => {
    const r = computeRegionalOrderFees(dogs(2), {
      ...base,
      firstTimeExhibitor: true,
      firstTimeFeePence: 500,
    });
    // 1st dog £5 (first-time rate), 2nd dog normal £20 tier.
    expect(r.perEntry.map((e) => e.fee)).toEqual([500, 2000]);
    expect(r.entriesTotal).toBe(2500);
  });
});

describe('computeRegionalOrderFees — Junior Handler', () => {
  it('charges the JH flat fee and does not consume a dog position', () => {
    const entries = [
      { key: 'd0', kind: 'standard' as const },
      { key: 'jh', kind: 'junior_handler' as const },
      { key: 'd1', kind: 'standard' as const },
    ];
    const r = computeRegionalOrderFees(entries, { ...base, juniorHandlerFeePence: 0 });
    // Two standard dogs occupy positions 1 and 2 (JH does not shift them).
    expect(r.perEntry.map((e) => e.position)).toEqual([1, 0, 2]);
    expect(r.entriesTotal).toBe(4000); // £20 + £0 + £20
    expect(r.payingDogCount).toBe(2);
  });

  it('honours a non-zero JH fee', () => {
    const r = computeRegionalOrderFees(
      [{ key: 'jh', kind: 'junior_handler' as const }],
      { ...base, juniorHandlerFeePence: 300 },
    );
    expect(r.entriesTotal).toBe(300);
    expect(r.perEntry[0]!.position).toBe(0);
  });
});

describe('computeRegionalOrderFees — flat-priced special classes (Baby Puppy)', () => {
  // Mandy 2026-07-10 (North East Regional): Baby Puppy is priced flat (£10)
  // and is EXCLUDED from the per-dog discount scale — it neither consumes a
  // position nor benefits from cheaper later-dog tiers.
  const std = (key: string) => ({ key, kind: 'standard' as const });
  const bp = (key: string, fee = 1000) => ({ key, kind: 'standard' as const, flatFeePence: fee });

  it('charges the flat fee and does not consume a dog position', () => {
    // Two adults + a baby puppy = £20 + £10 + £20; adults keep positions 1 & 2.
    const r = computeRegionalOrderFees([std('d0'), bp('bp'), std('d1')], base);
    expect(r.perEntry.map((e) => e.fee)).toEqual([2000, 1000, 2000]);
    expect(r.perEntry.map((e) => e.position)).toEqual([1, 0, 2]);
    expect(r.entriesTotal).toBe(5000);
    expect(r.payingDogCount).toBe(2);
  });

  it('a third ADULT dog still reaches the £16 tier past a baby puppy', () => {
    const r = computeRegionalOrderFees([std('d0'), std('d1'), bp('bp'), std('d2')], base);
    expect(r.perEntry.map((e) => e.fee)).toEqual([2000, 2000, 1000, 1600]);
    expect(r.entriesTotal).toBe(6600);
  });

  it('members pay the same flat fee for a baby puppy', () => {
    const r = computeRegionalOrderFees([bp('bp')], { ...base, isMember: true });
    expect(r.entriesTotal).toBe(1000);
  });

  it('first-time exhibitor frees the first STANDARD dog, not the baby puppy', () => {
    const r = computeRegionalOrderFees([bp('bp'), std('d0')], {
      ...base,
      firstTimeExhibitor: true,
    });
    expect(r.perEntry.map((e) => e.fee)).toEqual([1000, 0]);
    expect(r.entriesTotal).toBe(1000);
  });

  it('honours a flat fee of zero', () => {
    expect(computeRegionalOrderFees([bp('bp', 0)], base).entriesTotal).toBe(0);
  });

  it('exposes the flat fee as the single per-class fee', () => {
    const r = computeRegionalOrderFees([bp('bp')], base);
    expect(r.perEntry[0]!.perClassFees).toEqual([1000]);
  });
});

describe('buildRegionalFeeScaleRows — display collapsing', () => {
  it('collapses the BRG default into 1st–2nd / 3rd / 4th+ rows', () => {
    expect(buildRegionalFeeScaleRows(DEFAULT_REGIONAL_FEE_TIERS)).toEqual([
      { label: '1st–2nd dog', standardPence: 2000, memberPence: 1700 },
      { label: '3rd dog', standardPence: 1600, memberPence: 1100 },
      { label: '4th dog+', standardPence: 0, memberPence: 0 },
    ]);
  });

  it('collapses an all-identical schedule into a single row spanning every dog', () => {
    const rows = buildRegionalFeeScaleRows([
      { standardPence: 1000, memberPence: 1000 },
      { standardPence: 1000, memberPence: 1000 },
    ]);
    expect(rows).toEqual([{ label: '1st–2nd dog+', standardPence: 1000, memberPence: 1000 }]);
  });

  it('returns no rows for an empty schedule', () => {
    expect(buildRegionalFeeScaleRows([])).toEqual([]);
  });
});

describe('regionalClassFlatFee — special-class detection', () => {
  const tiers = DEFAULT_REGIONAL_FEE_TIERS; // 1st dog £20 standard

  it('returns the fee for a Baby Puppy class priced away from the first-dog tier', () => {
    expect(
      regionalClassFlatFee({ className: 'Baby Puppy', classType: 'sv_age', entryFee: 1000 }, tiers),
    ).toBe(1000);
  });

  it('returns null for a Baby Puppy class left at the first-dog tier price', () => {
    // No deliberate re-pricing → the dog prices on the normal scale.
    expect(
      regionalClassFlatFee({ className: 'Baby Puppy', classType: 'sv_age', entryFee: 2000 }, tiers),
    ).toBeNull();
  });

  it('returns null for non-Baby-Puppy classes even when re-priced', () => {
    expect(
      regionalClassFlatFee({ className: 'Adult', classType: 'sv_age', entryFee: 1000 }, tiers),
    ).toBeNull();
  });

  it('returns null for Junior Handler classes (they have their own flat fee)', () => {
    expect(
      regionalClassFlatFee(
        { className: 'Junior Handler (6-11)', classType: 'junior_handler', entryFee: 200 },
        tiers,
      ),
    ).toBeNull();
  });

  it('returns null when the show has no tier schedule to compare against', () => {
    expect(
      regionalClassFlatFee({ className: 'Baby Puppy', classType: 'sv_age', entryFee: 1000 }, []),
    ).toBeNull();
  });

  it('matches the class name case-insensitively', () => {
    expect(
      regionalClassFlatFee({ className: 'baby puppy', classType: 'sv_age', entryFee: 1000 }, tiers),
    ).toBe(1000);
  });
});

describe('computeRegionalOrderFees — edge cases', () => {
  it('prices every dog at £0 when the tier schedule is empty', () => {
    expect(computeRegionalOrderFees(dogs(3), { ...base, tiers: [] }).entriesTotal).toBe(0);
  });

  it('returns a zero total for an empty order', () => {
    const r = computeRegionalOrderFees([], base);
    expect(r.entriesTotal).toBe(0);
    expect(r.payingDogCount).toBe(0);
    expect(r.perEntry).toEqual([]);
  });

  it('first-time exhibitor takes precedence over the member column', () => {
    const r = computeRegionalOrderFees(dogs(1), {
      ...base,
      isMember: true,
      firstTimeExhibitor: true,
    });
    expect(r.entriesTotal).toBe(0);
  });
});
