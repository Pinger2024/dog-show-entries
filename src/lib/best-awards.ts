/**
 * Canonical "Best Awards" set per show type — the top awards a society hands
 * out at the end of a show (Best of Breed, Challenge Certificates, Best Puppy
 * in Show, etc.). Championship shows get CCs + Reserve CCs + Best Puppies;
 * smaller show types get a tighter list.
 *
 * Lifted out of the judges-book route so the judges' book and the catalogue's
 * back-of-book write-in page draw the same list from one source — they used to
 * drift because each had its own copy (Mandy 2026-06-17).
 */
export const DEFAULT_BEST_AWARDS: Record<string, string[]> = {
  championship: [
    'Best of Breed',
    'Dog Challenge Certificate',
    'Reserve Dog Challenge Certificate',
    'Bitch Challenge Certificate',
    'Reserve Bitch Challenge Certificate',
    'Best Puppy Dog',
    'Best Puppy Bitch',
    'Best Puppy in Show',
  ],
  premier_open: [
    'Best of Breed',
    'Best Dog',
    'Best Bitch',
    'Best Puppy Dog',
    'Best Puppy Bitch',
    'Best Puppy in Show',
  ],
  open: [
    'Best of Breed',
    'Best Dog',
    'Best Bitch',
    'Best Puppy in Show',
    'Best Veteran in Show',
  ],
  limited: ['Best of Breed', 'Best Dog', 'Best Bitch', 'Best Puppy in Show'],
  primary: ['Best in Show'],
  companion: ['Best in Show'],
};

/**
 * Build the ordered Best Awards list for a show: the show-type defaults first,
 * then any custom awards the secretary added that aren't already covered
 * (case-insensitive dedupe). Falls back to a single "Best in Show" for unknown
 * show types so the list is never empty.
 */
export function buildBestAwards(
  showType: string | null | undefined,
  customAwards: string[] = [],
): string[] {
  const defaults = DEFAULT_BEST_AWARDS[showType ?? ''] ?? ['Best in Show'];
  const defaultsLower = new Set(defaults.map((a) => a.toLowerCase().trim()));
  return [
    ...defaults,
    ...customAwards.filter((a) => !defaultsLower.has(a.toLowerCase().trim())),
  ];
}
