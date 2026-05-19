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

  for (const a of assignments) {
    const isSac = a.isSpecialAwardsClassesJudge === true;
    if (isSac) {
      hasSac = true;
      for (const b of showBreedNames) breeds.add(b);
      continue;
    }
    if (a.breed?.name) {
      breeds.add(a.breed.name);
      const set = breedSexes.get(a.breed.name) ?? new Set();
      set.add(a.sex === 'dog' ? 'dog' : a.sex === 'bitch' ? 'bitch' : 'both');
      breedSexes.set(a.breed.name, set);
    } else if (a.sex === null) {
      hasJh = true;
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

  return {
    breedLine: breeds.size > 0 ? [...breeds].join(', ') : fallbackBreed,
    classificationLine: classifications.size > 0 ? [...classifications].join(' / ') : 'TBC',
  };
}
