import { describe, it, expect } from 'vitest';
import {
  allowedSvGradesForClass,
  formatSvRating,
  computeSvClassRatings,
  isPlacedWithoutSvGrade,
  rankWithinGrades,
  isSvDisqualified,
  takesRankedSvGrade,
  stewardStatusWrite,
  settleResultWrite,
} from '../sv-grading';

const codes = (className: string) =>
  allowedSvGradesForClass(className).map((g) => g.value);

describe('allowedSvGradesForClass (Amanda 2026-05-28)', () => {
  it('gives puppies VP / P / WV (no adult grades)', () => {
    for (const cls of ['Baby Puppy', 'SV Minor Puppy', 'SV Puppy', 'Minor Puppy', 'Puppy']) {
      expect(codes(cls), cls).toEqual(['vp', 'p', 'wv', 'disqualified']);
    }
  });

  it('gives 12m+ classes SG/G/A/M/U but NOT V', () => {
    for (const cls of ['SV Junior', 'SV Yearling', 'Adult', 'Junior', 'Yearling']) {
      expect(codes(cls), cls).toEqual(['sg', 'g', 'a', 'm', 'u', 'disqualified']);
      expect(codes(cls), cls).not.toContain('v');
    }
  });

  it('gives Working the full adult set including V', () => {
    expect(codes('Working')).toEqual(['v', 'sg', 'g', 'a', 'm', 'u', 'disqualified']);
  });
});

describe('formatSvRating', () => {
  it('combines grade + placement into the rating code', () => {
    expect(formatSvRating('v', 1)).toBe('V1');
    expect(formatSvRating('sg', 2)).toBe('SG2');
    expect(formatSvRating('vp', 1)).toBe('VP1');
  });

  it('falls back to grade alone or placement alone', () => {
    expect(formatSvRating('sg', null)).toBe('SG');
    expect(formatSvRating(null, 3)).toBe('3');
    expect(formatSvRating(null, null)).toBe('');
  });

  it('shows Disqualified in full', () => {
    expect(formatSvRating('disqualified', null)).toBe('Disqualified');
    expect(formatSvRating('disqualified', 1)).toBe('Disqualified');
  });
});

describe('computeSvClassRatings (within-grade numbering, Amanda 2026-05-28)', () => {
  it('restarts the rank for each grade: SG,SG,G,G,A placed 1..5 → SG1,SG2,G1,G2,A1', () => {
    const m = computeSvClassRatings([
      { entryClassId: 'a', svGrade: 'sg', placement: 1 },
      { entryClassId: 'b', svGrade: 'sg', placement: 2 },
      { entryClassId: 'c', svGrade: 'g', placement: 3 },
      { entryClassId: 'd', svGrade: 'g', placement: 4 },
      { entryClassId: 'e', svGrade: 'a', placement: 5 },
    ]);
    expect(m.get('a')).toBe('SG1');
    expect(m.get('b')).toBe('SG2');
    expect(m.get('c')).toBe('G1');
    expect(m.get('d')).toBe('G2');
    expect(m.get('e')).toBe('A1');
  });

  it('numbers within a grade by placing order even when grades interleave', () => {
    // Placed out of grade order — within-grade rank still follows placing.
    const m = computeSvClassRatings([
      { entryClassId: 'x', svGrade: 'g', placement: 1 },
      { entryClassId: 'y', svGrade: 'sg', placement: 2 },
      { entryClassId: 'z', svGrade: 'g', placement: 3 },
    ]);
    expect(m.get('y')).toBe('SG1');
    expect(m.get('x')).toBe('G1');
    expect(m.get('z')).toBe('G2');
  });

  it('puppy grades number within grade too (VP1, VP2, P1)', () => {
    const m = computeSvClassRatings([
      { entryClassId: 'p1', svGrade: 'vp', placement: 1 },
      { entryClassId: 'p2', svGrade: 'vp', placement: 2 },
      { entryClassId: 'p3', svGrade: 'p', placement: 3 },
    ]);
    expect(m.get('p1')).toBe('VP1');
    expect(m.get('p2')).toBe('VP2');
    expect(m.get('p3')).toBe('P1');
  });

  it('handles disqualified and ungraded-but-placed', () => {
    const m = computeSvClassRatings([
      { entryClassId: 'dq', svGrade: 'disqualified', placement: null },
      { entryClassId: 'np', svGrade: null, placement: 1 },
    ]);
    expect(m.get('dq')).toBe('Disqualified');
    expect(m.get('np')).toBe('1st');
  });

  // A regional's Junior Handling class has no SV grade. Its winner read a bare
  // "1" on the public results; the judge's approval page and the secretary's
  // results page, which read the same owner since 16 Nov 2026, said "1st".
  it('a placed dog with no grade (Junior Handling at a regional) reads its placing in words', () => {
    const m = computeSvClassRatings([
      { entryClassId: 'jh1', svGrade: null, placement: 1 },
      { entryClassId: 'jh2', svGrade: null, placement: 2 },
      { entryClassId: 'jh4', svGrade: null, placement: 4 },
    ]);
    expect([m.get('jh1'), m.get('jh2'), m.get('jh4')]).toEqual(['1st', '2nd', 'Reserve']);
  });
});

