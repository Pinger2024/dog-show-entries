import { describe, it, expect } from 'vitest';
import { catalogueBackMatter } from '@/lib/catalogue-back-matter';

describe('catalogueBackMatter', () => {
  it('RKC show (showRuleset "rkc"): all three back-matter pages print', () => {
    expect(catalogueBackMatter({ showRuleset: 'rkc' })).toEqual({
      awardsWriteIn: true,
      notForCompetition: true,
      exhibitorIndex: true,
    });
  });

  it('no showRuleset at all (undefined/null, the common RKC case): all three print', () => {
    expect(catalogueBackMatter({})).toEqual({
      awardsWriteIn: true,
      notForCompetition: true,
      exhibitorIndex: true,
    });
    expect(catalogueBackMatter({ showRuleset: null })).toEqual({
      awardsWriteIn: true,
      notForCompetition: true,
      exhibitorIndex: true,
    });
  });

  it('WUSV/SV regional show: awards write-in YES, NFC and exhibitor index NO (Mandy, 22 Sept 2026)', () => {
    expect(catalogueBackMatter({ showRuleset: 'wusv' })).toEqual({
      awardsWriteIn: true,
      notForCompetition: false,
      exhibitorIndex: false,
    });
  });
});
