'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/date-utils';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Loader2,
  PoundSterling,
  AlertCircle,
} from 'lucide-react';

/**
 * Admin payouts ledger — what Remi owes each club and the BACS payments
 * we've already made. Not a money-moving tool; it's a bookkeeping view
 * that mirrors actual bank transfers Michael does from the Starling app.
 */
export default function AdminPayoutsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.adminDashboard.listPayouts.useQuery();

  const [recordingOrgId, setRecordingOrgId] = useState<string | null>(null);
  const [formAmount, setFormAmount] = useState('');
  const [formRef, setFormRef] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const recordMutation = trpc.adminDashboard.recordPayout.useMutation({
    onSuccess: () => {
      utils.adminDashboard.listPayouts.invalidate();
      if (recordingOrgId) {
        utils.adminDashboard.listPayoutHistory.invalidate({
          organisationId: recordingOrgId,
        });
      }
      toast.success('Payout recorded.');
      setRecordingOrgId(null);
      setFormAmount('');
      setFormRef('');
      setFormNotes('');
    },
    onError: (err) => toast.error(err.message),
  });

  const activeOrg = recordingOrgId
    ? data?.rows.find((r) => r.id === recordingOrgId)
    : null;

  const { data: history } = trpc.adminDashboard.listPayoutHistory.useQuery(
    { organisationId: recordingOrgId! },
    { enabled: !!recordingOrgId }
  );

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const summary = data?.summary ?? { totalOwed: 0, totalPaid: 0, totalOutstanding: 0 };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Admin
        </Link>
        <span>/</span>
        <span>Payouts</span>
      </div>

      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          Club payouts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What Remi owes each club from exhibitor entry fees, and the
          BACS transfers already made. Record each BACS push here after
          you send it from Starling.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <PoundSterling className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{formatCurrency(summary.totalOwed)}</p>
              <p className="text-xs text-muted-foreground">Total paid into Remi (for clubs)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-2xl font-bold">{formatCurrency(summary.totalPaid)}</p>
              <p className="text-xs text-muted-foreground">Paid out to clubs so far</p>
            </div>
          </CardContent>
        </Card>
        <Card className={summary.totalOutstanding > 0 ? 'border-amber-500/40' : ''}>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className={`size-5 shrink-0 ${summary.totalOutstanding > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-2xl font-bold">{formatCurrency(summary.totalOutstanding)}</p>
              <p className="text-xs text-muted-foreground">Outstanding</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-club rows */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Club balances</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No club payouts to show yet. Clubs that receive exhibitor
                payments or have payout details on file will appear here.
              </p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{row.name}</p>
                    {row.payoutSortCode && row.payoutAccountNumber ? (
                      <p className="mt-0.5 text-xs font-mono text-muted-foreground">
                        {row.payoutAccountName} — {row.payoutSortCode} / {row.payoutAccountNumber}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-amber-600">
                        No bank details on file yet
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>Owed: {formatCurrency(row.totalOwedPence)}</span>
                      <span>Paid: {formatCurrency(row.totalPaidPence)}</span>
                      <span
                        className={
                          row.outstandingPence > 0
                            ? 'font-semibold text-amber-700'
                            : 'text-emerald-700'
                        }
                      >
                        Outstanding: {formatCurrency(row.outstandingPence)}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={row.outstandingPence > 0 ? 'default' : 'outline'}
                    onClick={() => {
                      setRecordingOrgId(row.id);
                      setFormAmount(
                        row.outstandingPence > 0
                          ? (row.outstandingPence / 100).toFixed(2)
                          : ''
                      );
                    }}
                    disabled={!row.payoutSortCode}
                  >
                    <Banknote className="size-3.5" />
                    Record payout
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Record-payout dialog */}
      <Dialog open={!!recordingOrgId} onOpenChange={(v) => { if (!v) setRecordingOrgId(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">Record a payout</DialogTitle>
            <DialogDescription>
              {activeOrg?.name} — {activeOrg?.payoutSortCode} / {activeOrg?.payoutAccountNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="payout-amount">Amount (£)</Label>
              <Input
                id="payout-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                inputMode="decimal"
              />
              {activeOrg && activeOrg.outstandingPence > 0 && (
                <p className="text-xs text-muted-foreground">
                  Outstanding: {formatCurrency(activeOrg.outstandingPence)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-ref">Bank reference (optional)</Label>
              <Input
                id="payout-ref"
                value={formRef}
                onChange={(e) => setFormRef(e.target.value)}
                placeholder="e.g. REMI-May-CLYDE"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-notes">Notes (optional)</Label>
              <Textarea
                id="payout-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Covers 16 May Spring Champ Show"
              />
            </div>

            {/* History */}
            {history && history.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Previous payouts
                </p>
                <ul className="space-y-1.5 text-xs">
                  {history.slice(0, 5).map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-2">
                      <span>
                        {new Date(h.paidAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {h.bankReference && ` · ${h.bankReference}`}
                      </span>
                      <span className="font-mono">
                        {formatCurrency(h.amountPence)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordingOrgId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const pence = Math.round(parseFloat(formAmount) * 100);
                if (!recordingOrgId || Number.isNaN(pence) || pence <= 0) {
                  toast.error('Enter a valid amount.');
                  return;
                }
                recordMutation.mutate({
                  organisationId: recordingOrgId,
                  amountPence: pence,
                  bankReference: formRef || undefined,
                  notes: formNotes || undefined,
                });
              }}
              disabled={recordMutation.isPending}
            >
              {recordMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
