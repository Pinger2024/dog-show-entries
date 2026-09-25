/**
 * ONE owner for "which back-of-book pages does this catalogue print" —
 * the awards write-in page, the Not For Competition list, and the
 * exhibitor index. Before this module existed the answer was written down
 * three times, and they disagreed:
 *
 *  - `catalogue-by-class.tsx` (introduced `f7665ff7`, 19 June 2026) skipped
 *    ALL THREE pages for a WUSV/SV show, with the reasoning "SV catalogues
 *    keep their own structure (owner + results details already live on
 *    each SV entry line), so the RKC back-of-book pages are skipped for
 *    them."
 *  - `catalogue-ringside.tsx` rendered the awards write-in page and the
 *    NFC list UNCONDITIONALLY (no SV gate at all).
 *  - `catalogue-marked.tsx` rendered the exhibitor index UNCONDITIONALLY
 *    (no SV gate at all).
 *
 * Mandy (co-founder, domain owner) settled this on 22 Sept 2026, after
 * generating the Midland regional catalogue and finding the Best Awards
 * page missing:
 *
 *  1. YES — a regional catalogue SHOULD have the awards write-in page (the
 *     back page for filling in Best Dog, Best Bitch, Most Promising Dog,
 *     Most Promising Bitch on the day). This SUPERSEDES the 19 June
 *     reasoning above for this one page: a regional's own class lines
 *     don't carry the SHOW-level principal awards, only per-class
 *     placings/grading, so the write-in page is still needed.
 *  2. NO — regionals should NOT have the exhibitor index.
 *
 * The Not For Competition list is NOT part of Mandy's 22 Sept decision —
 * it stays out of every WUSV/SV catalogue for the pre-existing, unrelated
 * reason that regionals allow no NFC entries at all (see
 * `resolvePreflightContract` in `catalogue-preflight.ts`, and
 * `renderCatalogueFromSnapshot` in `catalogue-snapshot.ts`, both of which
 * already key their own WUSV behaviour off `showRuleset === 'wusv'` — a
 * WUSV show simply never has an NFC entry to list).
 */
export interface CatalogueBackMatterShow {
  showRuleset?: string | null;
}

/**
 * Which document is being rendered. The MARKED catalogue is not the
 * catalogue exhibitors read — it is the secretary's marked-up submission
 * copy, and RKC F(1).11.b(6) governs what it must contain. Mandy's 22 Sept
 * answer ("no exhibitor index for regionals") was given about the catalogue
 * she had just generated, and the question put to her said regionals had no
 * index "at the moment" — true of that catalogue, but NOT true of the marked
 * copy, which did print one. So her answer is not safely read as covering a
 * submission document, and the marked copy keeps its index until she rules
 * on it specifically. Do not "tidy" this away without asking her.
 */
export type CatalogueDocumentKind = 'catalogue' | 'marked';

export interface CatalogueBackMatter {
  /** The Best Awards write-in page (Best Dog / Best Bitch / etc, blank
   *  lines for the day). Mandy, 22 Sept 2026: YES for regionals too. */
  awardsWriteIn: boolean;
  /** The Not For Competition list. Regionals allow no NFC entries at all,
   *  so there is never anything to list — unrelated to Mandy's 22 Sept
   *  decision, which didn't touch this page. */
  notForCompetition: boolean;
  /** The exhibitor index. Mandy, 22 Sept 2026: NO for regionals. */
  exhibitorIndex: boolean;
}

export function catalogueBackMatter(
  show: CatalogueBackMatterShow,
  document: CatalogueDocumentKind = 'catalogue',
): CatalogueBackMatter {
  const isWusv = show.showRuleset === 'wusv';
  return {
    awardsWriteIn: true,
    notForCompetition: !isWusv,
    // See CatalogueDocumentKind: the marked (RKC submission) copy keeps its
    // index on a regional pending Mandy's explicit ruling.
    exhibitorIndex: !isWusv || document === 'marked',
  };
}
