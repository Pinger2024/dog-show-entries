import { describe, it, expect } from 'vitest';
import {
  computeRegionalOrderFees,
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