// NE Regional, 5 Sept 2026: no. 11 Dramana Anno Domini was placed 1st in his
// class and never graded. Remi printed the results with a blank grade and the
// League had to add VP by hand (Shirley, GSDL BRG, 24 Sept 2026).
describe('isPlacedWithoutSvGrade', () => {
  it('is true for a placed dog with no grade', () => {
    expect(isPlacedWithoutSvGrade({ placement: 1, svGrade: null })).toBe(true);
    expect(isPlacedWithoutSvGrade({ placement: 3, svGrade: undefined })).toBe(true);
  });

  it('is false once the dog has a grade — including Disqualified', () => {
    expect(isPlacedWithoutSvGrade({ placement: 1, svGrade: 'vp' })).toBe(false);
    expect(isPlacedWithoutSvGrade({ placement: 1, svGrade: 'disqualified' })).toBe(false);
  });

  it('is false for a dog that has not been placed', () => {
    expect(isPlacedWithoutSvGrade({ placement: null, svGrade: null })).toBe(false);
    expect(isPlacedWithoutSvGrade({ placement: undefined, svGrade: undefined })).toBe(false);
  });
});

// Mandy, 16 Nov 2026: a dog at a regional was disqualified for growling at the
// judge. The steward could only mark it Unplaced, then "Grade all as V" gave
// it a V too — and the within-grade ranking numbered it after the placed V
// dogs, so the public results would have read "V3" for a dog with no placing.
describe('a dog with no placing gets no within-grade rank (Mandy, 16 Nov 2026)', () => {
  it('V1, V2 and an unplaced V read V1, V2 and nothing — never V3', () => {
    const m = computeSvClassRatings([
      { entryClassId: 'a', svGrade: 'v', placement: 1 },
      { entryClassId: 'b', svGrade: 'v', placement: 2 },
      { entryClassId: 'unplaced', svGrade: 'v', placement: null },
    ]);
    expect(m.get('a')).toBe('V1');
    expect(m.get('b')).toBe('V2');
    expect(m.get('unplaced')).toBeUndefined();
    expect([...m.values()]).not.toContain('V3');
  });

  it('rankWithinGrades leaves an unplaced graded dog out altogether', () => {
    const ranked = rankWithinGrades([
      { id: 'a', svGrade: 'sg', placement: 1 },
      { id: 'unplaced', svGrade: 'sg', placement: null },
      { id: 'b', svGrade: 'sg', placement: 2 },
    ]);
    expect(ranked.map((r) => [r.item.id, r.grade, r.rank])).toEqual([
      ['a', 'sg', 1],
      ['b', 'sg', 2],
    ]);
  });

  it('a Disqualified dog reads "Disqualified", with or without a stray placing', () => {
    const m = computeSvClassRatings([
      { entryClassId: 'v1', svGrade: 'v', placement: 1 },
      { entryClassId: 'dq', svGrade: 'disqualified', placement: null },
      { entryClassId: 'legacy', svGrade: 'disqualified', placement: 3 },
    ]);
    expect(m.get('v1')).toBe('V1');
    expect(m.get('dq')).toBe('Disqualified');
    expect(m.get('legacy')).toBe('Disqualified');
  });
});

