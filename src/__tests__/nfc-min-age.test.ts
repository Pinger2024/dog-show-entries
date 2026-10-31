import { describe, it, expect } from 'vitest';
import { NFC_MIN_AGE_WEEKS, isOldEnoughForNfc, nfcMinAgeMessage } from '@/lib/date-utils';

describe('isOldEnoughForNfc', () => {
  it('the minimum is 12 weeks', () => {
    expect(NFC_MIN_AGE_WEEKS).toBe(12);
  });

  it('is false one day short of 12 weeks', () => {
    const dob = new Date('2026-01-01');
    const showDate = new Date('2026-03-25'); // 83 days = 11 weeks + 6 days
    expect(isOldEnoughForNfc(dob, showDate)).toBe(false);
  });

  it('is true at exactly 12 weeks (84 days)', () => {
    const dob = new Date('2026-01-01');
    const showDate = new Date('2026-03-26'); // 84 days = exactly 12 weeks
    expect(isOldEnoughForNfc(dob, showDate)).toBe(true);
  });

  it('is true comfortably past 12 weeks', () => {
    const dob = new Date('2026-01-01');
    const showDate = new Date('2026-06-01');
    expect(isOldEnoughForNfc(dob, showDate)).toBe(true);
  });

  it('accepts YYYY-MM-DD strings the same as Date objects', () => {
    expect(isOldEnoughForNfc('2026-01-01', '2026-03-26')).toBe(true);
    expect(isOldEnoughForNfc('2026-01-01', '2026-03-25')).toBe(false);
  });
});

describe('nfcMinAgeMessage', () => {
  it('names the dog, the age and the 12-week minimum', () => {
    expect(nfcMinAgeMessage('Fido', 8)).toBe(
      'Fido will only be 8 weeks old on show day. Dogs must be at least 12 weeks old for NFC entries.',
    );
  });
});
