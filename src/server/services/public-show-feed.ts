import { asc, inArray } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { shows } from '@/server/db/schema';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
import { PUBLIC_SHOW_STATUSES } from '@/lib/public-show-statuses';
import {
  entryWindowOpen,
  publicShowStatus,
  showHref,
  showResultsHref,
  showResultsState,
  type ShowResultsState,
} from '@/lib/show-status';
import { displayShowTypeTitle } from '@/lib/show-types';
import { entryCloseExtendedNotice } from '@/lib/entry-close-rules';
import { londonCalendarDateStr, todayInLondon } from '@/lib/date-utils';
import { canonicalUrl } from '@/lib/app-url';
import { showIdsWithPublishedResults } from './results-shows';

/**
 * ONE owner for what Remi tells the outside world about its shows.
 *
 * The GSD Breed Council website is a static Python build that kept its own
 * `REMI_SHOWS` dict — Remi slugs, venues and closing dates, typed by hand in
 * another repository. That is Remi's state written down twice, so it went
 * wrong the moment a show's entries closed and nothing in a static build
 * could know. Anything outside Remi that needs to know which shows exist
 * reads this instead.
 *
 * WHICH SHOWS. `PUBLIC_SHOW_STATUSES` — the existing owner of "statuses the
 * public may see", which already drives the Browse Shows filter and the
 * `shows.list` input enum. Deliberately NOT `upcomingShowsCondition()`: a
 * consumer wants past shows too, for their results links. Draft and
 * cancelled shows are absent because that constant leaves them out, which is
 * the whole reason it exists — a club's unannounced draft show carries its
 * secretary's contact details.
 *
 * LINKS ARE CANONICAL, not this deployment's own origin: a consumer is an
 * outside website sending real exhibitors to Remi, so a feed served from
 * demo must still hand out live remishowmanager.co.uk links rather than
 * pointing people at a demo running on a laptop. (On production the two
 * are the same string.)
 *
 * EVERY DERIVED FIELD CALLS ITS OWNER, none is recomputed here:
 * `publicShowStatus` (the badge-lag trap), `entryWindowOpen` ("can money
 * still be spent"), `showResultsState` + `showIdsWithPublishedResults`,
 * `displayShowTypeTitle` (a regional is not a Championship Show),
 * `entryCloseExtendedNotice`. A consumer that had to re-derive any of them
 * would be the duplication this file exists to remove.
 */
export type PublicShowFeedItem = {
  id: string;
  slug: string | null;
  name: string;
  /** Absolute link to the show's public page. */
  url: string;
  /** The stored type, for a consumer that wants to group or filter. */
  showType: string;
  /** What the type should PRINT as — "Regional Show", not "Championship Show". */
  showTypeLabel: string;
  club: { name: string; website: string | null };
  venue: { name: string; address: string | null; postcode: string | null } | null;
  startDate: string;
  endDate: string | null;
  /** The closing instant, ISO-8601 with an offset. Null when none is set. */
  entryCloseDate: string | null;
  /**
   * The same closing moment as the Europe/London CALENDAR date.
   *
   * Published alongside the instant because a consumer that reads only the
   * instant and takes its UTC date gets the previous day whenever entries
   * close at midnight British Summer Time — the UTC-date class of bug, moved
   * out into someone else's repository where our tests cannot see it. A
   * static site builder wanting "closes 1 Nov" wants this field.
   */
  entryCloseDateLondon: string | null;
  /** The public "entries have been extended" sentence, or null. */
  entriesExtendedNotice: string | null;
  /** The status as the public should read it, close-date lag included. */
  status: string;
  /** Can an entry actually be bought right now? */
  entriesOpen: boolean;
  results: ShowResultsState;
  /** Absolute link to the results page, only when there is one to read. */
  resultsUrl: string | null;
};

export async function listPublicShowFeed(
  db: Database,
  today: string = todayInLondon(),
): Promise<PublicShowFeedItem[]> {
  const rows = await db.query.shows.findMany({
    where: inArray(shows.status, [...PUBLIC_SHOW_STATUSES]),
    columns: {
      id: true,
      slug: true,
      name: true,
      showType: true,
      showRuleset: true,
      status: true,
      startDate: true,
      endDate: true,
      entryCloseDate: true,
      entryCloseExtendedFrom: true,
    },
    with: {
      organisation: { columns: publicOrgColumns },
      venue: { columns: { name: true, address: true, postcode: true } },
    },
    orderBy: [asc(shows.startDate)],
  });

  const published = await showIdsWithPublishedResults(
    db,
    rows.map((r) => r.id),
  );

  return rows.map((row) => {
    const results = showResultsState(row, published.has(row.id), today);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      url: canonicalUrl(showHref(row)),
      showType: row.showType,
      showTypeLabel: displayShowTypeTitle(row.showType, row.showRuleset),
      club: {
        name: row.organisation?.name ?? '',
        website: row.organisation?.website ?? null,
      },
      venue: row.venue
        ? { name: row.venue.name, address: row.venue.address, postcode: row.venue.postcode }
        : null,
      startDate: row.startDate,
      endDate: row.endDate,
      entryCloseDate: row.entryCloseDate ? row.entryCloseDate.toISOString() : null,
      entryCloseDateLondon: row.entryCloseDate ? londonCalendarDateStr(row.entryCloseDate) : null,
      entriesExtendedNotice: entryCloseExtendedNotice(row.entryCloseDate, row.entryCloseExtendedFrom),
      status: publicShowStatus(row, today),
      entriesOpen: entryWindowOpen(row),
      results,
      resultsUrl: results === 'none' ? null : canonicalUrl(showResultsHref(row)),
    };
  });
}
