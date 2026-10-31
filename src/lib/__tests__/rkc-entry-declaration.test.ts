/**
 * The entry declaration — the exhibitor's load-bearing consent — and the RKC's
 * 2027 amendment to it (F(1)8.h, effective for shows from 1 January 2027).
 *
 * The cut-over is keyed off the SHOW's first day, not today's date: a show on
 * 10 January 2027 has its schedule printed in December 2026 and must already
 * carry the new clause, while a December 2026 show must not.
 *
 * The one-owner guard lives in
 * src/__tests__/integration/rkc-entry-declaration-one-owner.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  entryDeclaration,
  rkcEntryDeclaration,
  GSDL_BRG_ENTRY_DECLARATION,
} from '@/lib/rkc-entry-declaration';

const CLAUSE_2027 = 'and to comply with the requirements of the schedule,';

describe('rkcEntryDeclaration', () => {
  it('2026 carries no schedule-compliance clause', () => {
    expect(rkcEntryDeclaration(2026)).not.toContain(CLAUSE_2027);
    expect(rkcEntryDeclaration(2026)).toContain(
      'abide by the Regulations of this Show and not to bring to the Show any dog',
    );
  });

  it('2027 inserts the clause verbatim, in the specimen\'s position', () => {
    expect(rkcEntryDeclaration(2027)).toContain(
      'abide by the Regulations of this Show and to comply with the requirements of the schedule, and not to bring to the Show any dog',
    );
  });

  it('changes nothing else — the clause is the only difference', () => {
    expect(rkcEntryDeclaration(2027).replace(CLAUSE_2027 + ' ', '')).toBe(
      rkcEntryDeclaration(2026),
    );
  });

  it('keeps the rest of the RKC wording both years', () => {
    for (const year of [2026, 2027] as const) {
      const text = rkcEntryDeclaration(year);
      expect(text).toContain('I/We agree to submit to and be bound by Royal Kennel Club Limited');
      expect(text).toContain('Preparation of Dogs for Exhibition F (Annex B)');
      expect(text).toContain('I/we understand the eligibility of the classes entered.');
    }
  });
});

describe('entryDeclaration — which edition a show gets', () => {
  it('a show on the last day of 2026 keeps the 2026 wording', () => {
    expect(entryDeclaration({ startDate: '2026-12-31' })).toBe(rkcEntryDeclaration(2026));
  });

  it('a show on the first day of 2027 gets the new clause', () => {
    expect(entryDeclaration({ startDate: '2027-01-01' })).toBe(rkcEntryDeclaration(2027));
  });

  it('accepts a Date as well as a date string', () => {
    expect(entryDeclaration({ startDate: new Date(2027, 5, 1) })).toBe(rkcEntryDeclaration(2027));
    expect(entryDeclaration({ startDate: new Date(2026, 5, 1) })).toBe(rkcEntryDeclaration(2026));
  });

  it('regional (SV/WUSV) events are not RKC-licensed, so the F regs never apply', () => {
    expect(entryDeclaration({ isRegional: true, startDate: '2027-06-01' })).toBe(
      GSDL_BRG_ENTRY_DECLARATION,
    );
    expect(entryDeclaration({ isRegional: true, startDate: '2026-06-01' })).toBe(
      GSDL_BRG_ENTRY_DECLARATION,
    );
    expect(GSDL_BRG_ENTRY_DECLARATION).not.toContain(CLAUSE_2027);
  });
});
