import { format, parseISO, formatDistanceToNow, differenceInMonths, isToday, isYesterday } from 'date-fns';

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
 * Computes a handler's age in whole years on the show date.
 */
export function handlerAgeYearsOnDate(handlerDob: string, showDate: string): number {
  return Math.floor(differenceInMonths(new Date(showDate), new Date(handlerDob)) / 12);
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
