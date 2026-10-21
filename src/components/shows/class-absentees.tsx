import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * A class's absentees under its placings (Mandy 8076, 21 Oct 2026) — one
 * line per dog, styled like a placing line so the class reads top to bottom:
 * the placings, then who didn't come. The public results page and the
 * secretary's Results page both render this, so the two never word it
 * differently. The list comes from `getLiveResults`, already in
 * catalogue-number order and already gated with the class card.
 */
export function ClassAbsentees({
  absentees,
  className,
}: {
  absentees: { entryClassId: string; catalogueNumber: string | null; dogName: string }[];
  className?: string;
}) {
  if (absentees.length === 0) return null;
  return (
    <div className={cn('space-y-1.5', className)}>
      {absentees.map((a) => (
        <div
          key={a.entryClassId}
          className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground sm:gap-3"
        >
          <Badge
            variant="outline"
            className="w-auto justify-center whitespace-nowrap text-xs font-semibold text-muted-foreground sm:w-16"
          >
            Absent
          </Badge>
          <span className="font-mono text-xs">{a.catalogueNumber ?? '—'}</span>
          <span className="flex-1 truncate">{a.dogName}</span>
        </div>
      ))}
    </div>
  );
}
