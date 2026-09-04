/**
 * Class-label formatting for show_classes.
 *
 * RKC show licences count only breed classes, not Junior Handler. So the
 * numbered sequence is reserved for breed classes (1, 2, 3, …) and JH
 * classes get alphanumeric identifiers (JHA, JHB, JHC, …) that sit
 * outside the licensed count.
 *
 * Implementation:
 *   - `autoAssignClassNumbers` gives each non-JH class a sequential
 *     `classNumber`; JH classes keep `classNumber = null`.
 *   - Display code calls `buildClassLabelMap(classes)` once per show
 *     context, then reads `map.get(cls.id)` per class to get the
 *     user-facing label ("1" / "JHA" / etc.).
 *
 * `buildClassLabelMap` accepts any list that looks class-shaped — tRPC
 * responses, PDF-render inputs, plain schema rows — as long as each
 * entry exposes `id`, `classNumber`, `sortOrder`, and the relation
 * to its `classDefinition.type`.
 */

type ClassLike = {
  id: string;
  classNumber: number | null;
  sortOrder?: number | null;
  sex?: string | null;
  svCoatType?: 'stock' | 'long_stock' | null;
  classDefinition?: { type?: string | null; name?: string | null } | null;
};

/**
 * Minimal shape needed to tell whether a class is Junior Handling or a
 * Special Award Class — deliberately looser than {@link ClassLike} (no `id`
 * required, and no requirement that classDefinition be nested) so callers
 * whose row shape doesn't carry an id, or flattens the definition's type/name
 * onto the class itself (e.g. a catalogue `ClassGroup`, a schedule
 * `ScheduleClass`), can still use the ONE canonical check instead of a local
 * regex or flat-field copy. Every existing `ClassLike`-shaped caller already
 * satisfies this structurally, so widening these two predicates' parameter
 * type is backwards compatible.
 */
export type ClassKindInput = {
  classDefinition?: { type?: string | null; name?: string | null } | null;
  /** Flat fallback for callers whose class rows carry the definition's
   *  type/name directly rather than nested under `classDefinition`. */
  classType?: string | null;
  className?: string | null;
};

export function isJuniorHandler(cls: ClassKindInput): boolean {
  return (cls.classDefinition?.type ?? cls.classType ?? null) === 'junior_handler';
}

/**
 * Canonical SV/WUSV age order. Baby Puppy FIRST and INCLUDED in the numbered
 * set (Amanda 2026-05-28 — a club that runs Baby Puppy wants it as class 1/2;
 * a club that doesn't simply deletes it and Minor Puppy becomes class 1).
 *
 * This is the single source of truth for SV age ordering — the schedule
 * classification (`groupSvClasses`) and the catalogue classification page
 * (`buildSvClassification`) both import it so all three numbering paths agree.
 */
export const SV_AGE_ORDER = [
  'Baby Puppy',
  'Minor Puppy',
  'Puppy',
  'Junior',
  'Yearling',
  'Adult',
  'Working',
];

/** Strip the "SV " disambiguation prefix the DB carries on some age defs. */
export function svDisplayAge(name: string | null | undefined): string {
  return (name ?? '').replace(/^SV\s+/, '');
}

export interface SvClassNumber {
  /** The (age × sex) class number — both coats of one age/sex share it. */
  number: number;
  /** 'a' = Long Coat, 'b' = Short (Stock) Coat. Null when the show offers
   *  only one coat for this age/sex (then the label is just the number). */
  coatLetter: 'a' | 'b' | null;
  /** Display label, e.g. "1a", "1b", or "1" for a single-coat class. */
  label: string;
}

