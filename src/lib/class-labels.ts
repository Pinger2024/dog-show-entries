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
  classDefinition?: { type?: string | null } | null;
};

export function isJuniorHandler(cls: ClassLike): boolean {
  return cls.classDefinition?.type === 'junior_handler';
}

/**
 * Build a `{classId → display label}` map for every class in a show.
 * JH classes are labelled JHA, JHB, … in their natural (sortOrder)
 * order. Non-JH classes display their stored `classNumber`.
 */
export function buildClassLabelMap(classes: ClassLike[]): Map<string, string> {
  const jhOrdered = classes
    .filter(isJuniorHandler)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const map = new Map<string, string>();
  for (const [i, cls] of jhOrdered.entries()) {
    map.set(cls.id, `JH${String.fromCharCode(65 + i)}`);
  }
  for (const cls of classes) {
    if (isJuniorHandler(cls)) continue;
    if (cls.classNumber != null) map.set(cls.id, String(cls.classNumber));
  }
  return map;
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
  return cls.classNumber != null ? String(cls.classNumber) : '';
}
