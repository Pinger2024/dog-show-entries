/**
 * Generate a valid RFC 5545 iCalendar (.ics) string for a show event.
 */

export interface CalendarEventInput {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime?: string | null; // HH:MM
  endTime?: string | null;
  venue?: string | null;
  address?: string | null;
  postcode?: string | null;
  description?: string | null;
  url: string;
  organizer?: string | null;
}

/** Escape special characters per RFC 5545 (commas, semicolons, backslashes, newlines). */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold long lines at 75 octets per RFC 5545 Section 3.1.
 * Continuation lines begin with a single space.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;

  const parts: string[] = [];
  parts.push(line.slice(0, 75));
  let offset = 75;

  while (offset < line.length) {
    // Continuation lines start with a space, leaving 74 chars for content
    parts.push(' ' + line.slice(offset, offset + 74));
    offset += 74;
  }

  return parts.join('\r\n');
}

/** Format a date string (YYYY-MM-DD) as an all-day ICS value (YYYYMMDD). */
function formatAllDayDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/**
 * Format a date + time as a local datetime value (YYYYMMDDTHHmmSS).
 * Times are treated as UK local time.
 */
function formatDateTime(dateStr: string, timeStr: string): string {
  const [hours, minutes] = timeStr.split(':');
  return `${dateStr.replace(/-/g, '')}T${hours}${minutes}00`;
}

/**
 * Generate a deterministic UID from the event URL.
 * Uses a simple hash to produce a stable identifier.
 */
function generateUid(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `remi-${hex}@remishowmanager.co.uk`;
}

/** Build a LOCATION string from venue, address, and postcode parts. */
function buildLocation(
  venue?: string | null,
  address?: string | null,
  postcode?: string | null
): string | null {
  const parts = [venue, address, postcode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Generate a UTC timestamp string for DTSTAMP (YYYYMMDDTHHmmSSZ). */
function formatUtcNow(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const s = String(now.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

/**
 * For all-day events, DTEND should be the day AFTER the last day
 * (iCalendar all-day DTEND is exclusive).
 */
function nextDay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function generateIcs(input: CalendarEventInput): string {
  const lines: string[] = [];

  const addLine = (line: string) => {
    lines.push(foldLine(line));
  };

  addLine('BEGIN:VCALENDAR');
  addLine('VERSION:2.0');
  addLine('PRODID:-//Remi Show Manager//EN');
  addLine('CALSCALE:GREGORIAN');
  addLine('METHOD:PUBLISH');
  addLine('BEGIN:VEVENT');

  addLine(`UID:${generateUid(input.url)}`);
  addLine(`DTSTAMP:${formatUtcNow()}`);

  const hasStartTime = input.startTime != null && input.startTime.length > 0;
  const hasEndTime = input.endTime != null && input.endTime.length > 0;

  if (hasStartTime) {
    addLine(`DTSTART;TZID=Europe/London:${formatDateTime(input.startDate, input.startTime!)}`);
    if (hasEndTime) {
      addLine(`DTEND;TZID=Europe/London:${formatDateTime(input.endDate, input.endTime!)}`);
    } else {
      // If we have a start time but no end time, use end of the last day
      addLine(`DTEND;TZID=Europe/London:${formatDateTime(input.endDate, '23:59')}`);
    }
  } else {
    // All-day event — DTEND is exclusive (day after last day)
    addLine(`DTSTART;VALUE=DATE:${formatAllDayDate(input.startDate)}`);
    addLine(`DTEND;VALUE=DATE:${formatAllDayDate(nextDay(input.endDate))}`);
  }

  addLine(`SUMMARY:${escapeIcsText(input.name)}`);

  const location = buildLocation(input.venue, input.address, input.postcode);
  if (location) {
    addLine(`LOCATION:${escapeIcsText(location)}`);
  }

  // Build description: custom text + link back to Remi
  const descParts: string[] = [];
  if (input.description) {
    descParts.push(input.description);
  }
  if (input.organizer) {
    descParts.push(`Organised by ${input.organizer}`);
  }
  descParts.push(`View on Remi: ${input.url}`);
  addLine(`DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`);

  addLine(`URL:${input.url}`);

  addLine('END:VEVENT');
  addLine('END:VCALENDAR');

  // iCalendar requires CRLF line endings
  return lines.join('\r\n') + '\r\n';
}
