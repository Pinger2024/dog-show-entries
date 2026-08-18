/**
 * Builds the Judge's Book's page ORDER — which class pages come in what
 * sequence, and where the Best Awards sign-off content sits among them.
 *
 * Mandy 2026-08-10: one combined "Best Awards" page bolted onto the very end
 * of the book meant the judge flipped all the way back to the last page to
 * sign off Dog CC, having already handed back the pages for the dog classes
 * an hour earlier. First cut: split it into three (dog / bitch / overall),
 * one placed where each decision is actually made.
 *
 * REVISED 2026-08-18, having now seen the rendered pages: "I wouldnt edit
 * the back awards page, just leave that with all the awards on it as it is
 * today, just need that extra page for the Male awards which from the first
 * image you sent and the last image looks fine." So this is now a TWO-way
 * split, not three:
 *   - the DOG-side awards (Best Dog / Dog CC / Reserve Dog CC / Best Puppy
 *     Dog, …) still get their own page immediately after the last dog class
 *     page — that's the "extra page for the Male awards" she confirmed
 *     looks fine, kept unchanged from the 08-10 build.
 *   - NO separate bitch awards page — removed. The bitch classes run
 *     straight through to whatever comes next (special/JH/back of book).
 *   - the BACK page reverts to the pre-split content: the FULL configured
 *     awards list (every award `buildBestAwards` returns), unfiltered, in
 *     the secretary's own configured order — same as the single combined
 *     sign-off page did before the 08-10 split. The dog-side awards
 *     deliberately appear on BOTH the mid-book page and the back page —
 *     that duplication is Mandy's explicit choice, not an oversight.
 *
 * `classes` does NOT need to already be in Dog → Bitch → Special → Junior
 * Handling running order — this buckets it itself via the shared
 * `sectionClasses` helper (class-labels.ts), the SAME bucketing the
 * catalogue, schedule and Prize Cards routes use. The judges-book route
 * previously trusted raw show_classes.sortOrder, which let a Special Award
 * or Junior Handling class sit between the dog and bitch blocks on shows
 * whose classes weren't entered in strict sex order — this brings the book
 * into line with every other document (the Prize Cards route's own comment
 * already assumed the Judge's Book matched this order).
 */
import { sectionClasses, type ClassSectionKey } from './class-labels';
import { bestAwardSection } from './top-awards';
import type { JudgesBookClass } from '@/app/api/judges-book/[showId]/route';

// Only two kinds of awards page render now (see doc comment above) — but
// `bestAwardSection` in top-awards.ts still classifies into three buckets
// ('dog' | 'bitch' | 'overall'): it's the shared vocabulary that also
// decides which awards are sex-restricted for results recording elsewhere,
// and the 'bitch' bucket is still needed below to EXCLUDE bitch-side
// awards from the dog page (they fall through to the full back-page list
// same as any other award).
export type JudgesBookAwardsSection = 'dog' | 'overall';

export type JudgesBookPage =
  | { kind: 'class'; class: JudgesBookClass }
  | { kind: 'awards'; section: JudgesBookAwardsSection; awards: string[] };

// Fixed running order every document shares (class-labels.ts). Walking every
// key — not just the ones this book actually has classes for — is what lets
// a missing Dog or Bitch section still anchor its awards page at the right
// point instead of vanishing: if this show/book has no bitch classes but
// bitch-side awards are configured, the loop still reaches the 'bitch' key
// (with zero classes to emit) and places that awards page there — right
// after the dog section, exactly where the bitch section would have sat.
const SECTION_ORDER: ClassSectionKey[] = ['dog', 'bitch', 'special', 'jh', 'other'];

export function buildJudgesBookPages(
  classes: JudgesBookClass[],
  bestAwards: string[],
): JudgesBookPage[] {
  // Only the dog-side subset gets pulled out for its own mid-book page —
  // preserving each award's position relative to the others (the
  // secretary's configured order, Mandy 2026-07-27, buildBestAwards, is
  // never reshuffled). Everything else — bitch-side, overall, and anything
  // `bestAwardSection` can't classify (a club's bespoke trophy) — is left
  // to ride along on the FULL, unfiltered `bestAwards` list on the back
  // page below; it is never a second, separately-filtered bucket.
  const dogAwards = bestAwards.filter((a) => bestAwardSection(a) === 'dog');

  const sections = sectionClasses(classes, (c) => ({
    sex: c.sex,
    classType: c.classType,
    className: c.className,
  }));
  const classesByKey = new Map(sections.map((sec) => [sec.key, sec.classes]));

  const pages: JudgesBookPage[] = [];
  for (const key of SECTION_ORDER) {
    for (const cls of classesByKey.get(key) ?? []) {
      pages.push({ kind: 'class', class: cls });
    }
    if (key === 'dog' && dogAwards.length > 0) {
      pages.push({ kind: 'awards', section: 'dog', awards: dogAwards });
    }
  }

  // Back page — the FULL configured awards list, unfiltered, always last.
  // This is the pre-08-10-split behaviour restored per Mandy 2026-08-18:
  // "just leave that with all the awards on it as it is today."
  if (bestAwards.length > 0) {
    pages.push({ kind: 'awards', section: 'overall', awards: bestAwards });
  }

  return pages;
}
