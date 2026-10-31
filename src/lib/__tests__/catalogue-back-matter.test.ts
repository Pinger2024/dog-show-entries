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

  it("the marked (RKC submission) copy keeps its exhibitor index on a regional — Mandy's 22 Sept answer was about the exhibitors' catalogue, not a submission document", () => {
    expect(catalogueBackMatter({ showRuleset: 'wusv' }, 'marked').exhibitorIndex).toBe(true);
    expect(catalogueBackMatter({ showRuleset: 'wusv' }, 'catalogue').exhibitorIndex).toBe(false);
    expect(catalogueBackMatter({ showRuleset: 'wusv' }).exhibitorIndex).toBe(false);
    // The awards page Mandy DID ask for applies to both.
    expect(catalogueBackMatter({ showRuleset: 'wusv' }, 'marked').awardsWriteIn).toBe(true);
  });
});
