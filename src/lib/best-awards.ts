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
 * Curated, ordered vocabulary of recordable awards NOT already covered by a
 * given show's DEFAULT_BEST_AWARDS — the "Also available" tick-list in the
 * Awards Picker (src/components/awards/awards-picker.tsx). Every name here
 * (and every name in DEFAULT_BEST_AWARDS) is guaranteed recordable —
 * `awardNameToType(name) !== null` — enforced by
 * src/lib/__tests__/best-awards-vocabulary.test.ts, so ticking a box here can
 * never reproduce the free-typing misspelling trap this picker replaces
 * (Mandy 2026-08-11: award names clubs typed printed fine but silently never
 * reached the results recording page).
 */
export const OPTIONAL_AWARDS: string[] = [
  'Reserve Best in Show',
  'Best of Breed',
  'Best Dog',
  'Best Bitch',
  'Reserve Best Dog',
  'Reserve Best Bitch',
  'Best Puppy Dog',
  'Best Puppy Bitch',
  'Best Puppy in Show',
  'Best Veteran in Show',
  'Best Long Coat Dog',
  'Best Long Coat Bitch',
  'Best Long Coat in Show',
  'Best Long Coat Adult',
  'Best Long Coat Puppy',
  'Best Baby Puppy',
  // Most Promising Dog/Bitch deliberately absent — regional-only awards
  // (Mandy 2026-08-11). Regionals get their OWN tick-list (see
  // REGIONAL_BEST_AWARDS / REGIONAL_OPTIONAL_AWARDS below) — they stay
  // recordable via awardNameToType for regionals' configured lists.
  'Dog Challenge Certificate',
  'Reserve Dog Challenge Certificate',
  'Bitch Challenge Certificate',
  'Reserve Bitch Challenge Certificate',
];

/**
 * The four awards every WUSV/SV regional show gives — the ONE owner for
 * "which best awards does a regional give" (Mandy, 21 Sept 2026: the
 * Sponsors page picker offered the RKC championship list on a regional show
 * and never offered these). SV's own labels are "Best Male/Female, Most
 * Promising Male/Female" (see `REGIONAL_FOOTER_LABELS` in sv-results.ts for
 * that print-only relabelling) but these are the RECORDABLE names —
 * `awardNameToType` in top-awards.ts resolves each one, enforced by
 * src/lib/__tests__/best-awards-vocabulary.test.ts.
 *
 * `buildBestAwards` uses this as the wusv default list; `sv-results.ts`
 * derives its printed footer from this same list so the two can never
 * drift apart again.
 */
export const REGIONAL_BEST_AWARDS: string[] = [
  'Best Dog',
  'Best Bitch',
  'Most Promising Dog',
  'Most Promising Bitch',
];

/**
 * The "Also available" tick-list for a regional show's Awards Picker —
 * awards that make sense at a WUSV/SV regional. Deliberately excludes
 * Challenge Certificates, Best of Breed and Best in Show, which are RKC
 * championship-only concepts a regional show doesn't award.
 */
export const REGIONAL_OPTIONAL_AWARDS: string[] = [
  'Best Puppy Dog',
  'Best Puppy Bitch',
  'Best Long Coat Dog',
  'Best Long Coat Bitch',
  'Best Baby Puppy',
];

/**
 * SV's own labels for the four regional awards ("Best Male/Female", "Most
 * Promising Male/Female") map onto the same recordable Dog/Bitch names a
 * secretary picks from the tick-list — they are literally the same award,
 * just SV's word for it. One owner for the mapping: the Awards Picker's
 * free-text "Add your own trophy" box runs typed names through
 * `canonicalAwardName` before adding them, so typing an SV label still
 * lands on a name `awardNameToType` recognises (the same aliases are also
 * registered directly in top-awards.ts's NAME_TO_TYPE, so results recording
 * accepts either spelling even if a name reaches it some other way).
 */
const SV_LABEL_TO_CANONICAL: Record<string, string> = {
  'best male': 'Best Dog',
  'best female': 'Best Bitch',
  'most promising male': 'Most Promising Dog',
  'most promising female': 'Most Promising Bitch',
};

/**
 * Normalise a secretary-typed award name to its canonical recordable form —
 * currently only the SV "Male/Female" synonyms need this; every other name
 * passes through unchanged (trimmed).
 */
export function canonicalAwardName(name: string): string {
  const trimmed = name.trim();
  return SV_LABEL_TO_CANONICAL[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Commit a pending "Add your own trophy" name into the awards list — the ONE
 * owner for what "add this custom award" means, shared by the picker's "+
 * Add" button, its Enter-to-add, and its on-blur auto-commit (Mandy, 21 Sept
 * 2026: typed "Most Promising Dog" into the box and pressed "Save Awards"
 * without tapping "+ Add" first — the box's text was silently discarded and
 * she got "You need at least one award"). A blank name, or one already in
 * the list (case-insensitive, after canonicalisation), returns `value`
 * unchanged so callers can cheaply check `result !== value` to know whether
 * anything changed.
 */
export function commitPendingAward(value: string[], pendingName: string): string[] {
  const trimmed = canonicalAwardName(pendingName);
  if (!trimmed) return value;
  const canon = (a: string) => a.toLowerCase().trim();
  if (value.some((a) => canon(a) === canon(trimmed))) return value;
  return [...value, trimmed];
}

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
  showRuleset?: string | null,
): string[] {
  // A CONFIGURED list wins VERBATIM — same order, nothing added. The sponsors
  // page is the source of truth the secretary sees and edits; prepending
  // show-type defaults meant the catalogue and judges book printed a different
  // list, in a different order, from the one on her screen.
  //
  // Mandy 2026-07-27, South Western: "the order in which we have the best
  // awards in this table should be mirrored in the catalogue but currently
  // they are not", and "for this show we should have best in show instead of
  // best of breed" — Best of Breed was never in her list; the championship
  // defaults were injecting it ahead of everything she had configured.
  //
  // resolveTopAwards (top-awards.ts) has always worked this way for results,
  // for the same stated reason. This brings the printed documents into line,
  // so a club's awards read identically everywhere.
  if (customAwards.length > 0) return [...customAwards];

  // A WUSV/SV regional show's fixed award structure (Mandy, 21 Sept 2026) —
  // takes priority over showType, since a regional is `showType:
  // 'championship'` + `showRuleset: 'wusv'` and must NOT get the RKC
  // championship defaults (Best of Breed, CCs) below.
  if (showRuleset === 'wusv') return [...REGIONAL_BEST_AWARDS];

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

/**
 * The Awards Picker's "Usually awarded" / "Also available" split — pulled
 * out of the picker component so the component owns only rendering, not the
 * rule for what counts as usual vs more (src/components/awards/
 * awards-picker.tsx). RKC show types use DEFAULT_BEST_AWARDS/OPTIONAL_AWARDS;
 * a WUSV/SV regional uses REGIONAL_BEST_AWARDS/REGIONAL_OPTIONAL_AWARDS —
 * no Challenge Certificates, Best of Breed or Best in Show on offer there.
 */
export function bestAwardsPickerOptions(
  showType: string | null | undefined,
  showRuleset: string | null | undefined,
): { usual: string[]; more: string[] } {
  const usual = buildBestAwards(showType, [], showRuleset);
  const canon = (a: string) => a.toLowerCase().trim();
  const usualSet = new Set(usual.map(canon));
  const optionalPool = showRuleset === 'wusv' ? REGIONAL_OPTIONAL_AWARDS : OPTIONAL_AWARDS;
  const more = optionalPool.filter((a) => !usualSet.has(canon(a)));
  return { usual, more };
}
