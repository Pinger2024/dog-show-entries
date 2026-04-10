'use client';

import { useEffect, useRef } from 'react';
import {
  BookOpen,
  CheckSquare,
  ClipboardList,
  Download,
  Hash,
  List,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { useShowId } from '../_lib/show-context';

export default function CataloguePage() {
  const showId = useShowId();

  const utils = trpc.useUtils();
  const { data: catalogueData, isLoading } =
    trpc.secretary.getCatalogueData.useQuery({ showId });
  const { data: absentees } =
    trpc.secretary.getAbsenteeList.useQuery({ showId });

  const assignMutation = trpc.secretary.assignCatalogueNumbers.useMutation({
    onSuccess: () => {
      utils.secretary.getCatalogueData.invalidate({ showId });
    },
    onError: () => toast.error('Failed to assign catalogue numbers'),
  });

  const entries = catalogueData?.entries ?? [];
  const hasNumbers = entries.some((e) => e.catalogueNumber);
  const resultsFinalised = Boolean(catalogueData?.show?.resultsPublishedAt);

  // Auto-assign catalogue numbers the first time a secretary lands on the
  // page with confirmed entries but no numbers yet. There is no manual
  // reassignment button any more — numbers should always appear
  // automatically (backlog #81).
  const autoAssignedRef = useRef(false);
  useEffect(() => {
    if (autoAssignedRef.current) return;
    if (isLoading) return;
    if (entries.length === 0) return;
    if (hasNumbers) return;
    if (assignMutation.isPending) return;
    autoAssignedRef.current = true;
    assignMutation.mutate({ showId });
  }, [isLoading, entries.length, hasNumbers, assignMutation, showId]);

  return (
    <div className="space-y-6">
      {/* Actions — appear once catalogue numbers have been auto-assigned */}
      {hasNumbers && (
        /* The `download` attribute on each link tells the browser to treat
           the response as a download rather than navigating the current
           window to the PDF. Combined with the existing `Content-Disposition:
           attachment` header from makePdfResponse, this keeps Amanda inside
           Remi when she taps a button on her phone — the PDF goes to her
           Files app instead of replacing the Remi PWA view (backlog #82). */
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button variant="outline" asChild>
            <a
              href={`/api/catalogue/${showId}/standard`}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <BookOpen className="size-4" />
              Standard
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a
              href={`/api/catalogue/${showId}/by-class`}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <List className="size-4" />
              By Class
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a
              href={`/api/catalogue/${showId}/judging`}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <Users className="size-4" />
              Steward
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a
              href={`/api/catalogue/${showId}/absentees`}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <Download className="size-4" />
              Absentees
            </a>
          </Button>
          {/* Marked for RKC — only usable once results are finalised
              (backlog #89). Before results are published the button is
              disabled with a hint so clicks don't produce an empty doc. */}
          {resultsFinalised ? (
            <Button variant="outline" asChild>
              <a
                href={`/api/catalogue/${showId}/marked`}
                target="_blank"
                rel="noopener noreferrer"
                download
              >
                <CheckSquare className="size-4" />
                Marked (for RKC)
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled
              title="Available once results are finalised"
            >
              <CheckSquare className="size-4" />
              Marked (for RKC)
            </Button>
          )}
          <Button variant="outline" asChild>
            <a
              href={`/api/judges-book/${showId}`}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              <ClipboardList className="size-4" />
              Judge&apos;s Book
            </a>
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Catalogue Entries" value={entries.length} icon={BookOpen} />
        <StatCard label="Absentees" value={absentees?.length ?? 0} icon={ClipboardList} />
        <StatCard label="Numbers Assigned" value={hasNumbers ? 'Yes' : 'Not yet'} icon={Hash} />
      </div>

      {/* Empty state when there are no entries yet — the previous in-page
          breed-grouped preview was removed (backlog #82) since the per-
          format download buttons above replaced its purpose. */}
      {!isLoading && entries.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="No confirmed entries yet"
          description="Entries will appear here once exhibitors have paid."
          variant="card"
        />
      )}

      {/* Absentee List */}
      {(absentees?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Absentee List</CardTitle>
            <CardDescription>
              Withdrawn entries with catalogue numbers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Mobile card view */}
            <div className="space-y-2 sm:hidden">
              {absentees?.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="font-mono text-sm font-bold text-muted-foreground shrink-0">
                    #{entry.catalogueNumber ?? '—'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{entry.dog?.registeredName ?? '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.dog?.breed?.name ?? '—'} &middot; {entry.exhibitor?.name ?? '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cat. No.</TableHead>
                    <TableHead>Dog</TableHead>
                    <TableHead>Breed</TableHead>
                    <TableHead>Exhibitor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {absentees?.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono font-bold">
                        {entry.catalogueNumber ?? '—'}
                      </TableCell>
                      <TableCell>
                        {entry.dog?.registeredName ?? '—'}
                      </TableCell>
                      <TableCell>{entry.dog?.breed?.name ?? '—'}</TableCell>
                      <TableCell>{entry.exhibitor?.name ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
