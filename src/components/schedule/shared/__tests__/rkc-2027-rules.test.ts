/**
 * The schedule's rule wording across the 2027 F-regulation cut-over
 * (RKC Dog Shows, 26 Oct 2026 — see research/RKC-2027-CHANGES-2026-10-26.md).
 *
 * Each of these is printed text a club relies on being RKC-verbatim: insurers
 * read "held under RKC Rules & Regulations" as meaning the schedule complies,
 * so wording that silently lags the specimen is a live exposure, not a typo.
 */
import { describe, it, expect } from 'vitest';
import {
  babyPuppyRule,
  defaultBestVeteranEligibility,
  rkcObjectionEligibilityRule,
} from '@/components/schedule/shared/rkc-rules';

describe('Baby Puppy rule — F(1)26.f', () => {
  it('2027 bars a baby puppy from every other class', () => {
    expect(babyPuppyRule(2027)).toContain(
      'There must be no progression to further competition and Baby Puppies must not be entered in any other classes at a show.',
    );
  });

  it('2027 names Any Variety Baby Puppy classes and declares Best per breed', () => {
    expect(babyPuppyRule(2027)).toContain(
      'Any Variety Baby Puppy classes may be scheduled at any breed club show.',
    );
    expect(babyPuppyRule(2027)).toContain(
      'Best Baby Puppy in Breed may be declared in each breed from the dogs entered in the Baby Puppy breed classes.',
    );
  });

  it('2026 says none of that', () => {
    expect(babyPuppyRule(2026)).not.toContain('must not be entered in any other classes');
    expect(babyPuppyRule(2026)).not.toContain('Any Variety Baby Puppy');
  });

  it('keeps the age band both years — that part did not change', () => {
    for (const year of [2026, 2027] as const) {
      expect(babyPuppyRule(year)).toContain(
        'A Baby Puppy is a dog of four and less than six calendar months of age on the first day of the show.',
      );
    }
  });

  /**
   * Mandy, 27 Oct 2026: *"yes I would lay it out the exact same as RKC have
   * laid it out"* — so the 2027 paragraph is the RKC's lead sentence followed
   * by lettered (a), (b), (c) clauses, one per line, and not the run-on
   * paragraph it was. Pinned exactly rather than by `toContain`, because the
   * point of her answer is the LAYOUT: a version that merely contains the same
   * sentences run together would satisfy every other assertion in this file.
   */
  it('2027 prints the RKC\'s lettered (a)/(b)/(c) layout, one clause per line', () => {
    expect(babyPuppyRule(2027)).toBe(
      [
        'A Baby Puppy is a dog of four and less than six calendar months of age on the first day of the show.',
        '(a) Baby Puppy classes may be scheduled at any breed club show.',
        '(b) Any Variety Baby Puppy classes may be scheduled at any breed club show.',
        '(c) Best Baby Puppy in Breed may be declared in each breed from the dogs entered in the Baby Puppy breed classes. There must be no progression to further competition and Baby Puppies must not be entered in any other classes at a show.',
      ].join('\n'),
    );
  });

  /**
   * The 2026 text must stay byte-identical — the lettered clauses arrived with
   * the 2027 amendment, and every 2026 golden baseline depends on this string
   * not moving. Pinned verbatim so a future edit to the 2027 branch cannot
   * quietly reformat 2026 along with it.
   */
  it('2026 stays one run-on paragraph, byte for byte', () => {
    expect(babyPuppyRule(2026)).toBe(
      'A Baby Puppy is a dog of four and less than six calendar months of age on the first day of the show. Baby Puppy classes may be scheduled at any breed Club show. Best Baby Puppy in Breed may be declared from the dogs entered in the Baby Puppy class. There must be no progression to further competitions.',
    );
    expect(babyPuppyRule(2026)).not.toContain('\n');
  });
});

describe('objection eligibility — F(B)5', () => {
  it('2027 makes the same-breed-or-class restriction explicit', () => {
    expect(rkcObjectionEligibilityRule(2027)).toContain(
      'Any individual has the right to lodge an objection to a dog, only if he/she is the owner or handler of a dog competing in the same breed or class.',
    );
  });

  it('2026 keeps the older, looser phrasing', () => {
    expect(rkcObjectionEligibilityRule(2026)).toContain(
      'An individual has the right to lodge an objection to a dog if he/she is the owner or handler',
    );
    expect(rkcObjectionEligibilityRule(2026)).not.toContain('only if');
  });

  it('both years keep who substantiates the objection', () => {
    for (const year of [2026, 2027] as const) {
      expect(rkcObjectionEligibilityRule(year)).toContain(
        'The Royal Kennel Club will substantiate the grounds for an objection made on its behalf.',
      );
    }
  });
});

describe('Best Veteran in Show eligibility — F(1)27', () => {
  it('2027 widens a breed club show to any veteran in any breed class', () => {
    const text = defaultBestVeteranEligibility({
      multiBreed: false,
      showType: 'championship',
      regulationYear: 2027,
    });
    expect(text).toContain('A Veteran is a dog of 7 years or more on the first day of the show.');
    expect(text).toContain('A Best Veteran is declared from any Veterans entered in any breed classes.');
  });

  it('2027 General and Group Championship shows select from the Group winners', () => {
    expect(
      defaultBestVeteranEligibility({ multiBreed: true, showType: 'championship', regulationYear: 2027 }),
    ).toContain('Best Veteran in Show must be selected from the Best Veteran in Group winners.');
  });

  it('2027 General Open and Limited shows select from the AV Veteran classes', () => {
    for (const showType of ['open', 'limited']) {
      expect(
        defaultBestVeteranEligibility({ multiBreed: true, showType, regulationYear: 2027 }),
      ).toContain('declared Best from the Any Variety Veteran classes scheduled');
    }
  });

  it('2026 keeps the previous fallback for every show type', () => {
    for (const multiBreed of [false, true]) {
      expect(
        defaultBestVeteranEligibility({ multiBreed, showType: 'championship', regulationYear: 2026 }),
      ).toBe('Eligible dogs are those declared Best Veteran in their breed, or Best Veteran of Sex where applicable.');
    }
  });
});
