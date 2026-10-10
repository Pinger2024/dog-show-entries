import { and, asc, desc, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { entries, entryClasses, results, shows } from '@/server/db/schema';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
import { showResultsState } from '@/lib/show-status';
import { todayInLondon } from '@/lib/date-utils';
import { upcomingShowsCondition } from './upcoming-shows';

/**
 * ONE owner for "has this show published any results" — the show page's Live
 * Results button and the public Results page both read it from here, so a
 * show never has a results link in one place and not the other.
 */
export async function showIdsWithPublishedResults(db: Database, showIds: string[]): Promise<Set<string>> {
  if (showIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ showId: entries.showId })
    .from(results)
    .innerJoin(entryClasses, eq(entryClasses.id, results.entryClassId))
    .innerJoin(entries, eq(entries.id, entryClasses.entryId))
    .where(and(inArray(entries.showId, showIds), isNotNull(results.publishedAt)));
  return new Set(rows.map((r) => r.showId));
}

export type ResultsShow = {
  id: string;
  slug: string | null;
  name: string;
  startDate: string;
  endDate: string | null;
  clubName: string | null;
  venueName: string | null;
};

const RECENT_LIMIT = 60;

/**
 * The public Results page (Mandy, 5 Oct 2026): shows running today first, then
 * shows with published results to look back at, newest first, then the next show
 * coming up so a visitor on a quiet day knows when to come back. Never a draft
 * or cancelled show, and only the club's public columns.
 */
export async function listResultsShows(
  db: Database,
  today: string = todayInLondon(),
): Promise<{ live: ResultsShow[]; recent: ResultsShow[]; next: ResultsShow | null }> {
  const columns = {
    id: true,
    slug: true,
    name: true,
    startDate: true,
    endDate: true,
    status: true,
    entryCloseDate: true,
  } as const;
  const withClubAndVenue = {
    organisation: { columns: publicOrgColumns },
    venue: { columns: { name: true } },
  } as const;

  const held = await db.query.shows.findMany({
    where: inArray(shows.status, ['entries_open', 'entries_closed', 'in_progress', 'completed']),
    columns,
    with: withClubAndVenue,
    orderBy: [desc(shows.startDate)],
  });
  const published = await showIdsWithPublishedResults(
    db,
    held.map((s) => s.id),
  );

  const toItem = (s: (typeof held)[number]): ResultsShow => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    clubName: s.organisation?.name ?? null,
    venueName: s.venue?.name ?? null,
  });

  const states = held.map((s) => ({ show: s, state: showResultsState(s, published.has(s.id), today) }));
  const live = states.filter((x) => x.state === 'live').map((x) => toItem(x.show));
  const recent = states
    .filter((x) => x.state === 'available')
    .slice(0, RECENT_LIMIT)
    .map((x) => toItem(x.show));

  const upcoming = await db.query.shows.findFirst({
    where: and(upcomingShowsCondition(today), gt(shows.startDate, today)),
    columns,
    with: withClubAndVenue,
    orderBy: [asc(shows.startDate)],
  });

  return { live, recent, next: upcoming ? toItem(upcoming) : null };
}