/**
 * Single source of truth for SV/WUSV class NUMBERING.
 *
 * The DB stores up to four rows per age (sex × coat). The GSDL/BRG display
 * convention is: each (age × sex) is ONE numbered class, with the two coat
 * types shown as sub-letters a (Long Coat) and b (Short/Stock Coat) — the
 * regional groups flipped long-before-short 2026-08-11 (previously stock
 * was 'a'):
 *
 *   1a  Baby Puppy Bitch · Long          1b  Baby Puppy Bitch · Short
 *   2a  Baby Puppy Dog   · Long          2b  Baby Puppy Dog   · Short
 *   3a  Minor Puppy Bitch · Long         …
 *
 * Numbering is DERIVED from the rows present (not the stored classNumber), so
 * deleting an age automatically renumbers everything below it. `classNumber`
 * is left untouched as the ordering key used by catalogue numbering + every
 * sorted PDF output.
 *
 * SV numbering only applies to shows actually run under WUSV rules
 * (`showRuleset === 'wusv'`). There is exactly ONE `sv_age`-typed "Baby
 * Puppy" class definition in the DB and it's shared by both RKC and WUSV
 * shows — an RKC show that happens to offer Baby Puppy must keep its stored
 * `classNumber`, not get relabelled with the SV bitch-before-dog convention
 * (Mandy, South Western GSD, 2026-07-27). Pass `showRuleset` from the show
 * record; any value other than `'wusv'` (including `null`/`undefined`)
 * returns an empty map so those classes fall through to their stored number.
 *
 * Returns a map keyed by show-class id. Only `sv_age` rows appear.
 */
export function buildSvClassNumbering(
  classes: ClassLike[],
  showRuleset?: string | null,
): Map<string, SvClassNumber> {
  if (showRuleset !== 'wusv') return new Map();

  const svRows = classes.filter(
    (c) =>
      c.classDefinition?.type === 'sv_age' &&
      (c.sex === 'dog' || c.sex === 'bitch'),
  );

  type Bucket = { age: string; sex: 'dog' | 'bitch'; rows: ClassLike[] };
  const buckets = new Map<string, Bucket>();
  for (const c of svRows) {
    const age = svDisplayAge(c.classDefinition?.name);
    const sex = c.sex as 'dog' | 'bitch';
    const key = `${age}|${sex}`;
    const bucket = buckets.get(key) ?? { age, sex, rows: [] };
    bucket.rows.push(c);
    buckets.set(key, bucket);
  }

  const ordered = Array.from(buckets.values()).sort((a, b) => {
    const ai = SV_AGE_ORDER.indexOf(a.age);
    const bi = SV_AGE_ORDER.indexOf(b.age);
    if (ai !== bi) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    // Same age — bitch before dog (Amanda 2026-05-28).
    if (a.sex !== b.sex) return a.sex === 'bitch' ? -1 : 1;
    return 0;
  });

  const map = new Map<string, SvClassNumber>();
  ordered.forEach((bucket, i) => {
    const number = i + 1;
    const hasStock = bucket.rows.some((r) => r.svCoatType === 'stock');
    const hasLong = bucket.rows.some((r) => r.svCoatType === 'long_stock');
    const splitByCoat = hasStock && hasLong;
    for (const r of bucket.rows) {
      // Long coat is 'a', short/stock coat is 'b' — regional groups' decision
      // 2026-08-11, flipping the earlier stock='a' convention (Amanda,
      // regional-group meeting).
      const coatLetter: 'a' | 'b' | null = !splitByCoat
        ? null
        : r.svCoatType === 'long_stock'
          ? 'a'
          : 'b';
      const label = coatLetter ? `${number}${coatLetter}` : String(number);
      map.set(r.id, { number, coatLetter, label });
    }
  });
  return map;
}

/** Minimal shape {@link canonicalSvClassOrder} needs from each row — a
 *  looser cousin of {@link ClassLike} (only what the comparator reads). */
export type SvOrderableClass = {
  sex?: string | null;
  svCoatType?: 'stock' | 'long_stock' | null;
  classDefinition?: { type?: string | null; name?: string | null } | null;
};

