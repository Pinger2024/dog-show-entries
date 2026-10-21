import { cn } from '@/lib/utils';
import { entryCloseHint } from '@/lib/entry-close-rules';

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
