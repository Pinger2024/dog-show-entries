/**
 * Builds the Judge's Book's page ORDER — which class pages come in what
 * sequence, and where the Best Awards sign-off content sits among them.
 *
 * Mandy 2026-08-10 (re-requested 2026-08-18, two shows about to print): one
 * combined "Best Awards" page bolted onto the very end of the book meant the
 * judge flipped all the way back to the last page to sign off Dog CC, having
 * already handed back the pages for the dog classes an hour earlier. Split
 * into three, each placed where that decision is actually made:
 *   - the DOG-side awards (Best Dog / Dog CC / Reserve Dog CC / Best Puppy
 *     Dog, …) immediately after the last dog class page,
 *   - the BITCH-side awards immediately after the last bitch class page,
 *   - the OVERALL awards — Best of Breed, Best in Show, Best Puppy in Show,
 *     etc, plus anything `bestAwardSection` can't classify (a club's bespoke
 *     trophy is never silently dropped) — stay on the back page, same as
 *     the single sign-off page did before this split.
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
  // Split the configured award list by which page it belongs on, preserving
  // each award's position relative to the others in ITS OWN bucket — the
  // secretary's configured order (Mandy 2026-07-27, buildBestAwards) is
  // never reshuffled, only partitioned.
  const dogAwards = bestAwards.filter((a) => bestAwardSection(a) === 'dog');
  const bitchAwards = bestAwards.filter((a) => bestAwardSection(a) === 'bitch');
  const overallAwards = bestAwards.filter((a) => bestAwardSection(a) === 'overall');

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

  // Back page — overall awards only, always last (mirrors where the single
  // combined sign-off page sat before this split).
  if (overallAwards.length > 0) {
    pages.push({ kind: 'awards', section: 'overall', awards: overallAwards });
  }

  return pages;
}
