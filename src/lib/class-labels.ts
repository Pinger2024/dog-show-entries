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

export function isJuniorHandler(cls: ClassLike): boolean {
  return cls.classDefinition?.type === 'junior_handler';
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
  /** 'a' = Standard/Stock, 'b' = Long Stock. Null when the show offers only
   *  one coat for this age/sex (then the label is just the number). */
  coatLetter: 'a' | 'b' | null;
  /** Display label, e.g. "1a", "1b", or "1" for a single-coat class. */
  label: string;
}

/**
 * Single source of truth for SV/WUSV class NUMBERING.
 *
 * The DB stores up to four rows per age (sex × coat). The GSDL/BRG display
 * convention is: each (age × sex) is ONE numbered class, with the two coat
 * types shown as sub-letters a (Standard/Stock) and b (Long Stock):
 *
 *   1a  Baby Puppy Bitch · Standard      1b  Baby Puppy Bitch · Long
 *   2a  Baby Puppy Dog   · Standard      2b  Baby Puppy Dog   · Long
 *   3a  Minor Puppy Bitch · Standard     …
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
      const coatLetter: 'a' | 'b' | null = !splitByCoat
        ? null
        : r.svCoatType === 'long_stock'
          ? 'b'
          : 'a';
      const label = coatLetter ? `${number}${coatLetter}` : String(number);
      map.set(r.id, { number, coatLetter, label });
    }
  });
  return map;
}

/** Special Award Classes sit outside the RKC-licensed class count too — the
 *  schedule renders them as A, B, C, … in their own dedicated section (judged
 *  in the lunch break). Amanda 2026-05-19. */
export function isSpecialAwardClass(cls: ClassLike): boolean {
  return (
    cls.classDefinition?.type === 'special' &&
    (cls.classDefinition?.name?.startsWith('Special Award Class') ?? false)
  );
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
 * Format a class name for SV/WUSV-aware display.
 *
 *   "SV Junior" + svCoatType='long_stock' → "Junior — Long Stock Coat"
 *   "SV Junior" + svCoatType='stock'      → "Junior — Stock Coat"
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
  if (svCoatType === 'stock') return `${base} — Stock Coat`;
  if (svCoatType === 'long_stock') return `${base} — Long Stock Coat`;
  return base;
}