/**
 * Canonical SV/WUSV class order for a whole show: sexed breed (`sv_age`)
 * classes ordered bitch-before-dog within each {@link SV_AGE_ORDER} age band,
 * long coat (`long_stock`) before stock coat within an age×sex, then every
 * other class (Junior Handling, Special Awards, anything not `sv_age`
 * dog/bitch) appended afterwards in its original relative order.
 *
 * This is the repair-tool half of `buildSvClassNumbering`'s numbering logic:
 * that function derives class NUMBERS/labels from whatever order the rows
 * are already in; this function derives the ROW ORDER itself, for shows
 * whose stored `sort_order`/`class_number` were never set to the canonical
 * sequence in the first place (a show created before the 11 Aug 2026 cutover
 * — see `scripts/resort-sv-show-classes.ts`). Every sorted PDF and the
 * catalogue numbering both honour the stored `sort_order`/`class_number`
 * directly and deliberately do NOT re-derive it — this function is what
 * fixes the stored order, not a replacement for reading it.
 */
export function canonicalSvClassOrder<T extends SvOrderableClass>(rows: T[]): T[] {
  const isSexedSvAge = (r: T) =>
    r.classDefinition?.type === 'sv_age' && (r.sex === 'dog' || r.sex === 'bitch');

  const sexed = rows.filter(isSexedSvAge);
  const rest = rows.filter((r) => !isSexedSvAge(r));

  const coatRank = (r: T): number => (r.svCoatType === 'long_stock' ? 0 : r.svCoatType === 'stock' ? 1 : 2);

  const sortedSexed = [...sexed].sort((a, b) => {
    const ai = SV_AGE_ORDER.indexOf(svDisplayAge(a.classDefinition?.name));
    const bi = SV_AGE_ORDER.indexOf(svDisplayAge(b.classDefinition?.name));
    if (ai !== bi) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    // Same age — bitch before dog (Amanda 2026-05-28).
    if (a.sex !== b.sex) return a.sex === 'bitch' ? -1 : 1;
    // Same age × sex — long coat before stock (regional groups 2026-08-11).
    return coatRank(a) - coatRank(b);
  });

  return [...sortedSexed, ...rest];
}

/** Special Award Classes sit outside the RKC-licensed class count too — the
 *  schedule renders them as A, B, C, … in their own dedicated section (judged
 *  in the lunch break). Amanda 2026-05-19.
 *
 *  Widened to {@link ClassKindInput} (same as `isJuniorHandler`) so callers
 *  whose row shape flattens `classDefinition.type`/`.name` onto the class
 *  itself (a catalogue `ClassGroup`, a schedule `ScheduleClass`) can use this
 *  ONE canonical check via `sectionClasses` instead of a local regex or
 *  flat-field copy — this predicate never used `id`/`classNumber` anyway, so
 *  the widening is backwards compatible with every existing caller. */
export function isSpecialAwardClass(cls: ClassKindInput): boolean {
  const type = cls.classDefinition?.type ?? cls.classType ?? null;
  const name = cls.classDefinition?.name ?? cls.className ?? null;
  return type === 'special' && (name?.startsWith('Special Award Class') ?? false);
}

export type ClassSectionKey = 'dog' | 'bitch' | 'special' | 'jh' | 'other';

export interface ClassSection<T> {
  key: ClassSectionKey;
  classes: T[];
}

/** Minimal shape `sectionClasses` needs from each item's adapter — the same
 *  loose {@link ClassKindInput} the predicates accept, plus `sex` for the
 *  Dog/Bitch fallback. */
export type SectionableClass = ClassKindInput & { sex?: string | null };

