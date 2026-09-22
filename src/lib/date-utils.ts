import { format, parseISO, formatDistanceToNow, differenceInMonths, isToday, isYesterday, addMonths } from 'date-fns';

/** Parse a YYYY-MM-DD date string as local (not UTC) — avoids off-by-one from ISO parsing.
 *  Also accepts Date objects and ISO timestamp strings so it's safe to pass superjson-hydrated
 *  values from tRPC responses where `date` columns return strings but `timestamp` columns
 *  return Date objects. */
export function parseLocalDate(dateInput: string | Date): Date {
  if (dateInput instanceof Date) return dateInput;
  // ISO timestamps contain "T" — hand them off to the Date constructor
  if (dateInput.includes('T')) return new Date(dateInput);
  const [y, m, d] = dateInput.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Formats a date range for display.
 * - Same day: "15 May 2025"
 * - Same month: "15–17 May 2025"
 * - Same year, different month: "30 Apr – 2 May 2025"
 * - Different years: "30 Dec 2025 – 2 Jan 2026"
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (startDate === endDate) {
    return format(start, 'd MMM yyyy');
  }
  if (
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear()
  ) {
    return `${format(start, 'd')}–${format(end, 'd')} ${format(end, 'MMM yyyy')}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
  }
  return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
}

/**
 * Formats a currency amount in pence to GBP display (e.g. 150050 → "£1,500.50").
 */
export function formatCurrency(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Converts a pounds value (e.g. 5.00) to pence (e.g. 500).
 * Rounds to the nearest penny to avoid floating-point issues.
 */
export function poundsToPence(pounds: number): number {
  return Math.round(pounds * 100);
}

/**
 * Converts a pence value (e.g. 500) to pounds (e.g. 5.00).
 */
export function penceToPounds(pence: number): number {
  return pence / 100;
}

/**
 * Formats a pence value as a pounds string for form inputs (e.g. 500 → "5.00").
 */
export function penceToPoundsString(pence: number): string {
  return (pence / 100).toFixed(2);
}

/**
 * Returns true if ageMonths falls within the nullable [min, max) window
 * used by class definitions. Inclusive lower, exclusive upper.
 *
 * Prefer {@link isAgeEligibleOnShowDay} when you have the DOB and show
 * date in hand — that variant is RKC-accurate on anniversary days.
 */
export function isWithinAgeRange(
  ageMonths: number,
  minAgeMonths: number | null,
  maxAgeMonths: number | null,
): boolean {
  const aboveMin = minAgeMonths === null || ageMonths >= minAgeMonths;
  const belowMax = maxAgeMonths === null || ageMonths < maxAgeMonths;
  return aboveMin && belowMax;
}

/**
 * Shared date-anchored bound check behind {@link isAgeEligibleOnShowDay} and
 * {@link getAgeEligibilityDetail} — returns which bound (if any) failed.
 * "Of six and not exceeding twelve calendar months" means the dog is in the
 * window on or before her 12-month anniversary day — Amanda 2026-05-28: a
 * dog whose first birthday IS the show day should still be eligible for
 * Puppy.
 *
 * Integer `differenceInMonths` floors, so `ageMonths < 12` wrongly
 * excludes the anniversary day and `ageMonths <= 12` wrongly INcludes
 * the following 27 days. The right test is date-anchored.
 */
function ageBoundFailure(
  dob: string | Date,
  showDate: string | Date,
  minAgeMonths: number | null,
  maxAgeMonths: number | null,
): 'min' | 'max' | null {
  const dobDate = typeof dob === 'string' ? parseLocalDate(dob) : dob;
  const show = typeof showDate === 'string' ? parseLocalDate(showDate) : showDate;
  if (minAgeMonths !== null && show < addMonths(dobDate, minAgeMonths)) return 'min';
  if (maxAgeMonths !== null && show > addMonths(dobDate, maxAgeMonths)) return 'max';
  return null;
}

/**
 * RKC-accurate class-eligibility check — see {@link ageBoundFailure} for the
 * anniversary-day semantics.
 */
export function isAgeEligibleOnShowDay(
  dob: string | Date,
  showDate: string | Date,
  minAgeMonths: number | null,
  maxAgeMonths: number | null,
): boolean {
  return ageBoundFailure(dob, showDate, minAgeMonths, maxAgeMonths) === null;
}

/**
 * Like {@link isAgeEligibleOnShowDay}, but when ineligible also reports which
 * bound failed — 'min' (too young) or 'max' (too old) — so callers can show
 * a specific reason without re-running the check per bound.
 */
export function getAgeEligibilityDetail(
  dob: string | Date,
  showDate: string | Date,
  minAgeMonths: number | null,
  maxAgeMonths: number | null,
): { eligible: boolean; failedBound: 'min' | 'max' | null } {
  const failedBound = ageBoundFailure(dob, showDate, minAgeMonths, maxAgeMonths);
  return { eligible: failedBound === null, failedBound };
}

/** A class the dog is being entered into, for competition age eligibility. */
export interface EntryClassForAgeCheck {
  name: string;
  type: string;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
}

/**
 * Age eligibility for a COMPETITION (non-NFC) entry, judged against the
 * specific class(es) the dog is entered in.
 *
 * The RKC minimum to compete is six months — EXCEPT Baby Puppy, an age class
 * "of four and less than six calendar months of age on the first day of the
 * show". A blanket "must be at least 6 months" gate therefore wrongly blocked
 * legitimate Baby Puppy entries and shooed them into NFC (Amanda 2026-07-18,
 * North East Regional).
 *
 * Rule: age-restricted classes (any class — regardless of type — that carries
 * its own min/max window) are judged on that window; every other competition
 * class keeps the six-month floor. Returns a user-facing message for the
 * first blocking class, or null when the dog is eligible for everything
 * entered.
 */
export function isAgeRestrictedClass(c: {
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
}): boolean {
  return c.minAgeMonths !== null || c.maxAgeMonths !== null;
}

export function getCompetitionAgeError(params: {
  dogName: string;
  dob: string | Date;
  showDate: string | Date;
  classes: EntryClassForAgeCheck[];
}): string | null {
  const { dogName, dob, showDate, classes } = params;
  const show = typeof showDate === 'string' ? parseLocalDate(showDate) : showDate;
  const born = typeof dob === 'string' ? parseLocalDate(dob) : dob;
  const ageMonths = differenceInMonths(show, born);

  const isAgeRestricted = isAgeRestrictedClass;

  // Age-restricted classes are judged on their own window (Baby Puppy 4–6mo).
  for (const c of classes.filter(isAgeRestricted)) {
    const { eligible, failedBound } = getAgeEligibilityDetail(
      born,
      show,
      c.minAgeMonths,
      c.maxAgeMonths,
    );
    if (eligible) continue;
    if (failedBound === 'max') {
      return `${dogName} will be ${ageMonths} months old on show day, which is too old for "${c.name}".`;
    }
    return `${dogName} will only be ${ageMonths} months old on show day — too young for "${c.name}". You can enter Not For Competition (NFC) instead.`;
  }

  // Every other competition class keeps the RKC six-month minimum. Also the
  // belt-and-braces floor when no class resolved (that empty case is rejected
  // elsewhere, but never regress to silently admitting an under-age dog).
  const hasNonAgeClass = classes.some((c) => !isAgeRestricted(c));
  if ((hasNonAgeClass || classes.length === 0) && ageMonths < 6) {
    if (ageMonths < 4) {
      return `${dogName} will only be ${ageMonths} months old on show day. Dogs must be at least 6 months old to enter competition classes, or at least 12 weeks old for Not For Competition (NFC) entries.`;
    }
    return `${dogName} will only be ${ageMonths} months old on show day. Dogs must be at least 6 months old for competition classes. You can enter Not For Competition (NFC) instead.`;
  }

  return null;
}

/**
 * Computes a handler's age in whole years on the show date.
 */
export function handlerAgeYearsOnDate(handlerDob: string, showDate: string): number {
  return Math.floor(differenceInMonths(new Date(showDate), new Date(handlerDob)) / 12);
}

/**
 * Converts any instant to the Europe/London calendar date it falls on, as a
 * YYYY-MM-DD string. {@link todayInLondon} delegates here for "now"; callers
 * with an arbitrary instant (e.g. entry-close-rules.ts, comparing a close
 * TIME rather than the current moment) use it directly so a BST/GMT boundary
 * can never shift which calendar day an instant lands on.
 */
export function londonCalendarDateStr(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Europe/London wall clock of an instant, broken into numbers. Module-level
 * formatter: it is pinned to Europe/London, so the process / browser zone
 * never enters into it. `hourCycle: 'h23'` so midnight is 00, never 24.
 */
const LONDON_WALL_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function londonWallClockParts(instant: Date) {
  const parts = LONDON_WALL_CLOCK.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/**
 * `Date.UTC` without its "years 0–99 mean 1900–1999" quirk: a date box being
 * typed into passes through years 0002, 0020, 0202 on its way to 2026.
 */
function utcMs(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  return d.getTime();
}

/** The London wall clock of `ms` written as if it were UTC — `wall - ms` is London's offset then. */
function londonWallClockAsUtcMs(ms: number): number {
  const p = londonWallClockParts(new Date(ms));
  return utcMs(p.year, p.month, p.day, p.hour, p.minute, p.second);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * THE ONE OWNER for turning a show's stored close (or open) instant into the
 * value its date + time boxes hold: `YYYY-MM-DDTHH:mm` in UK wall-clock time,
 * whatever zone the browser is in. The date box shows the first 10 chars, the
 * time box chars 11–16. Its inverse is {@link fromLondonDateTimeInput}; every
 * show-date form uses the pair and nothing else (guard:
 * src/__tests__/london-datetime-input.test.ts).
 *
 * Why it exists (2026-09-22): the edit-show dialog and the setup wizard filled
 * these boxes with `toISOString().slice(0, 16)` — the UTC clock — and saved
 * them back as browser-local time. In British Summer Time a 23:59 close showed
 * as 22:59 and every Save moved it an hour earlier; a 00:00 close became 23:00
 * the day before, so schedules printed the close date a day early.
 *
 * Seconds are dropped (the time box works in minutes).
 */
export function toLondonDateTimeInput(instant: Date | string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new RangeError(`Not a date/time: ${String(instant)}`);
  const p = londonWallClockParts(d);
  return `${String(p.year).padStart(4, '0')}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * Inverse of {@link toLondonDateTimeInput}: reads a form value as UK
 * wall-clock time and returns the instant it means, as an ISO string (what
 * shows.create / shows.update take). Accepts `YYYY-MM-DDTHH:mm` (optionally
 * `:ss`) or a bare `YYYY-MM-DD`, which means 00:00 UK time on that date.
 * Returns null for anything that is not a complete, real date/time — a
 * half-typed box, a 5-digit year, 30 February — so a check that runs while
 * the secretary is still typing can say "not yet" instead of throwing
 * (entry-close-rules `checkCloseInput`). Use {@link fromLondonDateTimeInput}
 * where a bad value is a bug.
 *
 * Never `new Date(value)`: a string with no offset is read in the BROWSER's
 * zone — right on a UK device, but hours out for a secretary working from
 * abroad (Mandy in Germany) or on a device set to another zone.
 *
 * Clock-change edges follow the usual ("compatible") convention: a time that
 * does not exist (01:30 on the spring-forward Sunday) moves forward by the
 * hour to 02:30 BST; a time that happens twice (01:30 on the autumn Sunday)
 * takes the first, BST, one.
 */
export function parseLondonDateTimeInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map((v) => (v === undefined ? 0 : Number(v))) as [
    number, number, number, number, number, number,
  ];
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const wall = utcMs(year, month, day, hour, minute, second);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null; // e.g. 30 February
  }

  // London's offset is one of two values around any date; take them from a
  // day either side (clock changes are months apart) and keep the instants
  // whose London wall clock really is `wall`.
  const DAY_MS = 86_400_000;
  const offsetBefore = londonWallClockAsUtcMs(wall - DAY_MS) - (wall - DAY_MS);
  const offsetAfter = londonWallClockAsUtcMs(wall + DAY_MS) - (wall + DAY_MS);
  const matches = [wall - offsetBefore, wall - offsetAfter]
    .filter((t) => londonWallClockAsUtcMs(t) === wall)
    .sort((a, b) => a - b);
  // No match = the spring-forward gap: keep the pre-change offset, which
  // lands the same number of minutes after the jump.
  const instant = matches[0] ?? wall - offsetBefore;
  return new Date(instant).toISOString();
}

