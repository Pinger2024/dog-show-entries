'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { SE_H } from '@/components/show-experience/tokens';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/date-utils';
import { ArrowLeft, FileText, Download, Copy, Loader2 } from 'lucide-react';

/**
 * Admin club-invoice ledger — every invoice ever issued, most recent first.
 * Replaces the one-off reconciliation scripts Michael used to hand-run
 * per show. Invoices are immutable once issued: the only "edit" available
 * here is Supersede, which issues a brand new invoice and links it to the
 * old one.
 */
export default function AdminInvoicesPage() {
  const utils = trpc.useUtils();
  const { data: invoices, isLoading } = trpc.adminInvoices.list.useQuery();
  const [supersedeTarget, setSupersedeTarget] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const rows = invoices ?? [];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Admin
        </Link>
        <span>/</span>
        <span>Invoices</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={cn(SE_H, 'text-2xl sm:text-3xl')}>Club invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The package fee + card processing fees deducted from each show&apos;s
            entry fees before the balance is sent to the club.
          </p>
        </div>
        <Button asChild className="min-h-[2.75rem]">
          <Link href="/admin/invoices/new">
            <FileText className="size-4" />
            New invoice
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No invoices issued yet. Generate one from a show&apos;s figures with
                &quot;New invoice&quot; above.
              </p>
            ) : (
              rows.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-medium">{inv.invoiceNumber}</p>
                      {inv.supersededById ? (
                        <Badge variant="secondary">Superseded</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm">{inv.organisation.name}</p>
                    <p className="text-xs text-muted-foreground">{inv.show.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>Net to credit the club: {formatCurrency(inv.netToClubPence)}</span>
                      <span>Issued {format(new Date(inv.issuedAt), 'd MMM yyyy')}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild size="sm" variant="outline" className="min-h-[2.75rem] sm:min-h-0">
                      <a href={`/api/admin/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
                        <Download className="size-3.5" />
                        Download PDF
                      </a>
                    </Button>
                    {!inv.supersededById && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[2.75rem] sm:min-h-0"
                        onClick={() => setSupersedeTarget(inv.id)}
                      >
                        <Copy className="size-3.5" />
                        Supersede
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <SupersedeDialog
        invoiceId={supersedeTarget}
        onClose={() => setSupersedeTarget(null)}
        onDone={() => utils.adminInvoices.list.invalidate()}
      />
    </div>
  );
}

/**
 * Supersede: confirms intent, then jumps to the New Invoice flow pre-filled
 * for a correction — the actual figures need re-entering (package fee /
 * discount may be exactly why this is being corrected), so this only hands
 * off to /admin/invoices/new with the old invoice id, it doesn't issue
 * directly.
 */
function SupersedeDialog({
  invoiceId,
  onClose,
  onDone,
}: {
  invoiceId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: invoice } = trpc.adminInvoices.get.useQuery(
    { id: invoiceId! },
    { enabled: !!invoiceId }
  );

  if (!invoiceId) return null;

  return (
    <AlertDialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif">Supersede this invoice</AlertDialogTitle>
          <AlertDialogDescription>
            {invoice ? (
              <>
                This will issue a brand new invoice for {invoice.show.name} and mark{' '}
                <span className="font-mono">{invoice.invoiceNumber}</span> as superseded. The
                original stays on file exactly as issued — you&apos;ll re-enter the package
                fee and figures on the next screen.
              </>
            ) : (
              <Loader2 className="size-4 animate-spin" />
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button asChild onClick={() => { onDone(); }}>
              <a href={invoice ? `/admin/invoices/new?showId=${invoice.show.id}&supersedes=${invoice.id}` : '#'}>
                Continue
              </a>
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
