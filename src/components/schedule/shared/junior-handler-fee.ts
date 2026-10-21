import type { ScheduleClass } from './types';

/**
 * The Junior Handler fee (in pence) to show on the schedule's Entry Fees panel,
 * or `null` to omit the row entirely.
 *
 * Mandy 2026-07-21: the row must appear even when the fee is left blank (£0.00)
 * as long as the show has Junior Handling classes — it showed on Clyde Valley
 * (whose fee was explicitly 0) but NOT on GSD Club of Scotland (whose fee was
 * left null), because the old check only rendered when the fee was non-null.
 *
 * Rule: show the row (with the fee, null → 0) when the show has any Junior
 * Handling class OR a fee is explicitly set; otherwise return null so nothing
 * renders. Keeping the "fee is set" branch means no schedule that already shows
 * the row loses it.
 */
export function juniorHandlerFeeForSchedule(
  juniorHandlerFee: number | null | undefined,
  classes: readonly ScheduleClass[],
): number | null {
  const hasJhClasses = classes.some((c) => c.classType === 'junior_handler');
  if (juniorHandlerFee == null && !hasJhClasses) return null;
  return juniorHandlerFee ?? 0;
}
