import { describe, it, expect } from 'vitest';
import { buildClassificationHeading } from '@/lib/show-classification';

describe('buildClassificationHeading', () => {
  it('renders "Classification" for a single-breed show without JH', () => {
    expect(buildClassificationHeading(1, false)).toBe('Classification');
  });

  // Regression: BAGSD show was rendering "2 Breeds" for one real breed
  // (German Shepherd Dog) plus a Junior Handling bucket. JH isn't a breed.
  it('renders "1 Breed + Junior Handling" when one breed has JH alongside', () => {
    expect(buildClassificationHeading(1, true)).toBe('1 Breed + Junior Handling');
  });

  it('renders "Junior Handling" for a JH-only show with no breeds', () => {
    expect(buildClassificationHeading(0, true)).toBe('Junior Handling');
  });

  it('pluralises correctly for 2+ breeds with no JH', () => {
    expect(buildClassificationHeading(2, false)).toBe('2 Breeds');
    expect(buildClassificationHeading(7, false)).toBe('7 Breeds');
  });

  it('appends Junior Handling to multi-breed counts', () => {
    expect(buildClassificationHeading(2, true)).toBe('2 Breeds + Junior Handling');
    expect(buildClassificationHeading(12, true)).toBe('12 Breeds + Junior Handling');
  });
});
