/**
 * Pick the single age class to recommend for a dog, from the age-eligible
 * classes in a show plus the dog's coat (when known).
 *
 * Two rules, both from Mandy 2026-07-12 — she caught the old code recommending
 * the wrong class because it simply took the first age-eligible class in DB
 * order (`eligibleAgeClasses[0]`), which is effectively arbitrary:
 *
 *  1. Most specific age band wins. An 8-month-old is eligible for Minor Puppy
 *     (6–9), Puppy (6–12) and Junior (6–18) — it should be recommended Minor
 *     Puppy, the tightest band that fits.
 *  2. Never recommend a "Long Coat" class unless the dog is known to be long
 *     coat. A stock-coat or unknown-coat dog gets the general class; a known
 *     long-coat dog is steered to the Long Coat division. (RKC coated-breed
 *     classes carry the coat in the class name, e.g. "Special Long Coat
 *     Yearling"; the UI doesn't hard-filter them, so the recommendation must.)
 */

export type AgeClassOption = {
  name: string;
  minMonths: number | null;
  maxMonths: number | null;
};

/** RKC coated-breed classes name the coat, e.g. "Special Long Coat Puppy". */
export const isLongCoatClass = (name: string): boolean => /long\s*coat/i.test(name);

/** Width of an age band in months; an open-ended (null) bound counts as widest. */
function ageRange(cls: AgeClassOption): number {
  const min = cls.minMonths ?? 0;
  const max = cls.maxMonths ?? Number.POSITIVE_INFINITY;
  return max - min;
}

export function pickRecommendedAgeClass(
  eligible: AgeClassOption[],
  dogCoat?: 'stock' | 'long_stock' | null,
): AgeClassOption | null {
  if (eligible.length === 0) return null;

  // Coat: a known long-coat dog is steered to the Long Coat division; a
  // stock/unknown-coat dog must NOT be recommended a Long Coat class (Mandy).
  // Fall back to the full set if the preferred subset is empty (e.g. a show
  // that only offers a Long Coat class in that age band).
  const dogIsLongCoat = dogCoat === 'long_stock';
  const preferred = dogIsLongCoat
    ? eligible.filter((c) => isLongCoatClass(c.name))
    : eligible.filter((c) => !isLongCoatClass(c.name));
  const candidates = preferred.length > 0 ? preferred : eligible;

  // Most specific = smallest age range; ties broken to the lower upper bound
  // (more junior), then the shorter name (the general class over a qualified
  // variant of the same band).
  return [...candidates].sort((a, b) => {
    const byRange = ageRange(a) - ageRange(b);
    if (byRange !== 0) return byRange;
    const aMax = a.maxMonths ?? Number.POSITIVE_INFINITY;
    const bMax = b.maxMonths ?? Number.POSITIVE_INFINITY;
    if (aMax !== bMax) return aMax - bMax;
    return a.name.length - b.name.length;
  })[0]!;
}
