'use client';

/**
 * The secretary's view of a judge offer's standard terms and of the judge's
 * answer about appointments already agreed. The words come from
 * src/lib/judge-offer-terms.ts — nothing here writes a term itself.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  alreadyAgreedAnswerText,
  ALREADY_AGREED_LABEL,
  JUDGE_OFFER_TERMS_HEADING,
  SOCIETY_TERMS_HEADING,
  type JudgeOfferTerms,
} from '@/lib/judge-offer-terms';

/** "What the judge is asked to agree" — collapsible; starts closed on a phone. */
export function JudgeOfferTermsPreview({
  terms,
  defaultOpen,
}: {
  terms: JudgeOfferTerms | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!terms) return null;
  const count = terms.societyTerms.length;
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-medium"
      >
        <span>
          {JUDGE_OFFER_TERMS_HEADING}
          <span className="block text-xs font-normal text-muted-foreground">
            {count > 0
              ? `The judge agrees to these when accepting, and answers one question.`
              : 'The judge agrees to these when accepting.'}
          </span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 border-t px-4 py-3 text-sm leading-relaxed">
          {terms.invitationParagraphs.map((p, i) => (
            <p key={`inv-${i}`}>{p}</p>
          ))}
          {count > 0 && (
            <>
              <p className="font-semibold">{SOCIETY_TERMS_HEADING}</p>
              <ol className="list-decimal space-y-2 pl-5">
                {terms.societyTerms.map((t, i) => (
                  <li key={`soc-${i}`}>{t}</li>
                ))}
              </ol>
            </>
          )}
          {terms.alreadyAgreedQuestion && (
            <p className="text-muted-foreground">
              When accepting, the judge is asked: &ldquo;{terms.alreadyAgreedQuestion}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The judge's answer, for the secretary to read BEFORE confirming. Renders
 *  nothing when the judge was never asked. A "Yes" stands out. */
export function AlreadyAgreedAnswer({
  contract,
  className,
}: {
  contract: { alreadyAgreedElsewhere: boolean | null; alreadyAgreedDetails: string | null };
  className?: string;
}) {
  const text = alreadyAgreedAnswerText(contract);
  if (text == null) return null;
  const declared = contract.alreadyAgreedElsewhere === true;
  return (
    <div
      className={cn(
        'rounded-md px-3 py-2 text-sm',
        declared ? 'border border-se-honey-line bg-se-honey-soft text-se-honey-ink' : 'bg-muted/50 text-muted-foreground',
        className,
      )}
    >
      <span className="font-medium">{ALREADY_AGREED_LABEL}:</span>{' '}
      <span className="whitespace-pre-line break-words">{text}</span>
    </div>
  );
}
