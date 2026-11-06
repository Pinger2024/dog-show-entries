import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { parseLocalDate, londonCalendarDateStr, parseLondonDateTimeInput } from './date-utils';
import { getRkcRegulationYear } from './rkc-schedule-profile';

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

/**
 * Which of a show's two closing dates a message, check or hint is about.
 * The strings ARE the words the secretary reads, so they belong to one
 * type rather than being retyped at each call site (they were, four times).
 */
export type CloseDateField = 'entry close date' | 'postal close date';

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
  field: CloseDateField,
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
 * What a secretary is allowed to do with ONE of the two closing dates, in her
 * words, beside that date's picker.
 *
 * This is date-keyed, not a flat "you can extend it" — because before 1
 * January 2027 the club needed the RKC's permission for BOTH dates, and a
 * 2026 show must not be told otherwise. The cut-over has one owner,
 * `getRkcRegulationYear`, which reads the show's FIRST DAY (a January 2027
 * show is edited in 2026 and already follows the new rule).
 *
 * Returns null where there is nothing to say — a regional, which is not
 * RKC-licensed, so the F regulations do not apply — so a caller can render
 * it or not without repeating the test.
 */
export function closeDateChangeHint(params: {
  field: CloseDateField;
  startDate: string | null | undefined;
  showRuleset?: string | null;
}): string | null {
  if (params.showRuleset === 'wusv') return null;
  const needsPermission =
    'Remi will let you change this, but the RKC must approve it and the change has to be advertised in the canine press.';
  // The 2027 amendment freed the ONLINE date only: moving the postal one
  // still needs the RKC's permission plus a canine-press advertisement, in
  // 2027 exactly as in 2026.
  if (params.field === 'postal close date') return needsPermission;
  if (getRkcRegulationYear(params.startDate) < 2027) return needsPermission;
  return 'You can extend this yourself \u2014 since 2027 the RKC no longer needs to approve a later ONLINE closing date. Entries already taken are unaffected, and the show page will say entries have been extended.';
}

/**
 * F(1)7.d as amended for 2027: a club may extend its ONLINE closing date
 * without the RKC's permission. (Moving the POSTAL closing date still needs
 * permission plus an advertisement in the canine press — that distinction is
 * the whole point of the amendment, and Remi used to treat the two dates
 * identically.)
 *
 * Mandy, 26 Oct 2026: show the extension publicly with the new date; do NOT
 * email people who have already entered — they have nothing to act on.
 *
 * To say "entries have been extended" at all, we have to remember what the
 * date WAS. `shows.entryCloseExtendedFrom` holds the ORIGINAL closing date,
 * and this function is the one owner of when it is set, kept and cleared:
 *
 *  - moved LATER, nothing recorded yet → remember the date it was moved from;
 *  - moved LATER again → keep the FIRST original, so the notice always
 *    compares against where the club started, not the last hop;
 *  - pulled back to the original or earlier → clear it; the show is no longer
 *    extended and must stop saying so;
 *  - a close date cleared, or set for the first time → nothing to extend from.
 *
 * All comparisons are on the instant, not the calendar day: a club that moves
 * the closing time from 12:00 to 23:59 on the same day HAS extended entries,
 * and an exhibitor refreshing at teatime needs to be told.
 */
export function resolveEntryCloseExtension(params: {
  /** The closing date currently stored on the show (null = none set). */
  storedClose: Date | string | null | undefined;
  /** The closing date this update is about to write (null = cleared). */
  nextClose: Date | string | null | undefined;
  /** What `entryCloseExtendedFrom` holds today. */
  storedExtendedFrom: Date | string | null | undefined;
}): Date | null {
  const toDate = (v: Date | string | null | undefined): Date | null => {
    if (v == null) return null;
    const d = typeof v === 'string' ? new Date(v) : v;
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const stored = toDate(params.storedClose);
  const next = toDate(params.nextClose);
  const extendedFrom = toDate(params.storedExtendedFrom);

  // No closing date to speak of either side — nothing is extended.
  if (next === null || stored === null) return null;

  if (next.getTime() > stored.getTime()) {
    return extendedFrom ?? stored;
  }

  // Pulled back in (or unchanged). Once it is back at or before where it
  // started, the show is not extended any more.
  if (extendedFrom !== null && next.getTime() <= extendedFrom.getTime()) return null;
  return extendedFrom;
}

/**
 * The public, plain-words notice for an extended closing date — "Entries have
 * been extended" plus the new date, in the voice the show page uses. Returns
 * null when the show is not extended, so a caller can render it or not
 * without repeating the test.
 *
 * One owner so the show page, and anything that comes after it, cannot word
 * this differently.
 */
export function entryCloseExtendedNotice(
  entryCloseDate: Date | string | null | undefined,
  entryCloseExtendedFrom: Date | string | null | undefined,
): string | null {
  if (!entryCloseDate || !entryCloseExtendedFrom) return null;
  const close = typeof entryCloseDate === 'string' ? new Date(entryCloseDate) : entryCloseDate;
  if (Number.isNaN(close.getTime())) return null;
  // Europe/London explicitly, not the viewer's (or the server's) zone: a
  // closing instant of 23:59 UK reads as the NEXT day to anyone an hour
  // east, and this sentence is the one telling them when the door shuts.
  // Same reasoning as `formatCloseTimeUK` (src/lib/date-utils.ts).
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(close);
  return `Entries have been extended — they now close on ${day}.`;
}

/**
 * Plain-English explanation of the floor breach, shared by every call site
 * (shows.create, shows.update, the entries_open precondition) so a secretary
 * sees the same wording wherever it's caught. `field` names which date
 * breached the floor.
 */
export function entryCloseFloorMessage(
  startDate: string,
  field: CloseDateField = 'entry close date',
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
  field: CloseDateField,
  adjustedDate: Date,
): string {
  const fieldLabel = field === 'entry close date' ? 'Entry close date' : 'Postal close date';
  const dateLabel = format(adjustedDate, 'd MMMM yyyy');
  return `${fieldLabel} adjusted to ${dateLabel} — entries must close at least two weeks before the show`;
}
