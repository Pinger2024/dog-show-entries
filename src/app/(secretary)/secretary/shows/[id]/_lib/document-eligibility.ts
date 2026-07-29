/**
 * Which rows/cards on the Documents & Reports page are eligible for a given
 * show, by RULESET (RKC vs SV/WUSV) and TYPE (championship vs not). This is
 * eligibility gating, not phase gating — see documents-not-phase-gated.test.ts,
 * which must stay green: nothing here may depend on show status, catalogue
 * numbers, or results being published.
 *
 * SV/WUSV regional shows use the "By Class" catalogue as their catalogue
 * format and get their own SV Graded Results report — they never need the
 * RKC-format Standard/Steward catalogues, Judge's Book, Ring/Award Board,
 * Prize Cards, or Marked Catalogue (the secretary's rule: regionals have
 * their own results report). Pure function, no React — one place to update
 * when the next ruleset or the next row shows up.
 */

export type DocumentRowKey =
  | 'catalogue-by-class'
  | 'catalogue-standard'
  | 'catalogue-steward'
  | 'judges-book'
  | 'schedule'
  | 'ring-numbers'
  | 'ring-board'
  | 'award-board'
  | 'prize-cards'
  | 'marked-catalogue'
  | 'sh01'
  | 'sv-results';

export interface DocumentEligibilityContext {
  showRuleset: 'rkc' | 'wusv' | null | undefined;
  showType?: string | null;
}

/** Rows only relevant to RKC-format shows — hidden entirely on SV/WUSV shows. */
const RKC_ONLY_ROWS = new Set<DocumentRowKey>([
  'catalogue-standard',
  'catalogue-steward',
  'judges-book',
  'ring-board',
  'award-board',
  'prize-cards',
  'marked-catalogue',
]);

export function documentRowVisible(rowKey: DocumentRowKey, ctx: DocumentEligibilityContext): boolean {
  const isWusv = ctx.showRuleset === 'wusv';

  switch (rowKey) {
    case 'sv-results':
      return isWusv;
    case 'sh01':
      return !isWusv && ctx.showType === 'championship';
    default:
      if (RKC_ONLY_ROWS.has(rowKey)) return !isWusv;
      return true;
  }
}
