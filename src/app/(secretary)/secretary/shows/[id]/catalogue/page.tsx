'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ClipboardList,
  FolderOpen,
  Hash,
  Info,
  Lock,
  LockOpen,
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
import { DataChecksCard } from './_components/data-checks-card';

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

  const lockMutation = trpc.secretary.lockCatalogueNumbers.useMutation({
    onSuccess: () => {
      utils.secretary.getCatalogueData.invalidate({ showId });
      toast.success('Catalogue numbers locked for printing');
    },
    onError: () => toast.error('Could not lock catalogue numbers'),
  });
  const unlockMutation = trpc.secretary.unlockCatalogueNumbers.useMutation({
    onSuccess: () => {
      utils.secretary.getCatalogueData.invalidate({ showId });
      toast.success('Numbers unlocked and put back in order');
    },
    onError: () => toast.error('Could not unlock catalogue numbers'),
  });

  const entries = catalogueData?.entries ?? [];
  const hasNumbers = entries.some((e) => e.catalogueNumber);
  const entriesStillOpen = catalogueData?.show?.status === 'entries_open';
  const entryCloseDate = catalogueData?.show?.entryCloseDate;
  const numbersLocked = Boolean(catalogueData?.show?.catalogueNumbersLockedAt);

  // Auto-assign catalogue numbers when a secretary lands on the page and any
  // confirmed entry is missing one. There is no manual reassignment button any
  // more — numbers should always appear automatically (backlog #81).
  //
  // Gated on "every entry numbered", not "any entry numbered" (2026-07-27):
  // South Western closed with 55 of 93 numbered, and the old `hasNumbers`
  // guard meant the page saw numbers, skipped the assign, and left 38 paid
  // dogs printing blank with no button to fix it. The mutation is lock-aware,
  // so on a locked show this fills the blanks instead of shifting.
  const allNumbered = entries.length > 0 && entries.every((e) => e.catalogueNumber);
  const autoAssignedRef = useRef(false);
  useEffect(() => {
    if (autoAssignedRef.current) return;
    if (isLoading) return;
    if (entries.length === 0) return;
    if (allNumbered) return;
    if (assignMutation.isPending) return;
    autoAssignedRef.current = true;
    assignMutation.mutate({ showId });
  }, [isLoading, entries.length, allNumbered, assignMutation, showId]);

  return (
    <div className="space-y-6">
      {entriesStillOpen && (
        <div className="flex items-start gap-3 rounded-lg border border-se-honey-line bg-se-honey-soft p-4 text-sm text-se-honey-ink">
          <Info className="size-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">The catalogue won&apos;t be generated until entries close.</p>
            <p className="text-se-honey-ink/80">
              {entryCloseDate
                ? `Entries close on ${new Date(entryCloseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Anything you download before then shows the entries received so far.`
                : 'Anything you download before entries close shows the entries received so far.'}
            </p>
          </div>
        </div>
      )}

      {/* Printing and downloads moved to Documents & Reports (backlog:
          reports-merge) — every catalogue format, the Judge's Book, and
          the rest live there now, always available regardless of phase. */}
      <Link
        href={`/secretary/shows/${showId}/documents`}
        className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted min-h-[2.75rem]"
      >
        <FolderOpen className="size-4 shrink-0" />
        Printing and downloads have moved to Documents &amp; Reports
      </Link>

      {/* Check before print — a glance-list of owner records worth a second
          look, shown before the secretary heads off to print or order. */}
      {entries.length > 0 && <DataChecksCard showId={showId} />}

      {/* Catalogue numbers — provisional (auto-resort on every add) vs locked
          for printing (late entries append so printed numbers never shift). */}
      {hasNumbers &&
        (numbersLocked ? (
          <div className="flex flex-col gap-3 rounded-lg border border-se-fresh-line bg-se-fresh-soft p-4 text-sm text-se-fresh-deep sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Lock className="size-5 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-medium">Numbers are locked for printing</p>
                <p className="text-se-fresh-deep/80">
                  New entries are added at the end, so the numbers on your
                  printed catalogue stay correct.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="min-h-[2.75rem] shrink-0"
              onClick={() => unlockMutation.mutate({ showId })}
              disabled={unlockMutation.isPending}
            >
              <LockOpen className="size-4" />
              Unlock &amp; re-sort
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Info className="size-5 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <p className="font-medium">Numbers update automatically</p>
                <p className="text-muted-foreground">
                  As you add entries they slot into the right place. When
                  you&apos;re ready to print, lock the numbers so they stop
                  changing.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="min-h-[2.75rem] shrink-0"
              onClick={() => lockMutation.mutate({ showId })}
              disabled={lockMutation.isPending}
            >
              <Lock className="size-4" />
              Lock for printing
            </Button>
          </div>
        ))}

      {/* Stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard label="Catalogue Entries" value={entries.length} icon={BookOpen} />
        <StatCard label="Absentees" value={absentees?.length ?? 0} icon={ClipboardList} />
        <StatCard label="Numbers Assigned" value={allNumbered ? 'Yes' : hasNumbers ? 'Some missing' : 'Not yet'} icon={Hash} />
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
