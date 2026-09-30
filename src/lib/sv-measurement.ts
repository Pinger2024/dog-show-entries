/**
 * SV height and chest depth — Mandy, 30 Sept 2026: "both [steward and
 * secretary] but doesn't need to be on the day, can be afterwards, every dog
 * from junior upwards gets measured". Recorded per entry (the dog at this
 * show), in centimetres to one decimal place, the way the League's "Results
 * for SV" sheet carries them (e.g. 61.5 / 25.5). Which classes are measured is
 * `isSvMeasuredClass` (sv-grading.ts, next to the grade rule for the same age
 * bands).
 *
 * The bounds only catch a slip of the finger — 615 for 61.5, a depth typed in
 * the height box — not a judgement on the dog. The North Eastern 2026 League
 * sheet ran from 58 to 67 cm high and 21 to 31 cm deep.
 */
import { isLiveEntry } from '@/lib/entry-counts';
import { isSvMeasuredClass } from '@/lib/sv-grading';

export type SvMeasurementKind = 'height' | 'depth';

/** One dog in one class, as far as measuring goes. */
export type SvMeasurementCandidate = {
  showRuleset: string | null | undefined;
  className: string | null | undefined;
  /** entry_classes.absent — this class's own attendance flag. */
  absent: boolean;
  entry: { status: string; deletedAt: Date | string | null | undefined } | null | undefined;
};

/**
 * Why this dog can't have a height and depth in this class, or null if it can.
 * THE rule for which dogs are measured — the save refuses with this message,
 * and the steward class page and the secretary's Height and depth page list
 * exactly the dogs it lets through (neither page decides for itself):
 *  - a live (confirmed, not deleted) entry,
 *  - at a regional (WUSV) show,
 *  - in a measured class (`isSvMeasuredClass` — Junior, Yearling, Adult, Working),
 *  - not marked absent from that class.
 */
export function svMeasurementBlock(c: SvMeasurementCandidate): string | null {
  if (!isLiveEntry(c.entry)) return 'This entry is not confirmed';
  if (c.showRuleset !== 'wusv') return 'Height and depth are only recorded at regional (SV) shows';
  if (!isSvMeasuredClass(c.className)) return 'Height and depth are only recorded for dogs from Junior upwards';
  if (c.absent) return 'This dog is marked absent, so it has no measurements';
  return null;
}

export const SV_MEASUREMENT_BOUNDS: Record<SvMeasurementKind, { min: number; max: number }> = {
  height: { min: 40, max: 80 },
  depth: { min: 15, max: 45 },
};

const LABEL: Record<SvMeasurementKind, string> = { height: 'Height', depth: 'Depth' };

/** Why a measurement can't be saved, or null if it's fine. null (blank) is
 *  always fine — it clears the value. */
export function svMeasurementProblem(kind: SvMeasurementKind, cm: number | null): string | null {
  if (cm == null) return null;
  const { min, max } = SV_MEASUREMENT_BOUNDS[kind];
  if (!Number.isFinite(cm) || cm < min || cm > max) {
    return `${LABEL[kind]} should be in centimetres, between ${min} and ${max} — please check the number.`;
  }
  return null;
}

/** Read what was typed into a height/depth box: "" → null, "61,5" → 61.5.
 *  Returns NaN for something that isn't a number (svMeasurementProblem then
 *  explains). Rounded to one decimal place. */
export function parseSvMeasurement(typed: string): number | null {
  const t = typed.trim().replace(',', '.').replace(/\s*cm$/i, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : NaN;
}

/** Display / spreadsheet form: 61.5 → "61.5", 63 → "63", null → "". Accepts
 *  the numeric-column string Postgres hands back ("63.0"). */
export function formatSvMeasurement(cm: number | string | null | undefined): string {
  if (cm == null || cm === '') return '';
  const n = typeof cm === 'number' ? cm : Number(cm);
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '';
}

/** How many of these dogs have BOTH a height and a depth — the Height and
 *  depth page's "12 of 40 dogs measured" and the documents page's reminder. */
export function svMeasurementProgress(rows: { svHeightCm: string; svDepthCm: string }[]): {
  measured: number;
  total: number;
} {
  return { measured: rows.filter((r) => r.svHeightCm !== '' && r.svDepthCm !== '').length, total: rows.length };
}

/** The documents page's reminder on the SV Results Spreadsheet, or undefined
 *  when every dog is measured. Never blocks a download. */
export function svMeasurementGapsNote({ measured, total }: { measured: number; total: number }): string | undefined {
  const missing = total - measured;
  if (missing <= 0) return undefined;
  return (
    `${missing} of ${total} ${total === 1 ? 'dog has' : 'dogs have'} no height and depth yet. ` +
    `Add them under Results → Height and depth before you send this to the League.`
  );
}