/**
 * {@link parseLondonDateTimeInput} for Save / create, where the value has
 * already been checked: throws a RangeError on anything that is not a
 * complete real date/time (as `new Date(bad).toISOString()` did), so a
 * malformed value can never be saved as some other instant.
 */
export function fromLondonDateTimeInput(value: string): string {
  const iso = parseLondonDateTimeInput(value);
  if (iso === null) throw new RangeError(`Not a real UK date/time: "${value}"`);
  return iso;
}

/**
 * Founder rule (Mandy, 2026-07-23 — commit 44ffeaad): "whatever date they
 * choose, it's 11:59pm unless they specifically change it". Read it through
 * {@link closeInputForPickedDate} / {@link closeInputTime}, never as a literal.
 */
export const DEFAULT_CLOSE_TIME = '23:59';

/**
 * THE ONE OWNER for "a picked entry-close / postal-close date means 23:59 UK
 * time on that date". Returns the `YYYY-MM-DDTHH:mm` form value (UK wall
 * clock — see {@link toLondonDateTimeInput}) for `date` (`YYYY-MM-DD`) at
 * `time`, or at {@link DEFAULT_CLOSE_TIME} when no time is given or the time
 * box was cleared. The edit dialog and setup wizard hold this value; the
 * new-show wizard turns its picked dates into instants with
 * `fromLondonDateTimeInput(closeInputForPickedDate(date))`.
 *
 * Before 2026-09-22 the edit forms wrote `${date}T23:59` by hand seven times
 * and the new-show wizard stored 00:00 — entries closed at the START of the
 * last day the schedule advertised. Entries OPEN at 00:00, so the entries-open
 * date does not come through here.
 */
