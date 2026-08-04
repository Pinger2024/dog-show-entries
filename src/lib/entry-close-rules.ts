import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { parseLocalDate } from './date-utils';

/**
 * Mandy's hard rule (2026-08-04, "two weeks give or take a day"): a show's entry
 * close date — and its postal close date — must be at least this many CALENDAR
 * days before the show start date, for every show type. A show on Saturday the
 * 29th may close no later than midnight Sunday the 16th (13 calendar days).
 */
export const MIN_DAYS_BEFORE_SHOW_START = 13;

/**
 * Converts an entry-close / postal-close instant to the UK calendar date it
 * falls on. Same Europe/London convention as {@link todayInLondon} in
 * date-utils.ts, applied to an arbitrary instant rather than "now" — so a
 * BST/GMT boundary can never shift which calendar day a close time lands on,
 * and a raw UTC 'Z' timestamp near midnight doesn't get miscounted.
 */
function londonCalendarDateStr(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * The latest entry-close (or postal-close) calendar date permitted for a show
 * starting on `startDate` (a YYYY-MM-DD show date, London wall-clock) — i.e.
 * `startDate` minus {@link MIN_DAYS_BEFORE_SHOW_START} calendar days.
 */
export function latestPermissibleCloseDate(startDate: string): Date {
  return subDays(parseLocalDate(startDate), MIN_DAYS_BEFORE_SHOW_START);
}

/**
 * True when `closeDate` (an entryCloseDate/postalCloseDate instant — ISO
 * datetime string or Date) respects the {@link MIN_DAYS_BEFORE_SHOW_START}
 * calendar-day floor before `startDate` (a YYYY-MM-DD show date).
 *
 * Calendar-day arithmetic, not millisecond arithmetic: `startDate` parses to
 * local midnight (see {@link parseLocalDate}), so naively subtracting
 * `MIN_DAYS_BEFORE_SHOW_START * 24h` in milliseconds and comparing raw
 * timestamps would wrongly REJECT a close time of 23:59 on the boundary day
 * — that instant is almost a full day after the show-start-minus-13-days
 * midnight it's being measured against, even though it's the same calendar
 * day. Comparing calendar dates (via {@link differenceInCalendarDays}) fixes
 * that: a close date/time anywhere on the boundary day passes.
 */
export function isCloseDateWithinFloor(
  closeDate: string | Date,
  startDate: string,
): boolean {
  const closeInstant = typeof closeDate === 'string' ? new Date(closeDate) : closeDate;
  const closeCalendarDate = parseLocalDate(londonCalendarDateStr(closeInstant));
  const showStart = parseLocalDate(startDate);
  return differenceInCalendarDays(showStart, closeCalendarDate) >= MIN_DAYS_BEFORE_SHOW_START;
}

/**
 * Plain-English explanation of the floor breach, shared by every call site
 * (shows.create, shows.update, the entries_open precondition) so a secretary
 * sees the same wording wherever it's caught. `field` names which date
 * breached the floor.
 */
export function entryCloseFloorMessage(
  startDate: string,
  field: 'entry close date' | 'postal close date' = 'entry close date',
): string {
  const showStartLabel = format(parseLocalDate(startDate), 'd MMMM yyyy');
  const latestLabel = format(latestPermissibleCloseDate(startDate), 'd MMMM yyyy');
  return `Entries must close at least two weeks before the show. For a show on ${showStartLabel} the latest ${field} is ${latestLabel} — update your ${field} first.`;
}

/**
 * Proactive, non-error hint naming the concrete latest permissible close
 * date for a show starting on `startDate` — shown near the entry-close /
 * postal-close date pickers so a secretary learns the floor while filling
 * in the form, before ever reaching the reject-on-save error above. Same
 * underlying date ({@link latestPermissibleCloseDate}), softer voice.
 * Day-of-week + day + month, no year — e.g. "For a show on Saturday 29
 * August, entries must close by Sunday 16 August."
 */
export function entryCloseHint(startDate: string): string {
  const showStartLabel = format(parseLocalDate(startDate), 'EEEE d MMMM');
  const latestLabel = format(latestPermissibleCloseDate(startDate), 'EEEE d MMMM');
  return `For a show on ${showStartLabel}, entries must close by ${latestLabel}.`;
}