/**
 * Single source of truth for BUCKETING a show's classes into display bands —
 * Dog, Bitch, Special Awards, Junior Handling — for any document that groups
 * classes under section headings with their own judge line. The Standard
 * Catalogue and Stewards' Catalogue used to hand-roll this split
 * independently, and one of them matched a `/special award/i` regex against
 * the class NAME instead of the real `isSpecialAwardClass`/`isJuniorHandler`
 * predicates — a club naming a class differently would silently break
 * bucketing. That's the defect this removes: one bucketing decision, driven
 * by the real predicates, reused by every consumer.
 *
 * This function decides BUCKETING, not layout — it returns each section's
 * classes keyed by `key`, and a consumer that needs its own section order or
 * an extra leading/trailing bucket (e.g. a "Mixed" section ahead of Dog) can
 * look sections up by key (`sections.find(s => s.key === 'jh')`) and lay
 * them out however its document requires, same as it would with any other
 * shared data. Only the bucketing predicates are meant to be one rule
 * everywhere.
 *
 * TRAP this exists to avoid: Special Award classes are `sex: null` AND
 * unnumbered; Junior Handling is `sex: null` AND numbered. Never bucket on
 * null-ness — always the explicit predicate. Order matters too: SAC is
 * checked before JH so a special-award class can never be misread as JH
 * (both have sex=null), and both are checked before the sex fallback so
 * neither is ever swallowed by Dog/Bitch.
 *
 * `classes` must already be in persisted/display order (the order every
 * reader sorts by — `sortOrder`/`classNumber`) — this function buckets by a
 * single stable pass and never re-sorts, so that order is preserved within
 * each returned section.
 *
 * `toClassLike` adapts the caller's item shape to the minimal shape the
 * predicates need — callers whose items already carry a nested
 * `classDefinition: {type, name}` and `sex` can pass the identity function.
 *
 * Returns only the sections that have classes, in the fixed order
 * Dog → Bitch → Special Awards → Junior Handling → catch-all ("other") —
 * Special Awards before Junior Handling is the show secretary's judging-day
 * convention (Special Awards run in the lunch break ahead of the Junior
 * Handling classes). The catch-all guarantees a class of an unrecognised
 * shape is surfaced somewhere rather than silently dropped, without ever
 * being confused for a real Dog/Bitch class.
 */
export function sectionClasses<T>(
  classes: T[],
  toClassLike: (item: T) => SectionableClass,
): ClassSection<T>[] {
  const buckets: Record<ClassSectionKey, T[]> = {
    dog: [],
    bitch: [],
    special: [],
    jh: [],
    other: [],
  };

  for (const item of classes) {
    const like = toClassLike(item);
    if (isSpecialAwardClass(like)) {
      buckets.special.push(item);
    } else if (isJuniorHandler(like)) {
      buckets.jh.push(item);
    } else if (like.sex === 'dog') {
      buckets.dog.push(item);
    } else if (like.sex === 'bitch') {
      buckets.bitch.push(item);
    } else {
      buckets.other.push(item);
    }
  }

  const order: ClassSectionKey[] = ['dog', 'bitch', 'special', 'jh', 'other'];
  return order
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, classes: buckets[key] }));
}

/**
 * Build a `{classId → display label}` map for every class in a show.
 * JH classes are labelled JHA, JHB, … and SAC classes A, B, C, … both in
 * their natural (sortOrder) order — this lettering is ruleset-independent.
 * Non-JH/non-SAC classes display their stored `classNumber`, UNLESS the show
 * runs under WUSV rules (`showRuleset === 'wusv'`), in which case `sv_age`
 * classes get the SV 1a/1b age×sex+coat labelling instead. Always pass the
 * show's `showRuleset` — omitting it is only correct for RKC/non-regional
 * shows (see `buildSvClassNumbering` for why this gate exists).
 */
export function buildClassLabelMap(
  classes: ClassLike[],
  showRuleset?: string | null,
): Map<string, string> {
  const map = new Map<string, string>();

  const jhOrdered = classes
    .filter(isJuniorHandler)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const [i, cls] of jhOrdered.entries()) {
    map.set(cls.id, `JH${String.fromCharCode(65 + i)}`);
  }

  const sacOrdered = classes
    .filter(isSpecialAwardClass)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const [i, cls] of sacOrdered.entries()) {
    map.set(cls.id, String.fromCharCode(65 + i));
  }

  // SV/WUSV age classes get the 1a/1b age×sex+coat labelling — the single
  // source of truth shared with the schedule + catalogue classification
  // pages (Amanda 2026-05-28). Gated on showRuleset === 'wusv' so an RKC
  // show's shared sv_age Baby Puppy definition keeps its stored classNumber.
  const svNumbering = buildSvClassNumbering(classes, showRuleset);
  for (const [id, info] of svNumbering) {
    map.set(id, info.label);
  }

  for (const cls of classes) {
    if (isJuniorHandler(cls) || isSpecialAwardClass(cls)) continue;
    if (map.has(cls.id)) continue; // already labelled (SV age class)
    if (cls.classNumber != null) map.set(cls.id, String(cls.classNumber));
  }
  return map;
}

