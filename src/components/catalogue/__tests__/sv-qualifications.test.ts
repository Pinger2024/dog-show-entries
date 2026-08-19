import { describe, it, expect } from 'vitest';
import { formatSvQualifications } from '../catalogue-utils';

/**
 * Transcribed from Mandy's own working-class catalogue page, Class 11a
 * "Working Bitch Stock Coat" (sent 2026-08-19). These are the real printed
 * strings — the format is theirs, not ours.
 */
describe('formatSvQualifications', () => {
  it('renders the full string: working title, Körung, then the marks', () => {
    expect(
      formatSvQualifications({
        workingTitle: 'IGP1',
        koerung: 'current_year',
        wb: true,
        bh: true,
        ad: true,
      }),
    ).toBe('IGP1 Current Year Kkl WB, BH, AD');
  });

  it('renders a lifetime Körung without a WB', () => {
    expect(
      formatSvQualifications({
        workingTitle: 'IGP2',
        koerung: 'lebenzeit',
        bh: true,
        ad: true,
      }),
    ).toBe('IGP2 KKL Lebenzeit BH, AD');
  });

  it('renders a dog holding no other qualifications', () => {
    expect(
      formatSvQualifications({ workingTitle: 'IGP1', koerung: 'current_year' }),
    ).toBe('IGP1 Current Year Kkl');
  });

  it('appends the free-text Other after the three marks', () => {
    expect(
      formatSvQualifications({
        workingTitle: 'IGP1',
        koerung: 'lebenzeit',
        wb: true,
        bh: true,
        ad: true,
        otherQualifications: 'BRG GM',
      }),
    ).toBe('IGP1 KKL Lebenzeit WB, BH, AD, BRG GM');
  });

  it('omits a Körung of none', () => {
    expect(formatSvQualifications({ workingTitle: 'IGP3', koerung: 'none' })).toBe('IGP3');
  });

  it('renders marks alone for a dog with no working title', () => {
    // An Adult-class dog can hold BH and AD without a working title — that is
    // exactly the dog the routing guard keeps out of the Working class.
    expect(formatSvQualifications({ bh: true, ad: true })).toBe('BH, AD');
  });

  it('returns an empty string when there is nothing to print', () => {
    expect(formatSvQualifications({})).toBe('');
    expect(formatSvQualifications(null)).toBe('');
    expect(formatSvQualifications(undefined)).toBe('');
  });

  it('never prints DNA, which no SV or WUSV catalogue shows', () => {
    const printed = formatSvQualifications({
      workingTitle: 'IGP1',
      koerung: 'current_year',
      wb: true,
      // @ts-expect-error — proving a stray dna value can't leak into the line
      dna: 'proven',
    });
    expect(printed).toBe('IGP1 Current Year Kkl WB');
    expect(printed).not.toMatch(/dna|proven|recorded/i);
  });
});