export function closeInputForPickedDate(date: string, time?: string): string {
  return `${date}T${time || DEFAULT_CLOSE_TIME}`;
}

/** The date box's value (`YYYY-MM-DD`) for a close form value. */
export function closeInputDate(closeInput: string): string {
  return closeInput.slice(0, 10);
}

/** The time box's value (`HH:mm`) for a close form value; the default close time while no date is set. */
export function closeInputTime(closeInput: string): string {
  return closeInput.length >= 16 ? closeInput.slice(11, 16) : DEFAULT_CLOSE_TIME;
}

/**
 * Formats any instant (a Date, an ISO timestamp string, or a plain
 * YYYY-MM-DD date-only string) as a human date string, ALWAYS anchored to
 * the Europe/London calendar day — never the process's local timezone.
 *
 * Production runs in UTC (Render). `entriesOpenDate`/`entryCloseDate`/
 * `postalCloseDate` are `timestamptz` columns that store a specific UK
 * wall-clock instant (e.g. `2026-07-17T23:00:00Z` = 18 July 00:00 BST) —
 * every printed document (schedule, catalogue, reports, invoices, judges
 * book, prize cards…) must show the UK date an exhibitor would recognise,
 * not whichever day that instant happens to fall on in the server's own
 * timezone. Confirmed live 2026-09-03: the same BAGSD schedule printed
 * "26 April" (open) / "18 June" (close) on the UTC server but "27 April" /
 * "19 June" when rendered in London time — the correct dates.
 *
 * Safe for date-only strings too: `new Date('2026-08-29')` is UTC
 * midnight, and Europe/London is always UTC or UTC+1, so formatting it in
 * Europe/London can only move the wall-clock time later within the same
 * calendar day — it never shifts the date backward. So routing every
 * document date through this (rather than only the timestamptz fields)
 * costs nothing and removes an entire class of "which TZ is this box in"
 * bugs at once.
 */
