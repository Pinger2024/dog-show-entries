/**
 * SV grading scale — six grades for over-12-month dogs (V/SG/G/A/M/U) plus
 * three for under-12s (VP/P/WV). Surfaces in the schedule grading page and
 * the catalogue / results pages will pull from here too.
 *
 * Source: GSDL-BRG / WUSV reference + Sieger Editorial design brief.
 */

export interface SvGrade {
  code: string;
  german: string;
  english: string;
  note?: string;
}

export const SV_GRADING_OVER_TWELVE: SvGrade[] = [
  {
    code: 'V',
    german: 'Vorzüglich',
    english: 'Excellent',
    note:
      'Awardable only to 24 mths + at a Regional. Highest grade at a Regional.',
  },
  {
    code: 'SG',
    german: 'Sehr Gut',
    english: 'Very Good',
    note: 'Highest grade for 12–24 mth dogs.',
  },
  {
    code: 'G',
    german: 'Gut',
    english: 'Good',
    note: 'Minimum grade required for the Koerung (breed survey).',
  },
  { code: 'A', german: 'Ausreichend', english: 'Sufficient' },
  { code: 'M', german: 'Mangelhaft', english: 'Faulty' },
  { code: 'U', german: 'Ungenügend', english: 'Insufficient' },
];

export const SV_GRADING_UNDER_TWELVE: SvGrade[] = [
  {
    code: 'VP',
    german: 'Vielversprechend',
    english: 'Very Promising',
    note: 'Highest awardable to under-12-month dogs.',
  },
  { code: 'P', german: 'Versprechend', english: 'Promising' },
  { code: 'WV', german: 'Weniger versprechend', english: 'Less Promising' },
];

/** All SV grade codes that exist as `results.svGrade` enum values, lower-cased. */
export type SvGradeCode = 'vp' | 'p' | 'wv' | 'v' | 'sg' | 'g' | 'a' | 'm' | 'u' | 'disqualified';

/**
 * Which grades a steward may award in a given SV class (Amanda 2026-05-28):
 *  - under 12 months (Baby Puppy, Minor Puppy, Puppy): VP / P / WV
 *  - 12 months and over but NOT Working (Junior, Yearling, Adult): SG / G / A / M / U
 *  - Working: V / SG / G / A / M / U   (V — Excellent — only here)
 * Disqualified is always available.
 *
 * Keyed on the class-definition name (with or without the "SV " prefix).
 */
export function allowedSvGradesForClass(
  className: string | null | undefined,
): { value: SvGradeCode; label: string }[] {
  const name = (className ?? '').replace(/^SV\s+/, '').trim();
  const underTwelve = name === 'Baby Puppy' || name === 'Minor Puppy' || name === 'Puppy';
  const isWorking = name === 'Working';

  let codes: SvGradeCode[];
  if (underTwelve) {
    codes = ['vp', 'p', 'wv'];
  } else if (isWorking) {
    codes = ['v', 'sg', 'g', 'a', 'm', 'u'];
  } else {
    codes = ['sg', 'g', 'a', 'm', 'u'];
  }

  const labels: Record<SvGradeCode, string> = {
    vp: 'VP — Very Promising',
    p: 'P — Promising',
    wv: 'WV — Less Promising',
    v: 'V — Excellent',
    sg: 'SG — Very Good',
    g: 'G — Good',
    a: 'A — Adequate',
    m: 'M — Faulty',
    u: 'U — Insufficient',
    disqualified: 'Disqualified',
  };

  return [...codes, 'disqualified' as const].map((value) => ({ value, label: labels[value] }));
}

/**
 * The public-facing SV rating for a result: grade + rank-within-grade, e.g.
 * "V1", "SG2", "VP1". Falls back to the grade alone (no placement) or the
 * placement alone (no grade). Empty string when neither is set.
 */
export function formatSvRating(
  svGrade: string | null | undefined,
  placement: number | null | undefined,
): string {
  if (svGrade === 'disqualified') return 'Disqualified';
  const gradeUpper = svGrade ? svGrade.toUpperCase() : '';
  if (gradeUpper && placement != null) return `${gradeUpper}${placement}`;
  if (gradeUpper) return gradeUpper;
  if (placement != null) return String(placement);
  return '';
}
