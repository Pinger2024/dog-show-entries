import { cn } from '@/lib/utils';
import { entryCloseHint, closeDateChangeHint, type CloseDateField } from '@/lib/entry-close-rules';

/**
 * Shared "For a show on <date>, entries must close by <date>." proactive
 * hint (see {@link entryCloseHint}), rendered near every entry-close /
 * postal-close date picker — the new-show wizard, the setup wizard, and the
 * edit-show dialog. One canonical className so the three forms can't drift
 * out of sync on spacing (2026-08-05); pass `className` to add whatever
 * margin fits the surrounding layout.
 */
export function EntryCloseHint({
  startDate,
  className,
}: {
  startDate: string;
  className?: string;
}) {
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      {entryCloseHint(startDate)}
    </p>
  );
}

/**
 * What the club may do with ONE of the two closing dates — the 2027 F(1)7.d
 * split, where extending the online date no longer needs the RKC's
 * permission but moving the postal one still does. Rendered under each date
 * picker in all three forms (new-show wizard, setup wizard, edit-show
 * dialog), so a secretary learns which is which where she is actually
 * changing it. Wording and the 2026/2027 cut-over are owned by
 * `closeDateChangeHint`; nothing is shown for a regional.
 */
export function CloseDateRuleHint({
  field,
  startDate,
  showRuleset,
  className,
}: {
  field: CloseDateField;
  startDate: string | null | undefined;
  showRuleset?: string | null;
  className?: string;
}) {
  const text = closeDateChangeHint({ field, startDate, showRuleset });
  if (!text) return null;
  return <p className={cn('text-xs text-muted-foreground', className)}>{text}</p>;
}
