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
 *   - judge-section.tsx UI card (assignments card + offer preview) —
 *     deriveJudgeLabels() there calls THIS function per judge; it used to
 *     rebuild the grouping/labelling inline (one-owner fix 2026-09-18).
 *
 * This module is pure (no db/node imports) so it is safe to import from a
 * client component as well as from server routers/services.
 */

export interface JudgeAssignmentForClassification {
  breed?: { name: string } | null;
  sex: string | null;
  isSpecialAwardsClassesJudge?: boolean | null;
}

export interface JudgeBreedAndClassification {
  breedLine: string;
  classificationLine: string;
  /** Same content as classificationLine, unjoined — for callers (e.g. the
   *  judge-section.tsx assignments card) that lay classifications out as
   *  separate items instead of a single " / "-joined string. */
  classifications: string[];
}

/**
 * Does this assignment put the judge over BREED classes — not Junior Handling
 * (no breed, no sex) and not the Special Awards Classes? ONE owner: the labels
 * below branch on it, and so does the critique link Remi sends by itself
 * ("Breed only", Mandy, 30 Sept 2026 — services/critique-invites.ts).
 */
export function isBreedClassAssignment(a: JudgeAssignmentForClassification): boolean {
  if (a.isSpecialAwardsClassesJudge === true) return false;
  return a.breed != null || a.sex !== null;
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
    if (!isBreedClassAssignment(a)) {
      hasJh = true;
      continue;
    }
    // A breed-class assignment on a multi-breed show with no breed of its own
    // has nothing to name, so it adds no line (as before).
    const effectiveBreed =
      a.breed?.name ??
      (a.sex !== null && singleBreedFallback ? singleBreedFallback : null);
    if (effectiveBreed) {
      breeds.add(effectiveBreed);
      const set = breedSexes.get(effectiveBreed) ?? new Set();
      set.add(a.sex === 'dog' ? 'dog' : a.sex === 'bitch' ? 'bitch' : 'both');
      breedSexes.set(effectiveBreed, set);
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
  if (hasSac) {
    const showBreed = showBreedNames[0];
    classifications.add(showBreed ? `${showBreed} Special Award Classes` : 'Special Award Classes');
  }
  if (hasJh) {
    classifications.add('Junior Handling');
  }

  const classificationList = [...classifications];
  return {
    breedLine: breeds.size > 0 ? [...breeds].join(', ') : fallbackBreed,
    classificationLine: classificationList.length > 0 ? classificationList.join(' / ') : 'TBC',
    classifications: classificationList,
  };
}
