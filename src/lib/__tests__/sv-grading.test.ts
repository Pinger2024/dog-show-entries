import { describe, it, expect } from 'vitest';
import { allowedSvGradesForClass, formatSvRating } from '../sv-grading';

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
