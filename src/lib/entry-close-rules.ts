import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { parseLocalDate, londonCalendarDateStr, parseLondonDateTimeInput } from './date-utils';

/**
 * Mandy's hard rule (2026-08-04, "two weeks give or take a day"): a show's entry
 * close date — and its postal close date — must be at least this many CALENDAR
 * days before the show start date, for every show type. A show on Saturday the
 * 29th may close no later than midnight Sunday the 16th (13 calendar days).
 */
export const MIN_DAYS_BEFORE_SHOW_START = 13;

/**
 * The latest entry-close (or postal-close) calendar date permitted for a show
 * starting on `startDate` (a YYYY-MM-DD show date, London wall-clock) — i.e.
 * `startDate` minus {@link MIN_DAYS_BEFORE_SHOW_START} calendar days.
 */
export function latestPermissibleCloseDate(startDate: string): Date {
  return subDays(parseLocalDate(startDate), MIN_DAYS_BEFORE_SHOW_START);
}

/**
 * {@link latestPermissibleCloseDate}, formatted as YYYY-MM-DD for native
 * `<input type="date" max="">` attributes — the four close-date pickers
 * (new-show wizard, setup wizard, edit-show dialog) all want this exact
 * string form so the calendar UI physically can't offer a non-compliant
 * date.
 */
export function latestPermissibleCloseDateInputValue(startDate: string): string {
  return format(latestPermissibleCloseDate(startDate), 'yyyy-MM-dd');
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

/** Result of {@link checkCloseInput}. */
export type CloseInputCheck =
  | { ok: true; instant: string | null }
  | { ok: false; reason: 'incomplete' | 'too-late'; message: string };

/**
 * THE check for an entry-close / postal-close value AS THE FORMS HOLD IT —
 * UK wall clock `YYYY-MM-DDTHH:mm` (see `toLondonDateTimeInput` /
 * `closeInputForPickedDate` in date-utils). Every form path uses it: the edit
 * dialog and setup wizard on change and on Save, the start-date auto-adjust,
 * and the new-show wizard's validation.
 *
 * - `''` → ok, no close date (`instant: null`).
 * - Not a complete real date yet — a half-typed box, a 5-digit year —
 *   → `reason: 'incomplete'`. Never a throw: this runs while the secretary
 *   is typing. On change, wait quietly; on Save / validation, show `message`.
 * - Inside the {@link MIN_DAYS_BEFORE_SHOW_START} floor → `reason:
 *   'too-late'` with the same {@link entryCloseFloorMessage} the server uses.
 * - Otherwise ok, with the exact instant to send (`instant`), so the value
 *   checked is the value saved.
 *
 * With no `startDate` yet, only the "real date" part is checked.
 */
export function checkCloseInput(
  closeInput: string,
  startDate: string | null | undefined,
  field: 'entry close date' | 'postal close date',
): CloseInputCheck {
  if (!closeInput) return { ok: true, instant: null };
  const instant = parseLondonDateTimeInput(closeInput);
  if (instant === null) {
    return {
      ok: false,
      reason: 'incomplete',
      message: `The ${field} isn't a full date yet — please pick it again from the calendar.`,
    };
  }
  if (startDate && !isCloseDateWithinFloor(instant, startDate)) {
    return { ok: false, reason: 'too-late', message: entryCloseFloorMessage(startDate, field) };
  }
  return { ok: true, instant };
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

/**
 * Toast copy for an auto-adjust: shown when moving a show's start date pulls
 * an already-set close date inside the floor, so the form nudges it back to
 * {@link latestPermissibleCloseDate} rather than silently leaving an invalid
 * gap for the secretary to discover on Save. One canonical wording (shared by
 * the entry-close and postal-close fields, which previously hand-wrote this
 * string twice and could drift).
 */
export function entryCloseAdjustedMessage(
  field: 'entry close date' | 'postal close date',
  adjustedDate: Date,
): string {
  const fieldLabel = field === 'entry close date' ? 'Entry close date' : 'Postal close date';
  const dateLabel = format(adjustedDate, 'd MMMM yyyy');
  return `${fieldLabel} adjusted to ${dateLabel} — entries must close at least two weeks before the show`;
}
