'use client';

import { CircleCheck, TriangleAlert } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { OwnerCheckIssue } from '@/lib/catalogue-data-checks';
import type { RouterOutputs } from '@/server/trpc/router';

type FlaggedRow = RouterOutputs['secretary']['catalogueDataChecks'][number];

// Plain-English versions of each rule — this is a glance-list for a secretary
// to skim, not a validation error, so no red/alarming language.
const ISSUE_LABELS: Record<OwnerCheckIssue, string> = {
  missing_name: 'No name on file',
  single_word_name: 'Only one name — catalogues print the full name',
  multiple_people_in_one_owner:
    'Looks like two people in one owner slot — give each person their own owner entry',
  missing_address: 'No address on file',
  name_like_address_start: 'Address looks like it starts with a name',
};

interface DataChecksCardProps {
  showId: string;
}

/**
 * "Check before print" — a calm, before-you-print glance-list of exhibitor
 * records worth a second look (a first-name-only owner, an address that
 * reads like it starts with a surname, etc).
 *
 * Deliberately NOT a gate: it never blocks entry, printing, or ordering —
 * see catalogue-data-checks.ts for the rules and the real incident (a
 * surname typed into the address field) that prompted this.
 */
export function DataChecksCard({ showId }: DataChecksCardProps) {
  const { data: flagged, isLoading } = trpc.secretary.catalogueDataChecks.useQuery({ showId });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-base sm:text-lg">Check before print</CardTitle>
        <CardDescription>
          A quick look at exhibitor names and addresses — worth a glance before you print or order.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="grid grid-cols-1 gap-2">
            <div className="h-14 animate-pulse rounded-lg bg-muted" />
            <div className="h-14 animate-pulse rounded-lg bg-muted" />
          </div>
        )}

        {!isLoading && (flagged?.length ?? 0) === 0 && (
          <div className="flex min-h-[2.75rem] items-center gap-3 rounded-lg border border-se-fresh-line bg-se-fresh-soft p-3 text-sm text-se-fresh-deep">
            <CircleCheck className="size-5 shrink-0" />
            <p className="min-w-0 flex-1 font-medium">
              Exhibitor names and addresses all look right
            </p>
          </div>
        )}

        {!isLoading && (flagged?.length ?? 0) > 0 && (
          <div className="grid grid-cols-1 gap-2">
            {flagged!.map((row: FlaggedRow, i: number) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-se-honey-line bg-se-honey-soft p-3 text-sm"
              >
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-se-honey-ink" />
                <div className="min-w-0 flex-1 space-y-1 text-se-honey-ink">
                  <p className="font-medium">
                    {row.ownerName?.trim() || 'Unnamed owner'}
                    {row.ownerAddress ? ` — ${row.ownerAddress}` : ''}
                  </p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {row.issues.map((issue: OwnerCheckIssue) => (
                      <li key={issue}>{ISSUE_LABELS[issue]}</li>
                    ))}
                  </ul>
                  <p className="text-se-honey-ink/80">
                    {row.dogName}
                    {row.dogCount > 1 ? ` (+ ${row.dogCount - 1} more dog${row.dogCount > 2 ? 's' : ''})` : ''}
                    {row.catalogueNumber ? ` · Cat. No. ${row.catalogueNumber}` : ''}
                  </p>
                  <p className="text-xs text-se-honey-ink/70">
                    Fix it under the exhibitor&apos;s dog → Owners, then re-check.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
