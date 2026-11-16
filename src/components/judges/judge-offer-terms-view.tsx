'use client';

/**
 * The secretary's view of a judge offer's standard terms and of the judge's
 * answer about appointments already agreed. The words come from
 * src/lib/judge-offer-terms.ts — nothing here writes a term itself.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import {
  alreadyAgreedAnswerText,
  alreadyAgreedConfirmNoticeText,
  ALREADY_AGREED_LABEL,
  JUDGE_OFFER_TERMS_HEADING,
  LIVES_OVERSEAS_HINT,
  LIVES_OVERSEAS_LABEL,
  SOCIETY_TERMS_HEADING,
  type JudgeOfferTerms,
} from '@/lib/judge-offer-terms';

/**
 * The "Lives overseas" box, with the line saying what it does. ONE component
 * for every screen that sets it: the add-judge wizard, the checklist's Add
 * Judge form, Edit judge details and the Send Offer dialog. The whole row is
 * the tap target (44px or more); 16px text on a phone; it wraps, never
 * scrolls sideways. Each screen shows it only where
 * `showCarriesJudgeOfferTerms` says the show carries terms.
 */
export function LivesOverseasField({
  id,
  checked,
  disabled = false,
  onCheckedChange,
  className,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  const hintId = `${id}-hint`;
  return (
    <label
      htmlFor={id}
      data-lives-overseas
      className={cn(
        'flex w-full min-h-11 items-start gap-3 rounded-md border px-3 py-2.5 text-base sm:text-sm',
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-muted/40',
        className,
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={hintId}
        onCheckedChange={(c) => onCheckedChange(c === true)}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-snug">{LIVES_OVERSEAS_LABEL}</span>
        <span id={hintId} className="mt-0.5 block text-base leading-snug text-muted-foreground sm:text-sm">
          {LIVES_OVERSEAS_HINT}
        </span>
      </span>
    </label>
  );
}

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

/** Above "Confirm All Accepted": tells the secretary how many accepted judges
 *  have declared appointments already agreed, so she reads them first.
 *  Renders nothing when none has. */
export function AlreadyAgreedConfirmNotice({
  judges,
  className,
}: {
  judges: { stage: string | null; alreadyAgreedElsewhere: boolean | null }[];
  className?: string;
}) {
  const count = judges.filter((j) => j.stage === 'offer_accepted' && j.alreadyAgreedElsewhere === true).length;
  const text = alreadyAgreedConfirmNoticeText(count);
  if (!text) return null;
  return (
    <p
      className={cn(
        'rounded-md border border-se-honey-line bg-se-honey-soft px-3 py-2 text-sm text-se-honey-ink',
        className,
      )}
    >
      {text}
    </p>
  );
}
