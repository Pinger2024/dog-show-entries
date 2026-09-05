import { describe, it, expect } from 'vitest';
import { isParkingSundry } from '@/lib/parking-utils';

describe('isParkingSundry', () => {
  it('matches "Pre-paid Parking Pass"', () => {
    expect(isParkingSundry('Pre-paid Parking Pass')).toBe(true);
  });

  it('matches plain "Parking"', () => {
    expect(isParkingSundry('Parking')).toBe(true);
  });

  it('matches "Car Pass"', () => {
    expect(isParkingSundry('Car Pass')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isParkingSundry('CAR PASS')).toBe(true);
    expect(isParkingSundry('parking')).toBe(true);
  });

  it('does NOT match "Sparking Wine" (substring, not a whole word)', () => {
    expect(isParkingSundry('Sparking Wine')).toBe(false);
  });

  it('does NOT match unrelated sundry names', () => {
    expect(isParkingSundry('Printed Catalogue')).toBe(false);
    expect(isParkingSundry('Club Membership — Sole')).toBe(false);
    expect(isParkingSundry('Donation')).toBe(false);
  });
});
