/**
 * Officer ordering for the schedule's "Officers & Committee" panel.
 *
 * Amanda asked for a canonical order (2026-05-19) so the schedule always
 * reads top-down by hierarchy regardless of the order the secretary typed
 * the rows in.
 */

export interface Officer {
  name: string;
  position: string;
}

/** Lower numbers render first. Anything not listed (custom roles) goes after
 *  the known ones, alphabetical by position. "Honorary Secretary" sits with
 *  "Secretary" so clubs that use the formal name don't get demoted. */
const ROLE_ORDER: Array<{ match: (p: string) => boolean; rank: number }> = [
  { match: (p) => p === 'president', rank: 10 },
  { match: (p) => p === 'vice president', rank: 20 },
  { match: (p) => p === 'chairman' || p === 'chair' || p === 'chairperson', rank: 30 },
  { match: (p) => p === 'vice chairman' || p === 'vice chair' || p === 'vice chairperson', rank: 40 },
  { match: (p) => p === 'treasurer' || p === 'honorary treasurer', rank: 50 },
  { match: (p) => p === 'secretary' || p === 'honorary secretary', rank: 60 },
  { match: (p) => p === 'show secretary', rank: 70 },
  { match: (p) => p === 'committee member' || p === 'committee', rank: 80 },
];

function rankFor(position: string): number {
  const normalised = position.trim().toLowerCase();
  for (const { match, rank } of ROLE_ORDER) {
    if (match(normalised)) return rank;
  }
  return 1000;
}

export function sortOfficers<T extends Officer>(officers: readonly T[]): T[] {
  return [...officers].sort((a, b) => {
    const rankDiff = rankFor(a.position) - rankFor(b.position);
    if (rankDiff !== 0) return rankDiff;
    const positionDiff = a.position.localeCompare(b.position, 'en', { sensitivity: 'base' });
    if (positionDiff !== 0) return positionDiff;
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  });
}

/** Trim whitespace and drop exact (case-insensitive) duplicates so a
 *  trailing-space typo doesn't double the entry on the schedule. */
export function normaliseOfficers<T extends Officer>(officers: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const o of officers) {
    const name = o.name.trim();
    const position = o.position.trim();
    if (!name && !position) continue;
    const key = `${name.toLowerCase()}|${position.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...o, name, position });
  }
  return out;
}
