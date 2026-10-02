import { isVisibleToViewer } from '@/lib/result-visibility';
import { todayInLondon } from '@/lib/date-utils';

/**
 * One owner for what someone other than the dog's owner may see of a dog's
 * show history — its profile page, its link preview and share image, the
 * sitemap, the timeline and followers' feed, the championship widget.
 *
 * Mandy, 1 Oct 2026: "we should never show a dog and what its upcoming shows
 * are, only shows that are in the past, have been judged" — results and any
 * critiques, never where it is entered next. A judge can look a dog up.
 *
 * The rule had been written six times and the copies disagreed: the page
 * showed an entry from the morning of the show (before the class was
 * judged), the link preview and share image counted upcoming entries
 * ("6 shows entered" for Rosebud Edie of Hundark, four of them past), the
 * sitemap listed dogs whose only entries were upcoming, and the feed and the
 * championship widget used results that had not been published.
 *
 * For anyone but the owner, each class the dog was entered in is:
 *  - visible, with its placing and critique, once its result is published;
 *  - hidden while a result exists but is not yet published — even after the
 *    show, so a winner never shows as "entered, unplaced" before publication;
 *  - visible as unplaced once the show is over, if the dog has no result;
 *  - hidden until then.
 * A show appears once at least one of the dog's classes there is visible.
 * The dog's owners (account holder or linked co-owner) see everything.
 *
 * Guard: src/__tests__/dog-public-history-one-owner.test.ts.
 */

type ResultLike = { publishedAt: Date | string | null };

export type HistoryShowLike = { startDate: string; endDate: string | null };

export type HistoryEntryLike = {
  show: HistoryShowLike;
  entryClasses: Array<{ result: ResultLike | null }>;
};

export type HistoryViewer = {
  /** The dog's account holder or a linked co-owner (`dogRowGrantsAccess`). */
  viewerIsOwner: boolean;
  /** London date (YYYY-MM-DD); defaults to today. Tests pass it explicitly. */
  today?: string;
};

/** The show's last day has passed, in London. */
export function isShowOver(show: HistoryShowLike, today: string = todayInLondon()): boolean {
  return (show.endDate ?? show.startDate) < today;
}

/** The result the viewer may see for a class — null when there is none yet. */
export function visibleResult<R extends ResultLike>(
  result: R | null | undefined,
  viewerIsOwner: boolean,
): R | null {
  return isVisibleToViewer(result, viewerIsOwner) ? result! : null;
}

/** May the viewer see that the dog was entered in this class at all? */
export function isClassVisible(
  show: HistoryShowLike,
  result: ResultLike | null | undefined,
  viewer: HistoryViewer,
): boolean {
  if (viewer.viewerIsOwner) return true;
  if (result) return isVisibleToViewer(result, false);
  return isShowOver(show, viewer.today ?? todayInLondon());
}

/**
 * The dog's entries as the viewer may see them: hidden classes removed,
 * unpublished results nulled, and shows with no visible class dropped.
 */
export function publicDogHistory<
  C extends { result: ResultLike | null },
  E extends { show: HistoryShowLike; entryClasses: C[] },
>(entries: E[], viewer: HistoryViewer): Array<E & { entryClasses: C[] }> {
  const today = viewer.today ?? todayInLondon();
  const out: Array<E & { entryClasses: C[] }> = [];
  for (const entry of entries) {
    const classes = entry.entryClasses
      .filter((ec) => isClassVisible(entry.show, ec.result, { ...viewer, today }))
      .map((ec) => ({ ...ec, result: visibleResult(ec.result, viewer.viewerIsOwner) }));
    // The owner sees every entry, even one with no classes (not for
    // competition); anyone else sees a show only for a visible class.
    if (viewer.viewerIsOwner || classes.length > 0) out.push({ ...entry, entryClasses: classes });
  }
  return out;
}

/**
 * What happened to the dog in one class, as its page says it (Mandy, 2 Oct
 * 2026: "where a dog has been marked absent on the results, that should show
 * as absent on their profile rather than unplaced" — Drama von Arlett, Adult
 * at the North East Regional). Call it on a class from `publicDogHistory`, so
 * a result the viewer may not see has already been taken away.
 *
 * Absence is per class (`entry_classes.absent` — the whole-show
 * `entries.absent` is only a roll-up) and wins over everything: the steward
 * page refuses to place a dog marked absent in that class.
 */
export type ClassOutcome = 'placed' | 'withheld' | 'unplaced' | 'absent' | 'pending';

export function classOutcome(
  show: HistoryShowLike,
  entryClass: {
    absent?: boolean | null;
    result: { placement?: number | null; placementStatus?: string | null } | null;
  },
  today: string = todayInLondon(),
): ClassOutcome {
  if (entryClass.absent) return 'absent';
  const result = entryClass.result;
  if (result) {
    if (result.placement != null) return 'placed';
    if (result.placementStatus === 'withheld') return 'withheld';
    return 'unplaced';
  }
  // No result: not judged yet (the owner's own upcoming entry), or the show
  // is over and the dog wasn't placed.
  return isShowOver(show, today) ? 'unplaced' : 'pending';
}

/**
 * Has the public got anything to see — at least one show visible to someone
 * who is not the owner? The sitemap lists only these dogs.
 */
export function hasPublicHistory(entries: HistoryEntryLike[], today?: string): boolean {
  return publicDogHistory(entries, { viewerIsOwner: false, today }).length > 0;
}

/**
 * The headline numbers anyone may see — the link preview's "N shows entered",
 * the share image's "N Shows · N × 1st · N Awards", and Find a Dog's
 * "Shown at N Remi shows · N judge's critiques".
 */
export function publicHistoryCounts(
  entries: Array<{
    show: HistoryShowLike;
    entryClasses: Array<{
      result:
        | (ResultLike & { placement: number | null; specialAward: string | null; critiqueText?: string | null })
        | null;
    }>;
  }>,
  today?: string,
): { shows: number; firsts: number; specialAwards: number; critiques: number } {
  const visible = publicDogHistory(entries, { viewerIsOwner: false, today });
  let firsts = 0;
  let specialAwards = 0;
  let critiques = 0;
  for (const entry of visible) {
    for (const ec of entry.entryClasses) {
      if (ec.result?.placement === 1) firsts++;
      if (ec.result?.specialAward) specialAwards++;
      if (ec.result?.critiqueText?.trim()) critiques++;
    }
  }
  return { shows: visible.length, firsts, specialAwards, critiques };
}
