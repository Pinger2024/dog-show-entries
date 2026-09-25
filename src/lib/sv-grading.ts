/**
 * SV grading scale — six grades for over-12-month dogs (V/SG/G/A/M/U) plus
 * three for under-12s (VP/P/WV). Surfaces in the schedule grading page and
 * the catalogue / results pages will pull from here too.
 *
 * Source: GSDL-BRG / WUSV reference + Sieger Editorial design brief.
 */

import { comparePlacing } from './placements';

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
 * The public-facing SV rating for a single result: grade + rank, e.g. "V1",
 * "SG2", "VP1". Falls back to the grade alone (no placement) or the placement
 * alone (no grade). Empty string when neither is set.
 *
 * NOTE: the `rank` passed here is the WITHIN-GRADE rank, not the overall class
 * placement. Use {@link computeSvClassRatings} to derive within-grade ranks
 * for a whole class — SV restarts the numbering for each grade (SG1, SG2,
 * G1, G2…), so a single result's overall placement is the wrong number.
 */
export function formatSvRating(
  svGrade: string | null | undefined,
  rank: number | null | undefined,
): string {
  if (svGrade === 'disqualified') return 'Disqualified';
  const gradeUpper = svGrade ? svGrade.toUpperCase() : '';
  if (gradeUpper && rank != null) return `${gradeUpper}${rank}`;
  if (gradeUpper) return gradeUpper;
  if (rank != null) return String(rank);
  return '';
}

/**
 * The BARE SV grade for a single result — grade code only, never a
 * within-grade rank (e.g. "SG", not "SG1"). Mandy 2026-09-07, reviewing the
 * judge-copy results grid: "for the results one we don't need VP1, just VP
 * because we have the catalogue number in the 1st place" — the grid's
 * placing line already carries the catalogue number, so the rank digit on
 * the grade line beneath it is redundant. Distinct from and does not affect
 * {@link formatSvRating}/{@link computeSvClassRatings}, which stay ranked for
 * every other consumer (results pages, the SV graded-results document,
 * grading cards).
 */
export function formatSvGradeBare(svGrade: string | null | undefined): string {
  if (svGrade === 'disqualified') return 'Disqualified';
  return svGrade ? svGrade.toUpperCase() : '';
}

/**
 * Compute the SV rating (grade + within-grade rank) for every result in ONE
 * class. SV ranks within each grade and restarts the count per grade, so a
 * class graded SG,SG,G,G,A placed 1..5 reads SG1, SG2, G1, G2, A1.
 *
 * The steward records each dog's grade plus its overall placing (best first,
 * as on any show); this groups by grade and numbers 1..n within each grade in
 * placing order. Returns a Map keyed by entryClassId. Disqualified shows in
 * full; an ungraded-but-placed dog falls back to its plain placement.
 */
export function computeSvClassRatings(
  results: ReadonlyArray<{
    entryClassId: string;
    svGrade: string | null | undefined;
    placement: number | null | undefined;
  }>,
): Map<string, string> {
  const map = new Map<string, string>();

  for (const { item, grade, rank } of rankWithinGrades(results)) {
    map.set(item.entryClassId, formatSvRating(grade, rank));
  }

  // Disqualified + ungraded fallbacks.
  for (const r of results) {
    if (map.has(r.entryClassId)) continue;
    if (r.svGrade === 'disqualified') {
      map.set(r.entryClassId, 'Disqualified');
    } else if (isPlacedWithoutSvGrade(r)) {
      map.set(r.entryClassId, String(r.placement));
    }
  }

  return map;
}

/** Highest → lowest SV grade: the adult scale, then the under-12 scale. */
export const SV_GRADE_ORDER: readonly SvGradeCode[] = ['v', 'sg', 'g', 'a', 'm', 'u', 'vp', 'p', 'wv'];

/** What {@link rankWithinGrades} and {@link isPlacedWithoutSvGrade} read. */
export interface SvGradedPlacing {
  svGrade: string | null | undefined;
  placement: number | null | undefined;
}

/**
 * THE SV within-grade ranking — the one place Remi works out "SG2" or "G1".
 * SV ranks each grade separately and restarts the count per grade, so a class
 * graded SG, SG, G placed 1..3 reads SG1, SG2, G1.
 *
 * Returns the graded dogs only (ungraded and Disqualified are left for the
 * caller to place), best grade first in {@link SV_GRADE_ORDER}, each grade in
 * the steward's placing order, each with its 1-based rank. The public results
 * page ({@link computeSvClassRatings}) and the SV graded results PDF and
 * spreadsheet (`computeClassMembers` in sv-results.ts) both rank with this —
 * they used to carry two copies of the same loop (register §4, 2026-09-11).
 */
export function rankWithinGrades<T extends SvGradedPlacing>(
  items: ReadonlyArray<T>,
): { item: T; grade: string; rank: number }[] {
  const byGrade = new Map<string, T[]>();
  for (const item of items) {
    if (!item.svGrade || item.svGrade === 'disqualified') continue;
    const list = byGrade.get(item.svGrade) ?? [];
    list.push(item);
    byGrade.set(item.svGrade, list);
  }

  // Known grades best-first; anything unexpected after them rather than lost.
  const gradeRank = (g: string) => {
    const i = (SV_GRADE_ORDER as readonly string[]).indexOf(g);
    return i === -1 ? SV_GRADE_ORDER.length : i;
  };
  const grades = [...byGrade.keys()].sort((a, b) => gradeRank(a) - gradeRank(b));

  const out: { item: T; grade: string; rank: number }[] = [];
  for (const grade of grades) {
    const list = byGrade.get(grade)!;
    list.sort((a, b) => comparePlacing(a.placement, b.placement));
    list.forEach((item, i) => out.push({ item, grade, rank: i + 1 }));
  }
  return out;
}

/**
 * THE rule for "this dog still needs a grade": it has been placed but carries
 * no SV grade (Disqualified counts as a grade). At a regional every dog the
 * judge places is graded, so a placing with no grade is a slip on the day —
 * the NE Regional's no. 11 went to the League with a blank grade (5 Sept
 * 2026). The steward's class page, the secretary's documents page warning and
 * the results code all ask this, so they can never disagree.
 */
export function isPlacedWithoutSvGrade(r: SvGradedPlacing): boolean {
  return r.placement != null && !r.svGrade;
}
