/**
 * Shared catalogue formatting utilities.
 * RKC-standard typography for all catalogue PDF formats.
 */

/** Format date as DD.MM.YYYY (RKC catalogue standard) */
export function formatDobKC(dob: string | null | undefined): string {
  if (!dob) return '';
  const d = new Date(dob);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/** UPPER CASE a name (for dog names in RKC catalogues) */
export function uppercaseName(name: string | null | undefined): string {
  if (!name) return '';
  return name.toUpperCase();
}

/** Title Case a name (for sire/dam in "By [sire] ex [dam]" format) */
export function titleCase(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Owner-name formatter for catalogue display. Amanda 2026-05-22: print
 * owners in Title Case rather than the RKC-traditional UPPERCASE.
 *
 * Behaviour, derived from real exhibitor data:
 *  • "alan william hall"          → "Alan William Hall"
 *  • "MALCOLM READMAN"            → "Malcolm Readman"
 *  • "Mandy McAteer"              → "Mandy McAteer"   (mixed-case preserved)
 *  • "O'Brien" / "o'brien"        → "O'Brien"
 *  • "Smith-Jones" / "smith-jones"→ "Smith-Jones"
 *  • "A Swift & N Dodds"          → "A Swift & N Dodds"  (initials + &)
 *
 * Rule: tokens that already contain BOTH upper and lower-case letters
 * are left alone — that preserves McAteer / O'Brien / etc. without
 * needing a lookup table. Single-letter tokens (initials) become
 * uppercase. All-lower / all-upper tokens get title-cased, with
 * capitals after hyphens and apostrophes.
 */
export function smartOwnerTitleCase(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .map(titleCaseToken)
    .join(' ');
}

function titleCaseToken(token: string): string {
  if (!token) return token;
  // Non-letter separators (&, +, /) stay as typed.
  if (/^[^A-Za-z]+$/.test(token)) return token;
  // Initials always uppercase.
  if (token.length === 1) return token.toUpperCase();
  // Already mixed-case (e.g. McAteer, deWitt) — author got it right, leave alone.
  if (/[A-Z]/.test(token) && /[a-z]/.test(token)) return token;
  // All-lower or all-upper: title-case, capitalising first letter and any
  // letter following a hyphen or apostrophe.
  const lower = token.toLowerCase();
  return lower.replace(/(^|['-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * RKC catalogue owner heading — combines surnames first, then titles and
 * initials in the same order. Amanda 2026-05-22:
 *
 *   "Ann Swift" + "Neil Dodds"        → "DODDS & SWIFT, MR N & MS A"     (alphabetical surnames)
 *   "Amber Kemble" + "Ben Pascoe"     → "KEMBLE & PASCOE, MISS A & MR B"
 *   "Maxine Cowan"                    → "COWAN, MRS M"                   (single owner)
 *   "Rachel Craik"                    → "CRAIK, MS R"
 *
 * Sorts owners alphabetically by surname so the heading reads cleanly
 * regardless of the entry order. When a title isn't recorded, just the
 * initial appears ("DODDS & SWIFT, N & A").
 */
export interface RkcOwnerEntry {
  title: string | null;
  name: string;
}

function firstInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  // First word's first letter. "Ann Swift" → "A", "A Swift" → "A".
  const head = trimmed.split(/\s+/)[0]!;
  return head.charAt(0).toUpperCase();
}

// Particle tokens that fuse with the following token into one surname
// unit for both display and sorting — "De Zutter" files under D, not Z
// (Mandy 2026-08-17, after the catalogue printed "ZUTTER, H" for Hugh De
// Zutter). Case-insensitive match against the token as typed.
const SURNAME_PARTICLES = new Set([
  'de', 'del', 'della', 'di', 'da', 'du', 'la', 'le', 'van', 'von', 'der',
  'den', 'ter', 'ten', 'te', 'zu', 'zur', 'vom', 'mac', 'mc', 'st', 'saint', 'o',
]);

/**
 * Split a full name into the forename portion and the surname, where the
 * surname absorbs any run of particle tokens immediately before the final
 * token ("Van Der Berg", not just "Berg"). Walks backward token by token
 * so multi-particle surnames ("De La Cruz") work, not just a fixed
 * 2-token grab.
 *
 * Always leaves at least one leading token as the forename when the name
 * has more than one token — even if that token happens to be a particle
 * word itself (a bare 2-token name like "Van Persie" keeps "Van" as the
 * forename; there's no way to tell it apart from a genuine particle
 * without more context, and a forename must survive). A single-token
 * name is returned whole as the surname with an empty forename — this is
 * also the harmless degrade path for a surname-only entry that happens
 * to start with a particle word ("De Zutter" typed with no forename at
 * all still resolves to surname "Zutter", forename "De" — identical to
 * how any other 2-token name behaves; not a crash, just ambiguous input).
 */
function splitParticleSurname(fullName: string): { forename: string; surname: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { forename: '', surname: parts[0] ?? '' };
  let start = parts.length - 1;
  while (start > 1 && SURNAME_PARTICLES.has(parts[start - 1]!.toLowerCase())) {
    start--;
  }
  return {
    forename: parts.slice(0, start).join(' '),
    surname: parts.slice(start).join(' '),
  };
}

/** The surname portion of a full name, including any particle prefix. */
function particleSurname(fullName: string): string {
  return splitParticleSurname(fullName).surname;
}

function surnameUpper(name: string): string {
  return particleSurname(name).toUpperCase();
}

export function formatRkcOwnerHeading(owners: readonly RkcOwnerEntry[]): string {
  if (owners.length === 0) return 'UNKNOWN';
  // Sort by surname A-Z so the heading reads cleanly.
  const sorted = [...owners].sort((a, b) =>
    surnameUpper(a.name).localeCompare(surnameUpper(b.name), 'en'),
  );
  const surnames = sorted.map((o) => surnameUpper(o.name)).join(' & ');
  const initials = sorted
    .map((o) => {
      const title = (o.title ?? '').trim().toUpperCase();
      const ini = firstInitial(o.name);
      return title ? `${title} ${ini}` : ini;
    })
    .join(' & ');
  return `${surnames}, ${initials}`;
}

/** Format pedigree as "By [Sire] ex [Dam]" (RKC standard) */
export function formatPedigreeKC(
  sire: string | null | undefined,
  dam: string | null | undefined
): string | null {
  if (!sire && !dam) return null;
  const parts: string[] = [];
  if (sire) parts.push(`By ${titleCase(sire)}`);
  if (dam) parts.push(`ex ${titleCase(dam)}`);
  return parts.join(' ');
}

/**
 * Pedigree in the "Sire: … Dam: …" form Mandy chose (2026-06-16), title-cased,
 * with an em-dash where a parent is unknown. Shared by the By-Class and
 * Standard catalogues so the two can't drift on pedigree wording (Michael
 * 2026-06-19). (catalogue-by-breed / catalogue-marked still use the older
 * formatPedigreeKC "By X ex Y" form.)
 */
export function formatPedigreeSireDam(
  sire: string | null | undefined,
  dam: string | null | undefined,
): string | null {
  if (!sire && !dam) return null;
  return `Sire: ${sire ? titleCase(sire) : '—'}  Dam: ${dam ? titleCase(dam) : '—'}`;
}

/**
 * Junior Handling class detection for catalogue layout. A JH class has no sex
 * (JH classes FK to neither breed nor sex) and a name that reads "handling/
 * handler". Single source of truth so the By-Class body float and the Standard
 * section split agree (Michael 2026-06-19).
 */
export function isJuniorHandlingClass(
  className: string | null | undefined,
  sex: string | null | undefined,
): boolean {
  return sex == null && /handling|handler/i.test(className ?? '');
}

/**
 * Format owner names + address for RKC catalogue (UPPER CASE name).
 * Per RKC regulations, when an owner is also the exhibitor the address
 * is replaced with "Exh." (short for "Exhibitor").
 *
 * If `withhold` is true, the owner NAME is still printed (exhibitors
 * need to be identifiable by judges / attendees) but the address is
 * replaced with "address withheld". Amanda 2026-04-17: F(1).11.b.(6)/(8)
 * suppresses personal contact details, not exhibitor identity.
 */
// "Amanda McAteer" → "McAteer, Amanda". Single-word names left untouched.
// Particle surnames stay one unit — "Hugh De Zutter" → "De Zutter, Hugh"
// (Mandy 2026-08-17). No current call sites; kept for consistency with
// surnameUpper/surnameOf, which share the same splitParticleSurname logic.
export function toPhoneBookName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return trimmed;
  const { forename, surname } = splitParticleSurname(trimmed);
  if (!forename) return trimmed;
  return `${surname}, ${forename}`;
}

export function surnameOf(fullName: string): string {
  return particleSurname(fullName).toLowerCase();
}

// Heading + sort key for the exhibitor index. Owners array is the
// source of truth when populated (gives joint owners structured per
// person); falls back to the single exhibitor string otherwise.
// Joint owners join with " & ", each flipped to phone-book format.
export function ownerHeading(
  owners: { title?: string | null; name: string; address: string | null }[],
  exhibitor: string | null | undefined,
): { heading: string; sortKey: string } {
  if (owners.length > 0) {
    const heading = formatRkcOwnerHeading(
      owners.map((o) => ({ title: o.title ?? null, name: o.name })),
    );
    // Sort by the alphabetically-first surname so headings group correctly.
    const firstSurname = [...owners]
      .map((o) => surnameOf(o.name))
      .sort((a, b) => a.localeCompare(b, 'en'))[0] ?? '';
    return { heading, sortKey: firstSurname };
  }
  if (!exhibitor) return { heading: 'UNKNOWN', sortKey: 'unknown' };
  return {
    heading: formatRkcOwnerHeading([{ title: null, name: exhibitor }]),
    sortKey: surnameOf(exhibitor),
  };
}

export function formatOwnerKC(
  owners: { title?: string | null; name: string; address: string | null; userId: string | null }[],
  withhold?: boolean
): string {
  if (owners.length === 0) return withhold ? 'Details withheld' : '';

  // Compound heading per RKC convention — surnames combined, then titles +
  // initials in the same surname order (Amanda 2026-05-22).
  const heading = formatRkcOwnerHeading(
    owners.map((o) => ({ title: o.title ?? null, name: o.name })),
  );

  // Address: use the primary (first) owner's address. (The trailing "Exh."
  // exhibitor marker was binned per Mandy 2026-07-22 — name + address only.)
  const primary = owners[0]!;

  const tail: string[] = [];
  if (withhold) {
    tail.push('address withheld');
  } else if (primary.address) {
    tail.push(primary.address);
  }

  return tail.length > 0 ? `${heading}, ${tail.join(', ')}` : heading;
}

/**
 * Format class list with labels: "1. Minor Puppy, 3. Novice, JHA. Junior Handler 6-11"
 * When the caller can supply an `id` per class + a label map, JH classes
 * render as JHA/JHB rather than a number. Falls back to `classNumber`
 * when no map is provided (legacy callers).
 */
export function formatClassList(
  classes: {
    id?: string | null;
    name: string | undefined;
    classNumber: number | null | undefined;
    sortOrder: number | undefined;
  }[],
  labelMap?: Map<string, string>,
): string {
  const getLabel = (c: (typeof classes)[number]): string | null => {
    if (c.id && labelMap?.get(c.id)) return labelMap.get(c.id)!;
    if (c.classNumber != null) return String(c.classNumber);
    return null;
  };
  const sortKey = (c: (typeof classes)[number]): number => {
    const mapped = c.id ? labelMap?.get(c.id) : undefined;
    // JH labels sort after all numbered classes (position in map already
    // puts them in JHA → JHB → JHC order).
    if (mapped && mapped.startsWith('JH')) {
      return 1_000_000 + mapped.charCodeAt(2);
    }
    return c.classNumber ?? c.sortOrder ?? 999;
  };
  return classes
    .sort((a, b) => sortKey(a) - sortKey(b))
    .map((c) => {
      const label = getLabel(c);
      if (label && c.name) return `${label}. ${c.name}`;
      return c.name;
    })
    .filter(Boolean)
    .join(', ');
}

// ── Best Awards helpers ───────────────────────────────────────
//
// Used by both BestAwardsPage (the dedicated summary page in the front
// matter) and the inline best-awards rendering at the end of the dog
// and bitch sections in catalogue-ringside. Both consumers should agree
// on the list of awards a given show offers, otherwise the summary page
// and the inline section will disagree about what's on offer.

/** Default best awards for a single-breed CHAMPIONSHIP show — every
 *  award a UK breed champ show typically gives out per RKC F regs. */
export const DEFAULT_BREED_CHAMP_AWARDS = [
  'Best of Breed',
  'Best Opposite Sex',
  'Dog CC',
  'Reserve Dog CC',
  'Bitch CC',
  'Reserve Bitch CC',
  'Best Puppy in Breed',
  'Best Puppy Dog',
  'Best Puppy Bitch',
  'Best Veteran in Breed',
] as const;

/** Default best awards for a single-breed open/limited show. */
export const DEFAULT_BREED_AWARDS = [
  'Best of Breed',
  'Best Opposite Sex',
  'Best Dog',
  'Best Bitch',
  'Best Puppy in Breed',
] as const;

/** Default best awards for an all-breed show. */
export const DEFAULT_ALL_BREED_AWARDS = [
  'Best in Show',
  'Reserve Best in Show',
  'Best Puppy in Show',
  'Best Veteran in Show',
] as const;

/** Pick the right default best-awards list for a show based on its
 *  scope and type. Used as a fallback when `show.bestAwards` is empty.
 *  Accepts the same string-typed scope/type as Drizzle inferred shapes
 *  (Drizzle's enum-derived types are string literals, so passing them
 *  through directly is type-safe at the call site). */
export function pickDefaultBestAwards(show: {
  showScope?: 'single_breed' | 'group' | 'general' | string;
  showType?: 'championship' | 'open' | 'limited' | 'premier' | 'club' | 'companion' | 'match' | string;
}): string[] {
  const isSingleBreed = show.showScope === 'single_breed';
  const isChampionship = show.showType === 'championship';
  if (isSingleBreed && isChampionship) return [...DEFAULT_BREED_CHAMP_AWARDS];
  if (isSingleBreed) return [...DEFAULT_BREED_AWARDS];
  return [...DEFAULT_ALL_BREED_AWARDS];
}

// Hoisted regex patterns — used by classifyBestAwardSex below. Hoisting
// avoids re-compiling the regex on every call (cheap, but a bad pattern
// to leave in a function that may be called in a tight loop later).
const BITCH_AWARD_REGEX = /\bbitch\b/;
const DOG_AWARD_REGEX = /\bdog\b/;

/**
 * Classify a best-award name by which sex section it belongs in for
 * inline rendering at the end of dog/bitch sections.
 *
 * Returns:
 *   'dog'    — award is specific to dogs (Dog CC, Best Puppy Dog, etc.)
 *   'bitch'  — award is specific to bitches (Bitch CC, Best Puppy Bitch, etc.)
 *   'shared' — award covers the whole show (Best of Breed, Best in Show)
 */
export function classifyBestAwardSex(
  awardName: string,
): 'dog' | 'bitch' | 'shared' {
  const lower = awardName.toLowerCase();
  // "Bitch" check first because "Best Puppy Bitch" contains "puppy" but
  // we want it filed under bitch, not under shared.
  if (BITCH_AWARD_REGEX.test(lower)) return 'bitch';
  if (DOG_AWARD_REGEX.test(lower)) return 'dog';
  return 'shared';
}

/**
 * Split an award list into per-sex buckets for inline rendering.
 * Sex-specific awards go in their own bucket; "shared" awards (Best of
 * Breed, Best in Show, etc.) are returned separately so the caller can
 * decide where to render them (typically a Best in Show summary page
 * after both sexes have been judged).
 */
export function splitBestAwardsBySex(awards: readonly string[]): {
  dog: string[];
  bitch: string[];
  shared: string[];
} {
  const dog: string[] = [];
  const bitch: string[] = [];
  const shared: string[] = [];
  for (const award of awards) {
    const sex = classifyBestAwardSex(award);
    if (sex === 'dog') dog.push(award);
    else if (sex === 'bitch') bitch.push(award);
    else shared.push(award);
  }
  return { dog, bitch, shared };
}

// ── Shared catalogue grouping utilities ───────────────────────

/** Minimal entry shape needed by shared grouping functions */
export interface CatalogueEntryBase {
  catalogueNumber: string | null;
  dogName: string | null;
  sex: string | undefined;
  entryType: string;
  // exhibitor / handler come from optional related rows whose name column
  // is nullable — so the full shape from the DB layer is `string | null`
  // as well as the undefined that appears when the row is missing.
  exhibitor: string | null | undefined;
  handler: string | null | undefined;
  jhHandlerName?: string | null | undefined;
  classes: {
    name: string | undefined;
    sex: string | null | undefined;
    classNumber: number | null | undefined;
    classLabel?: string;
    sortOrder: number | undefined;
    /** `classDefinition.type` ('special' | 'junior_handler' | …) — see
     *  `ClassGroup.classDefinitionType` for why this is carried through. */
    classDefinitionType?: string | null;
  }[];
}

/** Show info needed for class grouping */
export interface ShowClassesInfo {
  allShowClasses?: {
    className: string;
    classNumber: number | null;
    classLabel?: string;
    sortOrder: number;
    sex: string | null;
    /** `classDefinition.type` ('special' | 'junior_handler' | …) — see
     *  `ClassGroup.classDefinitionType` for why this is carried through. */
    classDefinitionType?: string | null;
  }[];
}

export interface ClassGroup {
  classNumber: number | null | undefined;
  classLabel?: string;
  className: string;
  sex: string | null | undefined;
  sortOrder: number | undefined;
  /** `classDefinition.type` ('special' | 'junior_handler' | …). Carried
   *  through from the DB row so section bucketing (`sectionClasses`,
   *  lib/class-labels.ts) can run the real `isSpecialAwardClass` /
   *  `isJuniorHandler` predicates on this group instead of a consumer
   *  matching a regex against `className` — matching a rule against a
   *  display string is exactly how the Standard Catalogue and Stewards'
   *  Catalogue sectioning drifted apart. */
  classDefinitionType?: string | null;
  entries: CatalogueEntryBase[];
}

/** Group entries by class, injecting empty classes from show data. */
export function groupByClass<T extends CatalogueEntryBase>(
  entries: T[],
  show: ShowClassesInfo,
): ClassGroup[] {
  const byKey = new Map<string, ClassGroup>();

  // JH classes (classLabel='JHA'/'JHB') can all share classNumber=null, so
  // key on classLabel when present to avoid collapsing distinct JH classes.
  const keyFor = (
    label: string | undefined,
    num: number | null | undefined,
    name: string | undefined,
    sex: string | null | undefined,
  ) => {
    if (label) return `lbl:${label}`;
    if (num != null) return `num:${num}`;
    return `name:${name ?? ''}-${sex ?? 'any'}`;
  };

  for (const entry of entries) {
    for (const cls of entry.classes) {
      const key = keyFor(cls.classLabel, cls.classNumber, cls.name, cls.sex);
      if (!byKey.has(key)) {
        byKey.set(key, {
          classNumber: cls.classNumber,
          classLabel: cls.classLabel,
          className: cls.name ?? 'Unknown Class',
          sex: cls.sex,
          sortOrder: cls.sortOrder,
          classDefinitionType: cls.classDefinitionType,
          entries: [],
        });
      }
      byKey.get(key)!.entries.push(entry);
    }
  }

  if (show.allShowClasses) {
    for (const sc of show.allShowClasses) {
      const key = keyFor(sc.classLabel, sc.classNumber, sc.className, sc.sex);
      if (!byKey.has(key)) {
        byKey.set(key, {
          classNumber: sc.classNumber,
          classLabel: sc.classLabel,
          className: sc.className,
          sex: sc.sex,
          sortOrder: sc.sortOrder,
          classDefinitionType: sc.classDefinitionType,
          entries: [],
        });
      }
    }
  }

  // Sort numbered classes first (by classNumber), then JH/unnumbered by
  // classLabel (JHA, JHB, …), then anything else by sortOrder.
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.classNumber != null && b.classNumber != null)
      return a.classNumber - b.classNumber;
    if (a.classNumber != null) return -1;
    if (b.classNumber != null) return 1;
    if (a.classLabel && b.classLabel) return a.classLabel.localeCompare(b.classLabel);
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

/** Sort entries by catalogue number (numeric-aware). */
export function sortEntries<T extends { catalogueNumber: string | null }>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) => {
    const an = a.catalogueNumber ?? '';
    const bn = b.catalogueNumber ?? '';
    return an.localeCompare(bn, undefined, { numeric: true });
  });
}

/** Display name for catalogue entries — handler for JH, dog name for regular. */
export function displayEntryName(entry: CatalogueEntryBase): string {
  if (entry.entryType === 'junior_handler') {
    return entry.jhHandlerName ?? entry.handler ?? entry.exhibitor ?? 'Unnamed Handler';
  }
  return uppercaseName(entry.dogName) || 'Unnamed';
}

/** Format sponsorship lines for class headers. */
export function buildSponsorLines(
  sps: { trophyName: string | null; trophyDonor: string | null; sponsorName: string | null; sponsorAffix: string | null; prizeDescription: string | null }[],
): string[] {
  const lines: string[] = [];
  for (const sp of sps) {
    if (sp.trophyName) {
      let part = sp.trophyName;
      if (sp.sponsorName) {
        part += ` — sponsored by ${sp.sponsorName}`;
        if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
      } else if (sp.trophyDonor) {
        part += ` — donated by ${sp.trophyDonor}`;
      }
      lines.push(part);
    } else if (sp.sponsorName) {
      let part = `Sponsored by ${sp.sponsorName}`;
      if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
      if (sp.prizeDescription) part += ` — ${sp.prizeDescription}`;
      lines.push(part);
    } else if (sp.prizeDescription) {
      lines.push(sp.prizeDescription);
    }
  }
  return lines;
}
