import { describe, it, expect } from 'vitest';
import { orderedClasses, AWARD_ORDER } from '../catalogue-marked';

// Mandy 2026-07-06 (BAGSD marked catalogue): a sex-neutral Veteran = class 1
// was rendering AFTER the male classes because classes were bucketed by sex.
// It must lead, in catalogue (class-number) order, with JH last.
describe('marked catalogue — class order', () => {
  const bucket = (classNumber: number | null, sex: string | null, className: string, classLabel?: string) => ({
    className, classNumber, classLabel: classLabel ?? (classNumber != null ? String(classNumber) : ''),
    sortOrder: classNumber ?? 18, sex, showClassId: undefined, entries: [{}],
  });

  it('orders sex-neutral Veteran (1) first and JH (unnumbered) last', () => {
    // Deliberately built with the sex-neutral classes lumped in `unknown`,
    // the exact shape that used to push Veteran after the dogs.
    const breedBucket = {
      sexes: {
        dog: [bucket(2, 'dog', 'Minor Puppy'), bucket(10, 'dog', 'Open')],
        unknown: [bucket(1, null, 'Veteran'), bucket(null, null, 'JHA Handling', 'JHA')],
        bitch: [bucket(11, 'bitch', 'Minor Puppy')],
      },
    } as never;

    const labels = orderedClasses(breedBucket).map((c) => c.classLabel);
    expect(labels).toEqual(['1', '2', '10', '11', 'JHA']);
  });
});

// Mandy 2026-07-06: the Awards Summary was in no order. Canonical sequence:
// Best in Show → Best Puppy in Show → Best Long Coat in Show, then the sex
// awards Dog CC → Dog Reserve CC → Best Puppy Dog → Bitch CC → Bitch Reserve
// CC → Best Puppy Bitch, then Best Veteran in Show last.
describe('marked catalogue — award order', () => {
  it('ranks awards in the order Mandy specified', () => {
    const scrambled = [
      'best_puppy_bitch', 'best_dog', 'best_in_show', 'best_veteran_in_show',
      'reserve_best_dog', 'best_bitch', 'best_long_coat_in_show', 'best_puppy_dog',
      'best_puppy_in_show', 'reserve_best_bitch',
    ];
    const sorted = [...scrambled].sort((a, b) => (AWARD_ORDER[a] ?? 999) - (AWARD_ORDER[b] ?? 999));
    expect(sorted).toEqual([
      'best_in_show', 'best_puppy_in_show', 'best_long_coat_in_show',
      'best_dog', 'reserve_best_dog', 'best_puppy_dog',
      'best_bitch', 'reserve_best_bitch', 'best_puppy_bitch',
      'best_veteran_in_show',
    ]);
  });
});