export function formatLondonDate(
  instant: Date | string,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'Europe/London' }).format(d);
}

/** Long form used on schedule/catalogue cover pages: "Saturday, 27 April 2026"
 *  (`Intl.DateTimeFormat`'s en-GB long-weekday form always inserts the
 *  comma — the same as the `toLocaleDateString('en-GB', {weekday:'long',...})`
 *  calls this replaces, so it matches what those call sites already printed). */
export function formatLondonLongDate(instant: Date | string): string {
  return formatLondonDate(instant, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Same long form WITHOUT the comma: "Saturday 27 April 2026" — matches the
 *  date-fns `format(d, 'EEEE d MMMM yyyy')` convention used by a few report/
 *  invoice call sites, so moving those to Europe/London-safe formatting
 *  doesn't also silently insert a comma that wasn't there before. */
export function formatLondonLongDateNoComma(instant: Date | string): string {
  return formatLondonLongDate(instant).replace(', ', ' ');
}

/** Short form used for key-dates lists: "27 April 2026" (no weekday). */
export function formatLondonShortDate(instant: Date | string): string {
  return formatLondonDate(instant, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Abbreviated form for dense tables: "Sun 27 Apr 2026". */
export function formatLondonAbbrevDate(instant: Date | string): string {
  return formatLondonDate(instant, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** dd/MM/yyyy in Europe/London, e.g. SH01/SV results report headers. */
export function formatLondonDateSlash(instant: Date | string): string {
  const [y, m, d] = londonCalendarDateStr(typeof instant === 'string' ? new Date(instant) : instant).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Returns today's date in Europe/London as a YYYY-MM-DD string.
 * Comparing this to `shows.startDate` (also YYYY-MM-DD) avoids every UTC/BST
 * edge case that arises from constructing Date objects from date-only strings.
 */
export function todayInLondon(): string {
  return londonCalendarDateStr(new Date());
}

/**
 * YYYY-MM-DD string for `days` from today, computed on the Europe/London
 * calendar date (not a raw UTC/wall-clock offset) — the timezone-safe way to
 * build a comparison bound against DATE columns like shows.start_date, e.g.
 * "is this show within the next 7 days". Companion to todayInLondon().
 */
export function londonDateOffset(days: number): string {
  const parts = todayInLondon().split('-').map(Number);
  const [y, m, d] = parts as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * True once it's the morning of the show (UK time) or later.
 * Gates exhibit visibility for stewards and the public dog-photo feed —
 * admins and host-club secretaries always bypass this check at the call site.
 */
export function isShowDayReached(startDate: string): boolean {
  return todayInLondon() >= startDate;
}

/**
 * Formats an entries-close timestamp's TIME as a human phrase, always in
 * UK time regardless of the viewer's timezone (shows are UK events):
 * 23:59 or 00:00 → "midnight", 12:00 → "noon", otherwise "5pm" / "12:30pm".
 * Mandy 2026-07-21: countdowns showed the close DATE but not the time, and
 * exhibitors (and secretaries) genuinely didn't know when the door shut.
 */
export function formatCloseTimeUK(date: Date): string {
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  const [h, m] = hm.split(':').map(Number);
  // Mandy 2026-07-23: show "23:59" rather than "midnight" — midnight is
  // ambiguous about WHICH day it belongs to, the very confusion this
  // feature exists to kill. 24h digits for the edge times, friendly 12h
  // words for everything else.
  if (h === 23 && m === 59) return '23:59';
  if (h === 0 && m === 0) return '00:00';
  if (h === 12 && m === 0) return 'noon';
  const hour12 = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'am' : 'pm';
  return m === 0 ? `${hour12}${ampm}` : `${hour12}:${String(m).padStart(2, '0')}${ampm}`;
}

/**
 * Formats a date as a human-friendly relative string.
 * - Today: "Today at 3:15 PM"
 * - Yesterday: "Yesterday"
 * - Within 7 days: "3 days ago"
 * - Older (same year): "15 March"
 * - Older (different year): "15 March 2024"
 */
export function formatRelativeDate(date: Date): string {
  if (isToday(date)) return `Today at ${format(date, 'h:mm a')}`;
  if (isYesterday(date)) return 'Yesterday';
  const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff < 7) return formatDistanceToNow(date, { addSuffix: true });
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();
  return year === currentYear
    ? format(date, 'd MMMM')
    : format(date, 'd MMMM yyyy');
}
