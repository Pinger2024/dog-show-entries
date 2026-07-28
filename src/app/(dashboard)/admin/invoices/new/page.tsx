'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SE_H } from '@/components/show-experience/tokens';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency, poundsToPence } from '@/lib/date-utils';
import { ArrowLeft, AlertTriangle, ChevronDown, Loader2, FileCheck2 } from 'lucide-react';

const DEFAULT_DISCOUNT_PENCE = 20;

export default function NewInvoicePage() {
  return (
    <Suspense fallback={null}>
      <NewInvoiceFlow />
    </Suspense>
  );
}

function NewInvoiceFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supersedesId = searchParams.get('supersedes');

  const [showId, setShowId] = useState(searchParams.get('showId') ?? '');
  const [packageFee, setPackageFee] = useState('');
  const [packageFeeDescription, setPackageFeeDescription] = useState('Show package fee');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [discountPence, setDiscountPence] = useState(String(DEFAULT_DISCOUNT_PENCE));

  const { data: shows } = trpc.admin.listAllShows.useQuery();
  const selectedShow = shows?.find((s) => s.id === showId);

  const packageFeePence = poundsToPence(parseFloat(packageFee || '0'));
  const perTransactionDiscountPence = parseInt(discountPence || '0', 10);

  const previewInput =
    showId && !Number.isNaN(packageFeePence) && !Number.isNaN(perTransactionDiscountPence)
      ? {
          showId,
          packageFeePence,
          packageFeeDescription: packageFeeDescription || 'Show package fee',
          perTransactionDiscountPence,
        }
      : null;

  const { data: preview, isFetching: previewLoading } = trpc.adminInvoices.preview.useQuery(
    previewInput!,
    { enabled: !!previewInput }
  );

  const issueMutation = trpc.adminInvoices.issue.useMutation({
    onSuccess: (invoice) => {
      toast.success(`Invoice ${invoice.invoiceNumber} issued.`);
      router.push('/admin/invoices');
    },
    onError: (err) => toast.error(err.message),
  });

  const supersedeMutation = trpc.adminInvoices.supersede.useMutation({
    onSuccess: (invoice) => {
      toast.success(`Invoice ${invoice.invoiceNumber} issued as a correction.`);
      router.push('/admin/invoices');
    },
    onError: (err) => toast.error(err.message),
  });

  const isSubmitting = issueMutation.isPending || supersedeMutation.isPending;

  const canIssue =
    !!showId && packageFee.trim() !== '' && !Number.isNaN(packageFeePence) && packageFeePence >= 0;

  const handleIssue = () => {
    if (!previewInput) return;
    if (supersedesId) {
      supersedeMutation.mutate({ ...previewInput, oldId: supersedesId });
    } else {
      issueMutation.mutate(previewInput);
    }
  };

  const showOptions = useMemo(() => shows ?? [], [shows]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/invoices" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Invoices
        </Link>
        <span>/</span>
        <span>New</span>
      </div>

      <div>
        <h1 className={cn(SE_H, 'text-2xl sm:text-3xl')}>
          {supersedesId ? 'Issue a correction' : 'New invoice'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a show, check the figures, then set the package fee to generate the invoice.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Show</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={showId} onValueChange={setShowId} disabled={!!supersedesId}>
            <SelectTrigger className="min-h-[2.75rem] w-full">
              <SelectValue placeholder="Choose a show" />
            </SelectTrigger>
            <SelectContent>
              {showOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.organisationName} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedShow && (
            <p className="text-xs text-muted-foreground">
              Collected by Remi so far: {formatCurrency(selectedShow.collectedPence)}
            </p>
          )}
        </CardContent>
      </Card>

      {showId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Figures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {previewLoading || !preview ? (
              <div className="h-24 animate-pulse rounded-lg bg-muted" />
            ) : (
              <>
                {preview.captureGapCount > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {preview.captureGapCount} payment{preview.captureGapCount === 1 ? '' : 's'} missing
                      captured fee data — figures may be incomplete.
                    </span>
                  </div>
                )}
                <FigureRow label="Income collected by us" value={preview.incomeCollectedByUsPence} />
                <FigureRow label="Income paid direct to bank" value={preview.incomePaidDirectPence} />
                <FigureRow label="Total income" value={preview.totalIncomePence} bold />
                <FigureRow
                  label="Card processing fee total"
                  value={preview.cardFeeTotalPence}
                  sub={`${preview.feeBearingChargeCount} card payments`}
                />
                <FigureRow
                  label="Remi discount"
                  value={-preview.discountTotalPence}
                  credit
                  sub={`${formatCurrency(preview.perTransactionDiscountPence)} × ${preview.feeBearingChargeCount}`}
                />
                <FigureRow label="Total card processing fee due" value={preview.cardFeeDueTotalPence} bold />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {showId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Package fee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="package-fee">Amount (£)</Label>
              <Input
                id="package-fee"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={packageFee}
                onChange={(e) => setPackageFee(e.target.value)}
                className="min-h-[2.75rem]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="package-fee-description">Description</Label>
              <Textarea
                id="package-fee-description"
                value={packageFeeDescription}
                onChange={(e) => setPackageFeeDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 text-muted-foreground"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                <ChevronDown className={cn('size-3.5 transition-transform', showAdvanced && 'rotate-180')} />
                Advanced
              </Button>
              {showAdvanced && (
                <div className="space-y-1.5 pt-2">
                  <Label htmlFor="discount-pence">Per-transaction discount (pence)</Label>
                  <Input
                    id="discount-pence"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={discountPence}
                    onChange={(e) => setDiscountPence(e.target.value)}
                    className="min-h-[2.75rem] max-w-[10rem]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Defaults to {formatCurrency(DEFAULT_DISCOUNT_PENCE)} per card payment — Remi&apos;s
                    negotiated Stripe discount.
                  </p>
                </div>
              )}
            </div>

            {preview && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Total fee due</span>
                  <span>{formatCurrency(preview.cardFeeDueTotalPence + packageFeePence)}</span>
                </div>
              </div>
            )}

            <Button
              className="min-h-[2.75rem] w-full"
              disabled={!canIssue || isSubmitting}
              onClick={handleIssue}
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileCheck2 className="size-4" />
              )}
              {supersedesId ? 'Issue correction' : 'Issue invoice'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FigureRow({
  label,
  value,
  sub,
  bold,
  credit,
}: {
  label: string;
  value: number;
  sub?: string;
  bold?: boolean;
  credit?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div>
        <p className={cn(bold && 'font-semibold')}>{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <p className={cn(bold && 'font-semibold', credit && 'text-se-fresh-deep')}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
