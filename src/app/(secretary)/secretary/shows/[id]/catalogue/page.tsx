'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  CheckSquare,
  ClipboardList,
  Download,
  ExternalLink,
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
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
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
      {/* Actions — appear once catalogue numbers have been auto-assigned.
          Each button opens the PDF inside an in-Remi dialog viewer rather
          than navigating away. Amanda's mobile testing showed that
          target="_blank" + download attribute still left her stuck inside
          the PWA when tapping a PDF link — iOS ignores the download hint
          and the PWA has no browser chrome, so there was no back button.
          The dialog approach guarantees a clean close button regardless
          of how iOS handles the iframe contents (backlog #82 round 2). */}
      {hasNumbers && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <PdfViewerButton
            icon={<BookOpen className="size-4" />}
            label="Standard"
            url={`/api/catalogue/${showId}/standard`}
          />
          <PdfViewerButton
            icon={<List className="size-4" />}
            label="By Class"
            url={`/api/catalogue/${showId}/by-class`}
          />
          <PdfViewerButton
            icon={<Users className="size-4" />}
            label="Steward"
            url={`/api/catalogue/${showId}/judging`}
          />
          <PdfViewerButton
            icon={<Download className="size-4" />}
            label="Absentees"
            url={`/api/catalogue/${showId}/absentees`}
          />
          {/* Marked for RKC — only usable once results are finalised
              (backlog #89). Before results are published the button is
              disabled with a hint so clicks don't produce an empty doc. */}
          {resultsFinalised ? (
            <PdfViewerButton
              icon={<CheckSquare className="size-4" />}
              label="Marked (for RKC)"
              url={`/api/catalogue/${showId}/marked`}
            />
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
          <PdfViewerButton
            icon={<ClipboardList className="size-4" />}
            label="Judge's Book"
            url={`/api/judges-book/${showId}`}
          />
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

// ── PDF Viewer Button ─────────────────────────────────────────
//
// Opens a PDF inside a full-screen Remi dialog instead of navigating
// the current window/PWA to the PDF URL. This is the backlog #82 round
// 2 fix: Amanda's iOS PWA was leaving her stuck on the PDF view with
// no way back, because target="_blank" navigates within the PWA shell
// and iOS Safari ignores the `download` attribute for PDFs.
//
// The dialog always has a close button (top-right X from DialogContent)
// so even if iOS refuses to render the PDF in the iframe, Amanda is
// one tap from returning to the catalogue page. No app force-quit.
//
// The iframe loads the PDF with `?preview=1` so makePdfResponse sends
// `Content-Disposition: inline`, which allows embedding. The dialog
// also offers a fallback "Open in new tab" link that uses
// window.open() — on desktop this is the quickest way to print, and on
// iOS it breaks out into real Safari (escaping the PWA shell).

function PdfViewerButton({
  icon,
  label,
  url,
}: {
  icon: React.ReactNode;
  label: string;
  url: string;
}) {
  const [open, setOpen] = useState(false);
  const inlineUrl = url.includes('?') ? `${url}&preview=1` : `${url}?preview=1`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {icon}
        {label}
      </Button>
      <DialogContent
        showCloseButton={false}
        className="max-w-none sm:max-w-none p-0 gap-0 w-screen h-[100dvh] sm:w-[95vw] sm:h-[95vh] sm:rounded-lg max-sm:inset-0 max-sm:top-0 max-sm:bottom-0 max-sm:rounded-none flex flex-col"
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {/* Header with title + actions + close */}
        <div className="flex items-center justify-between gap-2 border-b bg-background px-3 py-2 sm:px-4 sm:py-3">
          <h2 className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold sm:text-base">
            {icon}
            <span className="truncate">{label}</span>
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="gap-1"
              >
                <ExternalLink className="size-3.5" />
                <span className="hidden sm:inline">Open in new tab</span>
                <span className="sm:hidden">Open</span>
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="gap-1"
            >
              Close
            </Button>
          </div>
        </div>
        {/* PDF iframe — grows to fill remaining space */}
        <iframe
          src={inlineUrl}
          title={label}
          className="min-h-0 flex-1 w-full border-0"
        />
      </DialogContent>
    </Dialog>
  );
}
