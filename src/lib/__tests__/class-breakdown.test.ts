import { describe, it, expect } from 'vitest';
import {
  computeClassBreakdown,
  type EntryForBreakdown,
} from '../class-breakdown';

const makeEntry = (
  status: EntryForBreakdown['status'],
  classes: Array<{
    name: string;
    sex: 'dog' | 'bitch' | null;
    type: string | null;
    fee: number;
    sortOrder?: number;
  }>
): EntryForBreakdown => ({
  status,
  entryClasses: classes.map((c) => ({
    fee: c.fee,
    showClass: {
      sex: c.sex,
      sortOrder: c.sortOrder ?? null,
      classDefinition: { name: c.name, type: c.type },
    },
  })),
});

// NFC ("Not For Competition") entries carry no judged class — just the
// entry-level fee and the isNfc flag.
const makeNfc = (totalFee: number, status: EntryForBreakdown['status'] = 'confirmed'): EntryForBreakdown => ({
  status,
  isNfc: true,
  totalFee,
  entryClasses: [],
});

describe('computeClassBreakdown', () => {
  it('returns all-zero totals on empty input', () => {
    const r = computeClassBreakdown([]);
    expect(r.combinedTotals).toEqual({ entries: 0, revenue: 0 });
    expect(r.dogs).toEqual([]);
    expect(r.bitches).toEqual([]);
    expect(r.juniorHandlers).toEqual([]);
    expect(r.mixedClasses).toEqual([]);
  });

  it('handles null/undefined input', () => {
    expect(computeClassBreakdown(null).combinedTotals.entries).toBe(0);
    expect(computeClassBreakdown(undefined).combinedTotals.entries).toBe(0);
  });

  it('buckets sex=dog entries into Dogs', () => {
    const r = computeClassBreakdown([
      makeEntry('confirmed', [{ name: 'Yearling', sex: 'dog', type: 'age', fee: 1800 }]),
    ]);
    expect(r.dogs).toEqual([{ name: 'Yearling', entries: 1, revenue: 1800 }]);
    expect(r.bitches).toEqual([]);
    expect(r.juniorHandlers).toEqual([]);
    expect(r.mixedClasses).toEqual([]);
  });

  it('buckets sex=bitch entries into Bitches', () => {
    const r = computeClassBreakdown([
      makeEntry('confirmed', [{ name: 'Limit', sex: 'bitch', type: 'age', fee: 1800 }]),
    ]);
    expect(r.bitches).toEqual([{ name: 'Limit', entries: 1, revenue: 1800 }]);
  });

  it('buckets junior_handler classes into Junior Handlers (regardless of sex)', () => {
    const r = computeClassBreakdown([
      makeEntry('confirmed', [
        { name: 'JHA Handling (12-16)', sex: null, type: 'junior_handler', fee: 0 },
      ]),
    ]);
    expect(r.juniorHandlers).toEqual([
      { name: 'JHA Handling (12-16)', entries: 1, revenue: 0 },
    ]);
    expect(r.mixedClasses).toEqual([]);
  });

  // Regression: the BAGSD "19 Class Single Breed Championship Show" hit
  // exactly this case — a single Veteran entry (sex=null, type='age')
  // appeared in the grand total but disappeared from the per-sex subtotals,
  // making 9 + 0 + 0 + 1 (JH) display as "Total 10 / subtotals 9".
  it('buckets sex=null non-JH classes into Mixed Classes (Veteran/Brace/Stakes)', () => {
    const r = computeClassBreakdown([
      makeEntry('confirmed', [
        { name: 'Veteran', sex: null, type: 'age', fee: 1800 },
      ]),
    ]);
    expect(r.mixedClasses).toEqual([{ name: 'Veteran', entries: 1, revenue: 1800 }]);
    expect(r.dogs).toEqual([]);
    expect(r.bitches).toEqual([]);
    expect(r.juniorHandlers).toEqual([]);
    // Crucially: the combined total includes it, AND the mixedClasses bucket
    // accounts for it — invariant holds.
    expect(r.combinedTotals).toEqual({ entries: 1, revenue: 1800 });
  });

  it('excludes cancelled and withdrawn entries from every bucket', () => {
    const r = computeClassBreakdown([
      makeEntry('cancelled', [{ name: 'Limit', sex: 'bitch', type: 'age', fee: 1800 }]),
      makeEntry('withdrawn', [{ name: 'Junior', sex: 'bitch', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Limit', sex: 'bitch', type: 'age', fee: 1800 }]),
    ]);
    expect(r.bitches).toEqual([{ name: 'Limit', entries: 1, revenue: 1800 }]);
    expect(r.combinedTotals).toEqual({ entries: 1, revenue: 1800 });
  });

  it('combines multiple entries in the same class', () => {
    const r = computeClassBreakdown([
      makeEntry('confirmed', [{ name: 'Yearling', sex: 'dog', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Yearling', sex: 'dog', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Yearling', sex: 'dog', type: 'age', fee: 1800 }]),
    ]);
    expect(r.dogs).toEqual([{ name: 'Yearling', entries: 3, revenue: 5400 }]);
  });

  it('handles an entry in multiple classes (each entry-class counted once)', () => {
    const r = computeClassBreakdown([
      makeEntry('confirmed', [
        { name: 'Yearling', sex: 'dog', type: 'age', fee: 1800 },
        { name: 'Veteran', sex: null, type: 'age', fee: 1800 },
      ]),
    ]);
    expect(r.dogs).toEqual([{ name: 'Yearling', entries: 1, revenue: 1800 }]);
    expect(r.mixedClasses).toEqual([{ name: 'Veteran', entries: 1, revenue: 1800 }]);
    expect(r.combinedTotals).toEqual({ entries: 2, revenue: 3600 });
  });

  it('reproduces the BAGSD scenario end-to-end (3 dogs + 5 bitches + 1 JH + 1 Veteran)', () => {
    // 9 standard entries (3 in dog classes, 5 in bitch classes, 1 of those
    // also in Veteran) + 1 JH-only entry. £18 entry fee per class except JH.
    const r = computeClassBreakdown([
      // Dogs — 3 entries each in a single dog class
      makeEntry('confirmed', [{ name: 'Minor Puppy', sex: 'dog', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Yearling', sex: 'dog', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Special Long Coat Open', sex: 'dog', type: 'special', fee: 1800 }]),
      // Bitches — 5 entries; one is also in Veteran (mixed-sex)
      makeEntry('confirmed', [{ name: 'Junior', sex: 'bitch', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Puppy', sex: 'bitch', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Minor Puppy', sex: 'bitch', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Yearling', sex: 'bitch', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [
        { name: 'Limit', sex: 'bitch', type: 'age', fee: 1800 },
        { name: 'Veteran', sex: null, type: 'age', fee: 1800 },
      ]),
      // JH-only entry
      makeEntry('confirmed', [
        { name: 'JHA Handling (12-16)', sex: null, type: 'junior_handler', fee: 0 },
      ]),
    ]);

    expect(r.dogTotals).toEqual({ entries: 3, revenue: 5400 });
    expect(r.bitchTotals).toEqual({ entries: 5, revenue: 9000 });
    expect(r.juniorHandlerTotals).toEqual({ entries: 1, revenue: 0 });
    expect(r.mixedClassesTotals).toEqual({ entries: 1, revenue: 1800 });
    expect(r.combinedTotals).toEqual({ entries: 10, revenue: 16200 });
  });

  it('invariant: subtotals always sum to combined total', () => {
    // Mixed scenario covering every bucket, including NFC
    const r = computeClassBreakdown([
      makeEntry('confirmed', [{ name: 'Open', sex: 'dog', type: 'age', fee: 2000 }]),
      makeEntry('confirmed', [{ name: 'Open', sex: 'bitch', type: 'age', fee: 2000 }]),
      makeEntry('confirmed', [{ name: 'Brace', sex: null, type: 'special', fee: 1500 }]),
      makeEntry('confirmed', [{ name: 'Stakes', sex: null, type: 'special', fee: 2500 }]),
      makeEntry('confirmed', [
        { name: 'JHB Handling (6-11)', sex: null, type: 'junior_handler', fee: 0 },
      ]),
      makeNfc(0),
      makeEntry('cancelled', [{ name: 'Open', sex: 'dog', type: 'age', fee: 2000 }]),
    ]);

    const subtotalEntries =
      r.dogTotals.entries +
      r.bitchTotals.entries +
      r.juniorHandlerTotals.entries +
      r.mixedClassesTotals.entries +
      r.notForCompetitionTotals.entries;
    const subtotalRevenue =
      r.dogTotals.revenue +
      r.bitchTotals.revenue +
      r.juniorHandlerTotals.revenue +
      r.mixedClassesTotals.revenue +
      r.notForCompetitionTotals.revenue;

    expect(subtotalEntries).toBe(r.combinedTotals.entries);
    expect(subtotalRevenue).toBe(r.combinedTotals.revenue);
  });

  it('falls back to entry count (descending) when no class order is set', () => {
    const r = computeClassBreakdown([
      makeEntry('confirmed', [{ name: 'Limit', sex: 'bitch', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Open', sex: 'bitch', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Open', sex: 'bitch', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Open', sex: 'bitch', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Junior', sex: 'bitch', type: 'age', fee: 1800 }]),
      makeEntry('confirmed', [{ name: 'Junior', sex: 'bitch', type: 'age', fee: 1800 }]),
    ]);
    expect(r.bitches.map((c) => c.name)).toEqual(['Open', 'Junior', 'Limit']);
  });

  // Amanda 2026-05-28: the financial breakdown should read in class order
  // (matching the show's class numbering), not by entry count.
  it('sorts each bucket by class order (sortOrder) when set, regardless of entry count', () => {
    const r = computeClassBreakdown([
      // Open (sortOrder 9) has the MOST entries but should appear LAST
      makeEntry('confirmed', [{ name: 'Open', sex: 'dog', type: 'age', fee: 1800, sortOrder: 9 }]),
      makeEntry('confirmed', [{ name: 'Open', sex: 'dog', type: 'age', fee: 1800, sortOrder: 9 }]),
      makeEntry('confirmed', [{ name: 'Open', sex: 'dog', type: 'age', fee: 1800, sortOrder: 9 }]),
      // Minor Puppy (sortOrder 1) has the FEWEST but should appear FIRST
      makeEntry('confirmed', [{ name: 'Minor Puppy', sex: 'dog', type: 'age', fee: 1800, sortOrder: 1 }]),
      makeEntry('confirmed', [{ name: 'Junior', sex: 'dog', type: 'age', fee: 1800, sortOrder: 5 }]),
      makeEntry('confirmed', [{ name: 'Junior', sex: 'dog', type: 'age', fee: 1800, sortOrder: 5 }]),
    ]);
    expect(r.dogs.map((c) => c.name)).toEqual(['Minor Puppy', 'Junior', 'Open']);
  });

  it('falls back to "Unknown" when class definition name is missing', () => {
    const r = computeClassBreakdown([
      {
        status: 'confirmed',
        entryClasses: [
          { fee: 1800, showClass: { sex: 'dog', classDefinition: null } },
        ],
      },
    ]);
    expect(r.dogs).toEqual([{ name: 'Unknown', entries: 1, revenue: 1800 }]);
  });

  it('counts pending entries (paid-orders-only filter is applied upstream)', () => {
    // The financial page only ever feeds in entries from paid orders, so
    // 'pending' here means "paid but never marked confirmed yet" rather
    // than "abandoned checkout". Either way the helper shouldn't drop them.
    const r = computeClassBreakdown([
      makeEntry('pending', [{ name: 'Yearling', sex: 'dog', type: 'age', fee: 1800 }]),
    ]);
    expect(r.dogs).toEqual([{ name: 'Yearling', entries: 1, revenue: 1800 }]);
  });

  // NFC entries are in the catalogue but in no judged class. Before this, they
  // carried no entryClasses so they vanished from the breakdown — the per-class
  // total read short of the catalogue count (Mandy, BAGSD 2026-06-17: 73 in the
  // catalogue but "70" on Entries by Class — the 2 missing were NFC).
  describe('Not For Competition bucket', () => {
    it('counts an NFC entry in its own bucket and the grand total, not in a sex bucket', () => {
      const r = computeClassBreakdown([makeNfc(0)]);
      expect(r.notForCompetition).toEqual([{ name: 'Not For Competition', entries: 1, revenue: 0 }]);
      expect(r.notForCompetitionTotals).toEqual({ entries: 1, revenue: 0 });
      expect(r.dogs).toEqual([]);
      expect(r.bitches).toEqual([]);
      expect(r.juniorHandlers).toEqual([]);
      expect(r.mixedClasses).toEqual([]);
      // Crucially the grand total includes it, so it ties to the catalogue.
      expect(r.combinedTotals.entries).toBe(1);
    });

    it('aggregates multiple NFC entries into one line and sums their fees', () => {
      const r = computeClassBreakdown([makeNfc(0), makeNfc(500), makeNfc(0)]);
      expect(r.notForCompetition).toEqual([{ name: 'Not For Competition', entries: 3, revenue: 500 }]);
    });

    it('reconciles to the catalogue: competing classes + NFC = grand total', () => {
      // 3 competing entries (2 bitches + 1 dog) + 2 NFC = catalogue of 5.
      const r = computeClassBreakdown([
        makeEntry('confirmed', [{ name: 'Minor Puppy', sex: 'bitch', type: 'age', fee: 1800 }]),
        makeEntry('confirmed', [{ name: 'Limit', sex: 'bitch', type: 'age', fee: 1800 }]),
        makeEntry('confirmed', [{ name: 'Open', sex: 'dog', type: 'age', fee: 1800 }]),
        makeNfc(0),
        makeNfc(0),
      ]);
      expect(r.dogTotals.entries).toBe(1);
      expect(r.bitchTotals.entries).toBe(2);
      expect(r.notForCompetitionTotals.entries).toBe(2);
      expect(r.combinedTotals.entries).toBe(5); // ties to the catalogue count
    });

    it('an isNfc entry never lands in a class bucket even if classes are present', () => {
      // Defensive: isNfc takes precedence; any stray entryClasses are ignored
      // so an NFC dog can't double-count into a sex bucket.
      const r = computeClassBreakdown([
        { status: 'confirmed', isNfc: true, totalFee: 0,
          entryClasses: [{ fee: 1800, showClass: { sex: 'dog', classDefinition: { name: 'Open', type: 'age' } } }] },
      ]);
      expect(r.dogs).toEqual([]);
      expect(r.notForCompetitionTotals.entries).toBe(1);
      expect(r.combinedTotals.entries).toBe(1);
    });

    it('excludes cancelled/withdrawn NFC entries', () => {
      const r = computeClassBreakdown([makeNfc(0, 'cancelled'), makeNfc(0, 'withdrawn'), makeNfc(0)]);
      expect(r.notForCompetitionTotals.entries).toBe(1);
    });
  });
});