/**
 * Build the deduplicated Definitions-of-Classes list for the catalogue front
 * matter, with Junior Handling floated to the END (after Veteran) — Mandy
 * 2026-06-16. Shared by both catalogue render paths (HTTP route + print
 * pipeline) so the Definitions page can't drift between them (Michael
 * 2026-06-19). Stable: keeps insertion order within each group.
 */
export function buildCatalogueClassDefinitions(
  classes: Iterable<{
    classDefinition?: {
      id?: string | null;
      name?: string | null;
      description?: string | null;
      type?: string | null;
    } | null;
  }>,
): { name: string; description: string | null }[] {
  const seen = new Set<string>();
  const defs: { name: string; description: string | null; isJh: boolean }[] = [];
  for (const sc of classes) {
    const cd = sc.classDefinition;
    if (cd?.id && !seen.has(cd.id)) {
      seen.add(cd.id);
      defs.push({
        name: cd.name ?? '',
        description: cd.description ?? null,
        isJh: cd.type === 'junior_handler',
      });
    }
  }
  return defs
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (a.d.isJh === b.d.isJh ? a.i - b.i : a.d.isJh ? 1 : -1))
    .map(({ d }) => ({ name: d.name, description: d.description }));
}

/**
 * Pull the label for a single class out of a pre-computed map, falling
 * back to the raw `classNumber` when no map entry exists (e.g. a class
 * the map doesn't know about, or a context that didn't build a map).
 * Returns an empty string if nothing is available.
 */
export function getClassLabel(
  cls: ClassLike,
  labelMap: Map<string, string> | null | undefined,
): string {
  const mapped = labelMap?.get(cls.id);
  if (mapped) return mapped;
  if (isJuniorHandler(cls)) return 'JH';
  if (isSpecialAwardClass(cls)) return '';
  return cls.classNumber != null ? String(cls.classNumber) : '';
}

/**
 * Single source of truth for the regional coat-type DISPLAY WORDING —
 * "Long Coat" / "Short Coat". The DB enum values ('stock' / 'long_stock')
 * never change; this is only ever the user-facing label.
 *
 * Regional groups' decision 2026-08-11 (via Amanda): the wording used to be
 * "Stock Coat" / "Long Stock Coat" on regional/SV screens (RKC screens
 * already said "Long Coat"). It's now "Long Coat" / "Short Coat"
 * everywhere a coat type is shown on a show class, RKC or regional alike.
 * Every call site should go through this helper rather than its own
 * stock/long_stock → string mapping.
 */
export function svCoatDisplayName(
  coatType: 'stock' | 'long_stock' | null | undefined,
): string | null {
  if (coatType === 'stock') return 'Short Coat';
  if (coatType === 'long_stock') return 'Long Coat';
  return null;
}

/**
 * Abbreviate a breed class name for the Challenge Register (steward
 * catalogue's final page) — e.g. "Minor Puppy" (dog) → "MPD", "Post
 * Graduate" (bitch) → "PGB". Strips a trailing " Dog"/" Bitch" word first so
 * a class already named for its sex (e.g. "Veteran Dog") doesn't double the
 * letter ("VD", not "VDD"). Takes the first letter of each remaining
 * word — words that don't start with a letter (numbers, punctuation) are
 * skipped rather than crashing — then appends 'D' for dog / 'B' for bitch.
 * Total function: a missing name or sex never throws, just returns as much
 * of the abbreviation as it can build (possibly '').
 */
export function classNameAbbreviation(
  className: string | null | undefined,
  sex: 'dog' | 'bitch' | null,
): string {
  if (!className) return '';
  const stripped = className.replace(/\s+(dog|bitch)$/i, '');
  const initials = stripped
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (/^[a-zA-Z]/.test(word) ? word[0]!.toUpperCase() : ''))
    .join('');
  const sexLetter = sex === 'dog' ? 'D' : sex === 'bitch' ? 'B' : '';
  return `${initials}${sexLetter}`;
}

