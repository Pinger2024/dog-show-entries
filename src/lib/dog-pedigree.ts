/**
 * The pedigree the catalogue prints — sire, dam, breeder, colour.
 *
 * These are mandatory on every new dog (`dogs.create`) and, once set, cannot
 * be cleared again: a catalogue can't be produced without them. A dog that is
 * ALREADY missing one stays freely editable so Mandy can repair old records
 * by hand — the rule blocks losing content, never adding it.
 *
 * Lives here, outside the routers, because more than one write path reaches
 * these columns and they used to disagree. `dogs.update` carried the guard
 * from e2c852ec (2026-07-28), but the dog form autosaves the same columns
 * through /api/dog-autosave/[dogId] while you type, which had no guard at
 * all — so clearing the sire name was written to the database before Save was
 * ever pressed. Worse, it disarmed the other guard: once autosave had nulled
 * the column, `dogs.update` saw nothing being cleared and waved the save
 * through (Michael 2026-09-11).
 *
 * Keep every path that writes these columns going through
 * `findClearedPedigreeFields` rather than re-implementing the comparison.
 */
import { blank } from '@/lib/sv-entry-readiness';

export const PEDIGREE_FIELDS = [
  { key: 'sireName', label: "the sire's name" },
  { key: 'damName', label: "the dam's name" },
  { key: 'breederName', label: "the breeder's name" },
  { key: 'colour', label: 'the colour' },
] as const;

export type PedigreeField = (typeof PEDIGREE_FIELDS)[number];
export type PedigreeFieldKey = PedigreeField['key'];

type MaybeRow = Partial<Record<PedigreeFieldKey, unknown>>;

const asText = (v: unknown) => (v == null ? null : String(v));

/**
 * Which pedigree fields this patch would blank out that the dog currently
 * holds. A key the patch doesn't mention (or sends as `undefined`) is
 * untouched and never counts — both callers use merge semantics.
 */
export function findClearedPedigreeFields(
  incoming: MaybeRow,
  existing: MaybeRow,
): PedigreeField[] {
  return PEDIGREE_FIELDS.filter((f) => {
    if (!(f.key in incoming) || incoming[f.key] === undefined) return false;
    if (!blank(asText(incoming[f.key]))) return false;
    return !blank(asText(existing[f.key]));
  });
}

/** The one wording for the refusal, so every path says the same thing. */
export function pedigreeClearMessage(fields: readonly PedigreeField[]): string {
  const list = fields.map((f) => f.label).join(', ');
  return `Please don't clear ${list} — it's needed for the catalogue. You can change it to something else instead.`;
}
