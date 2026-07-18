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
 * Rule: age-restricted classes (type 'age' / 'sv_age' that carry their own
 * min/max window) are judged on that window; every other competition class
 * keeps the six-month floor. Returns a user-facing message for the first
 * blocking class, or null when the dog is eligible for everything entered.
 */
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

  const isAgeRestricted = (c: EntryClassForAgeCheck) =>
    (c.type === 'age' || c.type === 'sv_age') &&
    (c.minAgeMonths !== null || c.maxAgeMonths !== null);

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
 * Returns today's date in Europe/London as a YYYY-MM-DD string.
 * Comparing this to `shows.startDate` (also YYYY-MM-DD) avoids every UTC/BST
 * edge case that arises from constructing Date objects from date-only strings.
 */
export function todayInLondon(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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