/**
 * Format a class name for SV/WUSV-aware display.
 *
 *   "SV Junior" + svCoatType='long_stock' → "Junior — Long Coat"
 *   "SV Junior" + svCoatType='stock'      → "Junior — Short Coat"
 *   "SV Junior" + svCoatType=null         → "Junior"
 *   "Working"   + svCoatType=null         → "Working"
 *
 * Amanda 2026-05-23: every SV screen — entry picker, financial report,
 * sponsor assignment, catalogue header — was rendering same-named Stock
 * Coat / Long Stock Coat classes as visually identical rows. This helper
 * is the single source of truth for the user-facing name so all four
 * screens stay in lockstep.
 */
export function formatSvClassName(
  rawName: string | null | undefined,
  svCoatType: 'stock' | 'long_stock' | null | undefined,
): string {
  const base = (rawName ?? 'Unknown Class').replace(/^SV\s+/, '');
  const coat = svCoatDisplayName(svCoatType);
  return coat ? `${base} — ${coat}` : base;
}

// ── Deterministic ordering for a single entry's OWN classes ────────────────

/** The minimum shape sortEntryClassesByShowClassOrder needs from a fetched
 *  entry_classes row: the joined show_class's own running-order columns. */
export interface EntryClassWithShowClassOrder {
  showClass: { sortOrder?: number | null; classNumber?: number | null; id: string } | null;
}

/**
 * Sort a dog's OWN entry_classes rows (a dog entered in a breed class AND a
 * Special Award Class, say) into the show's running order — by
 * show_classes.sortOrder, then classNumber, then id as a final stable
 * tiebreak.
 *
 * Why this exists: Drizzle's relational query API (`db.query.entries.findMany({
 * with: { entryClasses: { with: { showClass: true } } } })`) has no way to
 * order the `entryClasses` relation by a column on the JOINED `showClass`
 * table — only by entryClasses' own columns, none of which reflect show
 * running order. Postgres itself gives no ordering guarantee for a relation
 * fetched without ORDER BY. Confirmed empirically (2026-09-01): the exact
 * same fixture, queried twice, returned a multi-class dog's entryClasses in
 * different orders across runs — src/__tests__/integration/
 * report-entry-classes-order.test.ts reproduces this deterministically by
 * inserting the later-running class first.
 *
 * Every report loader that joins a dog's classes into one string MUST sort
 * with this immediately after the query resolves, before any row-builder
 * (report-rows.ts's buildCatalogueOrderRows / buildAbsenteeRow /
 * buildFinancialStatementRow) touches the data — see
 * src/app/api/reports/[showId]/[type]/route.ts and
 * src/server/services/report-queries.ts's loadAbsenteeLikeEntries /
 * loadEntryReportEntries, the three call sites this was fixed at.
 *
 * catalogue-snapshot.ts does NOT need this: it never sorts entryClasses at
 * the query level either, but nothing there joins them into a single
 * string from DB order — catalogue-ringside.tsx's per-dog "Class X, Y" line
 * already re-sorts locally (by classNumber, then classLabel) before
 * joining. This helper gives the report loaders that same guarantee,
 * keyed on the show's own class order rather than duplicating that
 * component's classLabel-based comparator (which needs label-formatting
 * context the report loaders don't have).
 */
export function sortEntryClassesByShowClassOrder<T extends EntryClassWithShowClassOrder>(
  entryClasses: T[],
): T[] {
  return entryClasses.slice().sort((a, b) => {
    const aSort = a.showClass?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bSort = b.showClass?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (aSort !== bSort) return aSort - bSort;
    const aNum = a.showClass?.classNumber ?? Number.MAX_SAFE_INTEGER;
    const bNum = b.showClass?.classNumber ?? Number.MAX_SAFE_INTEGER;
    if (aNum !== bNum) return aNum - bNum;
    return (a.showClass?.id ?? '').localeCompare(b.showClass?.id ?? '');
  });
}
