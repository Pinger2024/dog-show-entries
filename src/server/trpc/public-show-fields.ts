import type { ScheduleData } from '@/server/db/schema/shows';

/**
 * What of a show row may leave the server outside the club's own screens.
 *
 * Bug hunt 2026-09-22: `scheduleData.guarantors[].address` — guarantors' HOME
 * addresses, entered for the RKC licence and deliberately never printed on
 * the schedule or catalogue — went out in every public show payload
 * (shows.list, shows.getById) and in exhibitor payloads that embed the whole
 * show row (entries, orders, dashboard, dog profile, timeline, steward list).
 * The secretary's schedule settings form is the only reader.
 *
 * Two tools, one rule:
 *  - `toPublicScheduleData` — where the public page genuinely renders
 *    scheduleData (shows.getById for non-members, shows.list): keeps it all
 *    except guarantor addresses.
 *  - `SHOW_COLUMNS_FOR_PUBLIC_INCLUDE` — every other public/exhibitor include
 *    of a show row: those payloads never read scheduleData, so it is left out.
 * Guard: public-show-fields.test.ts.
 */
export function toPublicScheduleData<T extends ScheduleData | null | undefined>(scheduleData: T): T {
  if (!scheduleData?.guarantors) return scheduleData;
  return {
    ...scheduleData,
    guarantors: scheduleData.guarantors.map(({ name }) => ({ name })),
  } as T;
}

/** Drizzle `columns` for a show row embedded in a public or exhibitor payload. */
export const SHOW_COLUMNS_FOR_PUBLIC_INCLUDE = { scheduleData: false } as const;
