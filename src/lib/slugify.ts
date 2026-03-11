/**
 * Generate a URL-friendly slug from a show name and start date.
 * e.g. "Clyde Valley GSD Open Show" + "2026-03-15" → "clyde-valley-gsd-open-show-2026"
 */
export function generateShowSlug(name: string, startDate: string): string {
  const year = startDate.slice(0, 4);
  const base = name
    .toLowerCase()
    .replace(/['']/g, '')           // remove apostrophes
    .replace(/&/g, 'and')           // & → and
    .replace(/[^a-z0-9]+/g, '-')    // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, '');       // trim leading/trailing hyphens

  return `${base}-${year}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Test whether a string looks like a UUID v4 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
