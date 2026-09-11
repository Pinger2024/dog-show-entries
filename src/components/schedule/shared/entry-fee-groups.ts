import type { ScheduleClass } from './types';

/**
 * Group per-class fee overrides for the schedule's "Entry Fees" panel.
 *
 * Amanda 2026-05-19: the old "Classes #1, #12 — £4" / "Classes #JHA, #JHB,
 * #25, #26, #27 — £3" wording read like noise. Group by class definition
 * name instead (e.g. "Baby Puppy classes — £4", "Special Award classes — £3")
 * and drop Junior Handler classes — they already have their own dedicated
 * Junior Handler row in the panel above.
 */

export interface EntryFeeGroup {
  /** Display label, ending in "classes" — e.g. "Baby Puppy classes". */
  label: string;
  /** Fee in pence. */
  fee: number;
}

function groupNameFor(className: string): string {
  // Collapse all "Special Award Class - Junior/Open/PG/Puppy/Veteran" into one
  // bucket so the panel reads "Special Award classes — £X" rather than
  // listing every variant.
  if (className.startsWith('Special Award Class')) return 'Special Award';
  return className.trim();
}

export function buildEntryFeeGroups(
  classes: readonly ScheduleClass[],
  showFirstEntryFee: number | null,
): EntryFeeGroup[] {
  if (showFirstEntryFee == null) return [];

  const seen = new Map<string, EntryFeeGroup>();
  for (const c of classes) {
    if (c.entryFee == null) continue;
    if (c.entryFee === showFirstEntryFee) continue;
    if (c.classType === 'junior_handler') continue;

    const groupName = groupNameFor(c.className);
    const key = `${groupName}|${c.entryFee}`;
    if (seen.has(key)) continue;
    seen.set(key, { label: `${groupName} classes`, fee: c.entryFee });
  }
  return Array.from(seen.values()).sort((a, b) => {
    if (a.fee !== b.fee) return a.fee - b.fee;
    return a.label.localeCompare(b.label, 'en', { sensitivity: 'base' });
  });
}
