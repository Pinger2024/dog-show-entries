import { and, gte, inArray } from 'drizzle-orm';
import { shows } from '@/server/db/schema';
import { UPCOMING_SHOW_STATUSES } from '@/lib/show-status';
import { todayInLondon } from '@/lib/date-utils';

/**
 * ONE owner for "which shows are upcoming" — Find a Show's default list, "near
 * me", the /shows JSON-LD and the Results page's "next show" all call this
 * (guarded by upcoming-shows-one-owner.test.ts).
 *
 * A show is upcoming until the end of its LAST day, London time: a multi-day
 * show stays listed on its second day, and a show whose status was never moved
 * on doesn't linger once its dates have passed. Mandy, 7 Oct 2026: it stays
 * visible with entries closed right up to the day.
 */
export function upcomingShowsCondition(today: string = todayInLondon()) {
  return and(inArray(shows.status, [...UPCOMING_SHOW_STATUSES]), gte(shows.endDate, today));
}
