/**
 * ONE owner for "are this show's results published?" on the secretary's
 * screens (Mandy, 16 Nov 2026: "I don't know why it shows on remi dashboard
 * they haven't but you can see them in public domain").
 *
 * There are two kinds of "published":
 *  - Stewards publish each class live on the day (`results.published_at`).
 *    The public results page shows every class-published result.
 *  - The show-wide `shows.results_published_at` is set only by the secretary's
 *    Publish Results, which is really "finalise": it locks the results,
 *    publishes any classes and awards still unpublished, and emails the
 *    exhibitors and followers.
 *
 * The secretary's screens used to read only the show-wide flag, so Winter
 * Spectacular 2026 — every class live, Publish Results not yet pressed — said
 * "Results not yet published" while the public could read them.
 *
 *  - 'final': Publish Results has been pressed.
 *  - 'live':  not finalised, but at least one result is on the public page.
 *  - 'none':  nothing published yet.
 *
 * Anything that depends on the lock or on "Publish Results has been pressed"
 * (the documents page's finalised notes, the checklist tick) asks
 * {@link resultsFinalised} — 'live' never loosens it. "Any result published"
 * comes from `showIdsWithPublishedResults` (server/services/results-shows.ts),
 * which `shows.getById` returns as `hasPublishedResults`.
 *
 * Guard: src/__tests__/results-publication-screens.test.tsx.
 */

export type ResultsPublication = 'none' | 'live' | 'final';

export interface ResultsPublicationInput {
  /** `shows.results_published_at` — set by the secretary's Publish Results. */
  resultsPublishedAt: Date | string | null | undefined;
  /** At least one result for the show has `results.published_at` (a class published live). */
  hasPublishedResults: boolean;
}

/** Has the secretary pressed Publish Results (finalised, locked, emailed)? */
export function resultsFinalised(show: { resultsPublishedAt: Date | string | null | undefined }): boolean {
  return show.resultsPublishedAt != null;
}

export function resultsPublication(input: ResultsPublicationInput): ResultsPublication {
  if (resultsFinalised(input)) return 'final';
  return input.hasPublishedResults ? 'live' : 'none';
}

/** How each state is said on the secretary's screens. */
export const RESULTS_PUBLICATION_LABEL: Record<ResultsPublication, string> = {
  none: 'Results not yet published',
  live: 'Results showing live',
  final: 'Results published',
};

/** The line that goes with 'live', so the secretary knows what is left to do. */
export const RESULTS_LIVE_NOTE =
  'Your classes are already on the public results page. Press Publish Results to lock them and email the exhibitors.';
