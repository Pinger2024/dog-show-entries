import { describe, it, expect } from 'vitest';
import { allowedSvGradesForClass, formatSvRating, computeSvClassRatings } from '../sv-grading';

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
    expect(m.get('np')).toBe('1');
  });
});
