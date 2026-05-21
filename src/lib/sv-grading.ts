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
