import type { ScheduleClass } from './types';

/**
 * SV / WUSV "Breed Classification" grouping helper.
 *
 * The DB stores each SV class as 4 rows per age (sex × coat). The GSDL BRG
 * schedule layout displays each (age × sex) as ONE numbered class with two
 * sub-letters underneath:
 *
 *   1. Minor Puppy Bitch
 *      a  Standard Coat
 *      b  Long Coat
 *   2. Minor Puppy Dog
 *      a  Standard Coat
 *      b  Long Coat
 *   ...
 *   12. Working Dog
 *      a  Standard Coat
 *      b  Long Coat
 *
 * Numbering rules (Amanda 2026-05-19, GSDL BRG reference):
 * - Excludes Baby Puppy from the numbered set (the GSDL example uses 1–12 =
 *   Minor Puppy → Working only).
 * - Within each age, Bitch comes before Dog.
 * - Junior Handling is its own block (13 / 14), not part of the breed block.
 * - Standard Coat (sv_coat_type='stock') is letter 'a'; Long Stock ('long_stock')
 *   is letter 'b'.
 * - Canonical age order: Minor Puppy, Puppy, Junior, Yearling, Adult, Working
 *   — driven by classDefinition sortOrder.
 */

export interface SvCoatRow {
  letter: 'a' | 'b';
  label: string;
  cls: ScheduleClass;
}

export interface SvNumberedClass {
  number: number;
  /** Display name e.g. "Minor Puppy", sourced from the underlying className
   *  with "SV " prefix stripped. */
  name: string;
  sex: 'dog' | 'bitch';
  coatRows: SvCoatRow[];
}

export interface SvClassificationGroups {
  breedClasses: SvNumberedClass[];
  /** Junior Handler classes — get class numbers continuing from the breed
   *  block (13, 14, ...). One row per JH class definition, no coat split. */
  juniorHandling: Array<{
    number: number;
    label: string;
    cls: ScheduleClass;
  }>;
  /** Total numbered classes (breed + JH) — used for "Classes 1–N" subtitle
   *  + the "24 Class Regional Show" header line. */
  totalCount: number;
}

const SV_BREED_ORDER = [
  'Minor Puppy',
  'Puppy',
  'Junior',
  'Yearling',
  'Adult',
  'Working',
];

/** Tidy the class name for SV display: strip "SV " prefix (DB names are
 *  prefixed to disambiguate from the RKC age classes; the prefix isn't useful
 *  in the SV-only schedule context). */
function displayName(className: string): string {
  return className.replace(/^SV\s+/, '');
}

function isSvAge(c: ScheduleClass): boolean {
  return c.classType === 'sv_age';
}

function isJuniorHandler(c: ScheduleClass): boolean {
  return c.classType === 'junior_handler';
}

/** Read svCoatType off a ScheduleClass — the field isn't on the shared type
 *  yet (it's a per-row attribute on showClasses), so accept it via a soft
 *  cast for now. */
function coatOf(c: ScheduleClass): 'stock' | 'long_stock' | null {
  return (c as { svCoatType?: 'stock' | 'long_stock' | null }).svCoatType ?? null;
}

export function groupSvClasses(classes: readonly ScheduleClass[]): SvClassificationGroups {
  // Filter to SV age classes only — excludes Baby Puppy by name (the GSDL
  // spec excludes it from the numbered classification even when the club
  // creates the class for other reasons).
  const svAge = classes.filter(
    (c) =>
      isSvAge(c) &&
      displayName(c.className) !== 'Baby Puppy' &&
      (c.sex === 'dog' || c.sex === 'bitch'),
  );

  // Build a (displayName, sex) → [stock?, long_stock?] map.
  type BucketKey = string;
  const buckets = new Map<BucketKey, { name: string; sex: 'dog' | 'bitch'; stock?: ScheduleClass; longStock?: ScheduleClass }>();
  for (const c of svAge) {
    const name = displayName(c.className);
    const sex = c.sex as 'dog' | 'bitch';
    const key = `${name}|${sex}`;
    const bucket = buckets.get(key) ?? { name, sex };
    const coat = coatOf(c);
    if (coat === 'stock' && !bucket.stock) bucket.stock = c;
    if (coat === 'long_stock' && !bucket.longStock) bucket.longStock = c;
    // Defensive: a class row without a coat type still gets bucketed so the
    // display doesn't drop it silently. Treat as stock if unset.
    if (!coat && !bucket.stock) bucket.stock = c;
    buckets.set(key, bucket);
  }

  // Sort buckets in (canonical age order, bitch-before-dog) order.
  const ordered = Array.from(buckets.values()).sort((a, b) => {
    const ai = SV_BREED_ORDER.indexOf(a.name);
    const bi = SV_BREED_ORDER.indexOf(b.name);
    // Unknown ages sink to the bottom, then alphabetical.
    if (ai !== bi) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    // Same age — bitch first.
    if (a.sex !== b.sex) return a.sex === 'bitch' ? -1 : 1;
    return 0;
  });

  const breedClasses: SvNumberedClass[] = ordered.map((b, i) => {
    const coatRows: SvCoatRow[] = [];
    if (b.stock) coatRows.push({ letter: 'a', label: 'Standard Coat', cls: b.stock });
    if (b.longStock) coatRows.push({ letter: 'b', label: 'Long Coat', cls: b.longStock });
    return {
      number: i + 1,
      name: b.name,
      sex: b.sex,
      coatRows,
    };
  });

  // Junior Handling classes — numbered continuing from breedClasses.length.
  const jh = classes.filter(isJuniorHandler);
  // Dedupe by classDefinition name (the DB may have multiple rows for the
  // same JH class definition).
  const seenJh = new Set<string>();
  const jhDeduped: ScheduleClass[] = [];
  for (const c of jh) {
    if (seenJh.has(c.className)) continue;
    seenJh.add(c.className);
    jhDeduped.push(c);
  }
  // JH order: 6-11 before 12-16 by sorted className.
  jhDeduped.sort((a, b) => a.className.localeCompare(b.className, 'en'));

  const juniorHandling = jhDeduped.map((c, i) => ({
    number: breedClasses.length + i + 1,
    label: c.className.replace(/Junior Handler/i, 'Junior Handling'),
    cls: c,
  }));

  return {
    breedClasses,
    juniorHandling,
    totalCount: breedClasses.length + juniorHandling.length,
  };
}
