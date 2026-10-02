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

const SHOWN: ReadonlySet<ClassOutcome> = new Set<ClassOutcome>(['placed', 'withheld', 'unplaced']);

type CountableEntry = {
  show: HistoryShowLike;
  entryClasses: Array<{
    absent?: boolean | null;
    result:
      | (ResultLike & {
          placement?: number | null;
          placementStatus?: string | null;
          specialAward?: string | null;
          critiqueText?: string | null;
        })
      | null;
  }>;
};

/** Was the dog actually shown at this show — in the ring in at least one class (not absent, not still to come)? */
export function wasShownAt(entry: CountableEntry, today: string = todayInLondon()): boolean {
  return entry.entryClasses.some((ec) => SHOWN.has(classOutcome(entry.show, ec, today)));
}

/**
 * A dog's numbers, counting only shows and classes it was actually shown in
 * (Mandy, 2 Oct 2026: "actually shown at" — a show it was absent from, or
 * hasn't been to yet, isn't one). Pass entries already through
 * `publicDogHistory` for the viewer. The career box, the link preview, the
 * share image, Find a Dog and the yearly analytics all count with this.
 */
export function historyCounts(
  visibleEntries: CountableEntry[],
  today: string = todayInLondon(),
): {
  shows: number;
  classes: number;
  firsts: number;
  seconds: number;
  thirds: number;
  specialAwards: number;
  critiques: number;
} {
  const counts = { shows: 0, classes: 0, firsts: 0, seconds: 0, thirds: 0, specialAwards: 0, critiques: 0 };
  for (const entry of visibleEntries) {
    let shownHere = false;
    for (const ec of entry.entryClasses) {
      if (!SHOWN.has(classOutcome(entry.show, ec, today))) continue;
      shownHere = true;
      counts.classes++;
      const r = ec.result;
      if (r?.placement === 1) counts.firsts++;
      if (r?.placement === 2) counts.seconds++;
      if (r?.placement === 3) counts.thirds++;
      if (r?.specialAward) counts.specialAwards++;
      if (r?.critiqueText?.trim()) counts.critiques++;
    }
    if (shownHere) counts.shows++;
  }
  return counts;
}

/**
 * The headline numbers anyone may see — the link preview's "Shown at N
 * shows", the share image's "N Shows · N × 1st · N Awards", and Find a Dog's
 * "Shown at N Remi shows · N judge's critiques".
 */
export function publicHistoryCounts(
  entries: CountableEntry[],
  today: string = todayInLondon(),
): { shows: number; firsts: number; specialAwards: number; critiques: number } {
  const { shows, firsts, specialAwards, critiques } = historyCounts(
    publicDogHistory(entries, { viewerIsOwner: false, today }),
    today,
  );
  return { shows, firsts, specialAwards, critiques };
}

/**
 * Has the public got a show to see — one the dog was actually shown at?
 * The sitemap and Find a Dog list only these dogs.
 */
export function hasPublicHistory(entries: CountableEntry[], today?: string): boolean {
  return publicHistoryCounts(entries, today).shows > 0;
}
