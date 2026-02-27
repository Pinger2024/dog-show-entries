import { format, parseISO } from 'date-fns';

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
 * Formats a currency amount in pence to GBP display.
 */
export function formatCurrency(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
