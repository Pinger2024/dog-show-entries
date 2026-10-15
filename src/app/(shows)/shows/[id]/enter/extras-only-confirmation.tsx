'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Check, Mail } from 'lucide-react';
import { formatCurrency } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { SecLabel, SEButton, SECard, SEDarkPanel } from '@/components/show-experience/kit';
import { SE_H } from '@/components/show-experience/tokens';
import { Confetti } from '@/components/show-experience/confetti';
import type { catalogueNoteFor } from '@/lib/sundry-kind';
import { CatalogueNote } from './catalogue-note';

export interface ExtrasOnlyConfirmationProps {
  firstName?: string | null;
  userEmail?: string | null;
  showName: string;
  showSlugOrId: string;
  startDate: string;
  venueName?: string | null;
  orderId: string | null;
  paymentAmount: number;
  items: { sundryItemId: string; name: string; quantity: number; unitPrice: number }[];
  /** What to tell them about a catalogue - from `catalogueNoteFor`
   *  (lib/sundry-kind.ts), the same answer the receipt email gives. */
  catalogueNote: ReturnType<typeof catalogueNoteFor>;
  /** Whether the order includes a parking pass (`includesParkingPass`). */
  hasParking: boolean;
}

/**
 * The confirmation screen for an order with NO dog (Mandy, 15 Oct 2026) —
 * extras bought on their own. Deliberately has no "You're entered", no share
 * card and no "Enter more dogs": nothing was entered. Kept in its own file so
 * the dog confirmation in page.tsx stays exactly as it was.
 */
export function ExtrasOnlyConfirmation({
  firstName,
  userEmail,
  showName,
  showSlugOrId,
  startDate,
  venueName,
  orderId,
  paymentAmount,
  items,
  catalogueNote,
  hasParking,
}: ExtrasOnlyConfirmationProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-[160ms] motion-reduce:animate-none">
      <Confetti />
      <SEDarkPanel
        angle={178}
        className="px-5 pt-[10px] pb-[26px] text-center"
        glowPosition="-left-[50px] top-5"
        glowSize="size-[200px]"
        glowOpacity="opacity-25"
      >
        <div className="se-disc-spring-in relative mx-auto flex size-16 items-center justify-center rounded-full bg-se-fresh text-[#0e2c19] shadow-[0_16px_34px_-14px_rgba(0,0,0,0.55)]">
          <Check className="size-8" />
        </div>
        <h2 className={cn(SE_H, 'relative mt-3.5 text-balance text-[29px] text-se-cream')}>
          Thank you{firstName ? `, ${firstName}` : ''}!
        </h2>
        <p className="relative mt-1.5 text-[13.5px] text-se-cream/80">
          Your order is confirmed
          {paymentAmount > 0 ? <> &middot; {formatCurrency(paymentAmount)} paid</> : null}
        </p>
        {userEmail && (
          <p className="relative mt-3 inline-flex items-center gap-1.5 text-xs text-se-cream/75">
            <Mail className="size-3.5" />
            Receipt sent to {userEmail}
          </p>
        )}
      </SEDarkPanel>

      <div className="-mt-0.5 space-y-6 rounded-t-[22px] bg-se-paper px-4 pt-[18px] pb-7">
        <SECard className="p-4">
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold text-se-ink">{showName}</p>
              <p className="text-xs text-se-ink3">
                {format(parseISO(startDate), 'd MMMM yyyy')}
                {venueName ? ` · ${venueName}` : ''}
              </p>
            </div>
            {orderId && (
              <div className="flex justify-between">
                <span className="text-se-ink3">Order Reference</span>
                <span className="font-mono font-medium text-se-ink">
                  {orderId.slice(0, 8).toUpperCase()}
                </span>
              </div>
            )}
            <div className="space-y-1.5 border-t border-se-line pt-3">
              {items.map((item) => (
                <div key={item.sundryItemId} className="flex justify-between gap-3">
                  <span className="min-w-0 text-se-ink">
                    {item.name}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                  </span>
                  <span className="shrink-0 text-se-ink3">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-se-line pt-3 text-base font-bold text-se-ink">
              <span>Paid</span>
              <span>{formatCurrency(paymentAmount)}</span>
            </div>
          </div>
        </SECard>

        <CatalogueNote note={catalogueNote} />

        {hasParking && (
          <SECard className="mx-auto w-full max-w-md border-se-fresh-line bg-se-fresh-soft p-4 text-center">
            <p className="text-sm font-semibold text-se-fresh-deep">Parking pass ordered</p>
            <p className="mt-1 text-xs text-se-ink2">
              We&apos;ll email your parking pass about a week before the show. You can also
              download it any time from My entries and orders.
            </p>
          </SECard>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <SEButton asChild variant="fresh" size="sm">
            <Link href="/entries">View my entries and orders</Link>
          </SEButton>
          <SEButton asChild variant="ghost" size="sm">
            <Link href={`/shows/${showSlugOrId}`}>Back to the show</Link>
          </SEButton>
        </div>
      </div>
    </div>
  );
}
