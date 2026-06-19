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
/**
 * A "Best Dog/Bitch" award is the same prize as the Challenge Certificate for
 * that sex — at a championship show the CC winner IS the best of that sex. So
 * when a CC is offered, the "Best …" form is redundant and must be dropped, or
 * the awards list shows both (Mandy 2026-06-19: "for a champ show you'd just
 * have Dog Challenge Certificate; for an open show you'd only have Best Dog").
 * Open shows have no CCs, so the "Best …" forms survive.
 */
const CC_SUPERSEDES: Record<string, string> = {
  'best dog': 'dog challenge certificate',
  'best bitch': 'bitch challenge certificate',
  'res best dog': 'reserve dog challenge certificate',
  'reserve best dog': 'reserve dog challenge certificate',
  'res best bitch': 'reserve bitch challenge certificate',
  'reserve best bitch': 'reserve bitch challenge certificate',
};

export function buildBestAwards(
  showType: string | null | undefined,
  customAwards: string[] = [],
): string[] {
  const defaults = DEFAULT_BEST_AWARDS[showType ?? ''] ?? ['Best in Show'];
  const canon = (a: string) => a.toLowerCase().trim();
  const present = new Set(defaults.map(canon));
  const result = [...defaults];
  for (const award of customAwards) {
    const key = canon(award);
    if (present.has(key)) continue; // already listed
    const supersededBy = CC_SUPERSEDES[key];
    if (supersededBy && present.has(supersededBy)) continue; // CC covers it
    present.add(key);
    result.push(award);
  }
  return result;
}
