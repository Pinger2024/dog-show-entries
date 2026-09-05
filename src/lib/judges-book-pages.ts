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
 * image you sent and the last image looks fine." So that became a TWO-way
 * split, not three: a Dog Awards page mid-book, no separate Bitch Awards
 * page, and the back page reverted to the FULL unfiltered list (dog-side
 * awards deliberately duplicated onto the back page as a result).
 *
 * REVISED AGAIN 2026-08-31, per Mandy's head steward at that weekend's shows
 * (Clyde + Scotland): now a THREE-way split, restoring the bitch page the
 * 08-18 feedback had dropped, and — new this round — making the back page
 * OVERALL-ONLY instead of the full list:
 *   - the DOG-side awards page is unchanged: still lands immediately after
 *     the last dog class.
 *   - a mirrored BITCH-side awards page (Bitch CC / Reserve Bitch CC / Best
 *     Puppy Bitch, …) now lands immediately after the last bitch class,
 *     built and anchored exactly like the dog page.
 *   - the BACK page is no longer the full list. It now carries ONLY the
 *     awards `bestAwardSection` puts in 'overall' — Best of Breed, Best
 *     Puppy in Show, Best Veteran, etc. — plus anything it can't classify
 *     (a club's bespoke trophy), which still rides the back page rather
 *     than being dropped. Dog- and bitch-side awards no longer appear
 *     there at all: the steward's point was that the back page had become
 *     a second, redundant copy of pages the judge had already signed off
 *     mid-book, once there's a bitch page to match the dog page. The back
 *     page renders only when this filtered list is non-empty — a show
 *     with nothing but sexed awards now has NO back page.
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

// Three kinds of awards page render now (see doc comment above), matching
// `bestAwardSection` in top-awards.ts one-for-one: it's the shared
// vocabulary that also decides which awards are sex-restricted for results
// recording elsewhere. An award `bestAwardSection` can't classify (a club's
// bespoke trophy) resolves to 'overall' there, so it always rides the back
// page here too — never dropped, never miscategorised onto a sexed page.
export type JudgesBookAwardsSection = 'dog' | 'bitch' | 'overall';

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
  // Dog- and bitch-side subsets each get pulled out for their own mid-book
  // page — preserving each award's position relative to the others within
  // its bucket (the secretary's configured order, Mandy 2026-07-27,
  // buildBestAwards, is never reshuffled). Everything else — overall, and
  // anything `bestAwardSection` can't classify (a club's bespoke trophy) —
  // rides the back page below; see that block's own comment.
  const dogAwards = bestAwards.filter((a) => bestAwardSection(a) === 'dog');
  const bitchAwards = bestAwards.filter((a) => bestAwardSection(a) === 'bitch');

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
    if (key === 'bitch' && bitchAwards.length > 0) {
      pages.push({ kind: 'awards', section: 'bitch', awards: bitchAwards });
    }
  }

  // Back page — OVERALL-ONLY as of 2026-08-31 (see file doc comment): every
  // award that isn't dog- or bitch-restricted, in the secretary's own
  // configured order. This deliberately includes anything `bestAwardSection`
  // can't classify (a club's bespoke trophy) — those must never be dropped,
  // and 'overall' is exactly where unclassifiable awards land in that
  // function, so this single filter both selects the true overall awards
  // AND rescues the unclassifiable ones in one pass. Dog- and bitch-side
  // awards are excluded here now that each has its own mid-book page — no
  // more back-page duplication. Renders only when something is left.
  const overallAwards = bestAwards.filter((a) => {
    const section = bestAwardSection(a);
    return section !== 'dog' && section !== 'bitch';
  });
  if (overallAwards.length > 0) {
    pages.push({ kind: 'awards', section: 'overall', awards: overallAwards });
  }

  return pages;
}
