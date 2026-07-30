/**
 * Build the two-line "Breed: ... / Classification: ..." labels for a judge.
 *
 * Amanda's 2026-05-15 spec: split the legacy combined "Breeds" line into
 *   - Breed:         the actual dog breed(s) on the show
 *   - Classification: what they're judging (breed classes by sex, Special
 *                     Awards Classes, Junior Handling)
 *
 * Used by:
 *   - secretary.ts judge offer email (the original consumer)
 *   - judge-contract-pdf.ts (the signed contract PDF must match the email)
 *   - judge-section.tsx UI card (client-side equivalent that derives from
 *     pre-grouped data — see deriveJudgeLabels there)
 */

export interface JudgeAssignmentForClassification {
  breed?: { name: string } | null;
  sex: string | null;
  isSpecialAwardsClassesJudge?: boolean | null;
}

export interface JudgeBreedAndClassification {
  breedLine: string;
  classificationLine: string;
}

export function buildJudgeBreedAndClassification(
  assignments: JudgeAssignmentForClassification[],
  showBreedNames: string[],
  showName?: string,
): JudgeBreedAndClassification {
  const fallbackBreed = showBreedNames.length > 0
    ? showBreedNames.join(', ')
    : (showName ?? 'All breeds');

  const breeds = new Set<string>();
  const classifications = new Set<string>();
  const breedSexes = new Map<string, Set<'dog' | 'bitch' | 'both'>>();
  let hasJh = false;
  let hasSac = false;
  // Sex-bearing breed-class assignments with no resolvable breed name (e.g. an
  // SV/regional single-breed show whose breed isn't set on the shows row).
  const breedlessSexes = new Set<'dog' | 'bitch' | 'both'>();

  // Single-breed shows (especially SV regional) store breed-class judge
  // assignments with breed_id = NULL because the breed is implicit on the
  // shows row. Use the show's primary breed as a fallback so a row with
  // `breed=null, sex='dog'` still renders as "{Breed} Dogs classes" rather
  // than being dropped silently (Amanda 2026-05-22).
  const singleBreedFallback = showBreedNames.length === 1 ? showBreedNames[0]! : null;

  for (const a of assignments) {
    const isSac = a.isSpecialAwardsClassesJudge === true;
    if (isSac) {
      hasSac = true;
      for (const b of showBreedNames) breeds.add(b);
      continue;
    }
    const effectiveBreed =
      a.breed?.name ??
      (a.sex !== null && singleBreedFallback ? singleBreedFallback : null);
    if (effectiveBreed) {
      breeds.add(effectiveBreed);
      const set = breedSexes.get(effectiveBreed) ?? new Set();
      set.add(a.sex === 'dog' ? 'dog' : a.sex === 'bitch' ? 'bitch' : 'both');
      breedSexes.set(effectiveBreed, set);
    } else if (a.sex === null) {
      hasJh = true;
    } else if (showBreedNames.length === 0) {
      // Sex set but no breed AND the show lists no breeds at all (e.g. a
      // regional show whose breed isn't set on the shows row) — unambiguous,
      // so don't drop it (that left only "Junior Handling" showing on the
      // offer); record the sex so it still yields a "Dogs & Bitches classes"
      // classification. We deliberately do NOT do this on multi-breed shows,
      // where a null breed is genuinely ambiguous. (Mandy 2026-06-18)
      breedlessSexes.add(a.sex === 'dog' ? 'dog' : a.sex === 'bitch' ? 'bitch' : 'both');
    }
  }

  for (const breed of breeds) {
    const sexes = breedSexes.get(breed);
    if (sexes) {
      const hasDog = sexes.has('dog');
      const hasBitch = sexes.has('bitch');
      const hasBoth = sexes.has('both');
      const sexLabel = hasBoth || (hasDog && hasBitch)
        ? 'Dogs & Bitches'
        : hasDog ? 'Dogs' : hasBitch ? 'Bitches' : '';
      classifications.add(sexLabel ? `${breed} ${sexLabel} classes` : `${breed} classes`);
    }
  }
  if (breedlessSexes.size > 0) {
    const hasDog = breedlessSexes.has('dog');
    const hasBitch = breedlessSexes.has('bitch');
    const hasBoth = breedlessSexes.has('both');
    const sexLabel = hasBoth || (hasDog && hasBitch)
      ? 'Dogs & Bitches'
      : hasDog ? 'Dogs' : hasBitch ? 'Bitches' : '';
    classifications.add(sexLabel ? `${sexLabel} classes` : 'Breed classes');
  }
  if (hasSac) {
    const showBreed = showBreedNames[0];
    classifications.add(showBreed ? `${showBreed} Special Award Classes` : 'Special Award Classes');
  }
  if (hasJh) {
    classifications.add('Junior Handling');
  }

  return {
    breedLine: breeds.size > 0 ? [...breeds].join(', ') : fallbackBreed,
    classificationLine: classifications.size > 0 ? [...classifications].join(' / ') : 'TBC',
  };
}