describe('isSvDisqualified / takesRankedSvGrade', () => {
  it('Disqualified is the svGrade, nothing else', () => {
    expect(isSvDisqualified({ svGrade: 'disqualified' })).toBe(true);
    expect(isSvDisqualified({ svGrade: 'v' })).toBe(false);
    expect(isSvDisqualified({ svGrade: null })).toBe(false);
    expect(isSvDisqualified(null)).toBe(false);
  });

  it('only a placed, not-disqualified dog takes a ranked grade', () => {
    expect(takesRankedSvGrade({ placement: 1, svGrade: null })).toBe(true);
    expect(takesRankedSvGrade({ placement: 2, svGrade: 'sg' })).toBe(true);
    expect(takesRankedSvGrade({ placement: null, svGrade: 'v' })).toBe(false);
    expect(takesRankedSvGrade({ placement: null, svGrade: null })).toBe(false);
    expect(takesRankedSvGrade({ placement: 3, svGrade: 'disqualified' })).toBe(false);
  });
});

describe('stewardStatusWrite — what the Status menu records', () => {
  it('Disqualified is no placing, unplaced, grade Disqualified', () => {
    expect(stewardStatusWrite('disqualified')).toEqual({
      placement: null,
      placementStatus: 'unplaced',
      svGrade: 'disqualified',
    });
  });

  it('Unplaced and Withheld clear any grade, so a DQ never survives them', () => {
    expect(stewardStatusWrite('unplaced')).toEqual({ placement: null, placementStatus: 'unplaced', svGrade: null });
    expect(stewardStatusWrite('withheld')).toEqual({ placement: null, placementStatus: 'withheld', svGrade: null });
  });
});

describe('settleResultWrite — a placed dog is never Disqualified', () => {
  const dq = { placementStatus: 'unplaced', svGrade: 'disqualified' };

  it('Disqualified always wins: the dog loses its placing', () => {
    // What the ladder's grade box sent for "3rd, Disqualified".
    expect(settleResultWrite({ placement: 3, placementStatus: null, svGrade: 'disqualified' }, null)).toEqual({
      placement: null,
      placementStatus: 'unplaced',
      svGrade: 'disqualified',
    });
  });

  it('placing a Disqualified dog clears the DQ', () => {
    expect(settleResultWrite({ placement: 2 }, dq)).toEqual({ placement: 2, placementStatus: null, svGrade: null });
  });

  it('Withheld on a Disqualified dog clears the DQ, even when no grade is sent', () => {
    expect(settleResultWrite({ placement: null, placementStatus: 'withheld' }, dq)).toEqual({
      placement: null,
      placementStatus: 'withheld',
      svGrade: null,
    });
  });

  it('a partial save that keeps the dog unplaced (the award dialog) keeps the DQ', () => {
    expect(settleResultWrite({ placement: null, placementStatus: 'unplaced' }, dq)).toEqual({
      placement: null,
      placementStatus: 'unplaced',
    });
  });

  it('leaves an ordinary grade change alone', () => {
    expect(settleResultWrite({ placement: 1, placementStatus: null, svGrade: 'g' }, { placementStatus: null, svGrade: 'sg' })).toEqual({
      placement: 1,
      placementStatus: null,
      svGrade: 'g',
    });
    expect(settleResultWrite({ placement: 1 }, { placementStatus: null, svGrade: 'sg' })).toEqual({
      placement: 1,
      placementStatus: null,
    });
  });
});
