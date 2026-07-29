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
  const [packageFeeDescription, setPackageFeeDescription] = useState('Catalogue package');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [discountMode, setDiscountMode] = useState<'perTransaction' | 'percent' | 'fixed'>('perTransaction');
  const [discountValue, setDiscountValue] = useState(String(DEFAULT_DISCOUNT_PENCE));
  const [discountLabel, setDiscountLabel] = useState('Remi discount');
  const [startingNumber, setStartingNumber] = useState('');

  const { data: shows } = trpc.admin.listAllShows.useQuery();
  const selectedShow = shows?.find((s) => s.id === showId);

  const packageFeePence = poundsToPence(parseFloat(packageFee || '0'));
  const discountValueParsed = parseInt(discountValue || '0', 10);
  const startingNumberParsed = startingNumber.trim() === '' ? undefined : parseInt(startingNumber, 10);

  const previewInput =
    showId && !Number.isNaN(packageFeePence) && !Number.isNaN(discountValueParsed)
      ? {
          showId,
          packageFeePence,
          packageFeeDescription: packageFeeDescription || 'Catalogue package',
          discount: { mode: discountMode, value: discountValueParsed, label: discountLabel || 'Remi discount' },
          ...(startingNumberParsed != null && !Number.isNaN(startingNumberParsed)
            ? { startingNumber: startingNumberParsed }
            : {}),
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
                {preview.settlement.captureGapCount > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-se-honey-line bg-se-honey-soft/50 p-3 text-sm text-se-honey-deep">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {preview.settlement.captureGapCount} payment
                      {preview.settlement.captureGapCount === 1 ? '' : 's'} missing captured fee data — figures may
                      be incomplete.
                    </span>
                  </div>
                )}
                <SectionRows title={preview.settlement.viaRemi.title} section={preview.settlement.viaRemi} />
                <SectionRows title={preview.settlement.direct.title} section={preview.settlement.direct} />
                {preview.settlement.free.lines.length > 0 && (
                  <SectionRows title={preview.settlement.free.title} section={preview.settlement.free} />
                )}
                <p className="text-xs text-muted-foreground">{preview.settlement.totalEntriesLine}</p>
                <SectionRows title={preview.settlement.costs.title} section={preview.settlement.costs} />
                <FigureRow label="Net to credit the club" value={preview.settlement.netToClubPence} bold />
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
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="discount-mode">Discount type</Label>
                    <Select value={discountMode} onValueChange={(v) => setDiscountMode(v as typeof discountMode)}>
                      <SelectTrigger id="discount-mode" className="min-h-[2.75rem] w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="perTransaction">Per card payment (pence)</SelectItem>
                        <SelectItem value="percent">Percent off card fees</SelectItem>
                        <SelectItem value="fixed">Fixed amount (pence)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="discount-value">
                      {discountMode === 'percent' ? 'Percent (e.g. 40)' : 'Amount (pence)'}
                    </Label>
                    <Input
                      id="discount-value"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      className="min-h-[2.75rem] max-w-[10rem]"
                    />
                    <p className="text-xs text-muted-foreground">
                      {discountMode === 'perTransaction'
                        ? `Defaults to ${formatCurrency(DEFAULT_DISCOUNT_PENCE)} per card payment — Remi's negotiated Stripe discount.`
                        : discountMode === 'percent'
                          ? 'Whole-number percent off the card processing fee total.'
                          : 'A single flat amount off the card processing fee total.'}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="discount-label">Discount label on the statement</Label>
                    <Input
                      id="discount-label"
                      value={discountLabel}
                      onChange={(e) => setDiscountLabel(e.target.value)}
                      className="min-h-[2.75rem]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="starting-number">Starting invoice number (first issue only)</Label>
                    <Input
                      id="starting-number"
                      type="number"
                      min="1"
                      inputMode="numeric"
                      placeholder="1"
                      value={startingNumber}
                      onChange={(e) => setStartingNumber(e.target.value)}
                      className="min-h-[2.75rem] max-w-[10rem]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Only applies the first time this club is issued a statement — leave blank to start at 1.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {preview && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Net to credit the club</span>
                  <span>{formatCurrency(preview.settlement.netToClubPence)}</span>
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

function SectionRows({
  title,
  section,
}: {
  title: string;
  section: { lines: { label: string; sub?: string; amountPence: number; isCredit?: boolean }[]; totalLabel: string; totalPence: number };
}) {
  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {section.lines.map((l, i) => (
        <FigureRow key={i} label={l.label} sub={l.sub} value={l.amountPence} credit={l.isCredit} />
      ))}
      <div className="border-t pt-1.5">
        <FigureRow label={section.totalLabel} value={section.totalPence} bold />
      </div>
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
