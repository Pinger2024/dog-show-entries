'use client';

import { useState } from 'react';
import { FileClock } from 'lucide-react';
import { registrationFlagSuffix } from '@/lib/registration-flags';

export type RegistrationFlagValues = {
  naf: boolean;
  taf: boolean;
  cnaf: boolean;
  /** Authority to Compete number for an overseas dog, e.g. ATC01234SWE. */
  atcNumber: string;
};

/** Only the pending-paperwork ticks — ATC is a number, handled separately. */
type FlagKey = 'naf' | 'taf' | 'cnaf';

const OPTIONS: ReadonlyArray<{
  key: FlagKey;
  short: string;
  label: string;
  hint: string;
}> = [
  {
    key: 'naf',
    short: 'NAF',
    label: 'Name applied for',
    hint: "You've applied to register the name but it hasn't come back yet",
  },
  {
    key: 'taf',
    short: 'TAF',
    label: 'Transfer applied for',
    hint: "You've applied to transfer the dog into your name",
  },
  {
    key: 'cnaf',
    short: 'CNAF',
    label: 'Change of name applied for',
    hint: "You've applied to change the dog's registered name",
  },
];

/**
 * Optional RKC-paperwork control shown against a dog on the cart-review step.
 *
 * Almost nobody needs this, and the audience is not confident with computers,
 * so it stays collapsed behind one plain-English question until asked for.
 * Once a flag is set it shows a permanent summary, so it can never be silently
 * on. These are per SHOW — the wording says so, because the whole reason it
 * isn't on the dog's profile is that people would forget to clear it.
 */
export function RegistrationFlagsField({
  value,
  onChange,
  idPrefix,
}: {
  value: RegistrationFlagValues;
  onChange: (next: RegistrationFlagValues) => void;
  idPrefix: string;
}) {
  const anySet = value.naf || value.taf || value.cnaf || value.atcNumber.trim() !== '';
  const [open, setOpen] = useState(anySet);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[2.75rem] items-center gap-2 text-left text-sm font-medium text-se-ink2 underline underline-offset-4 hover:text-se-ink"
      >
        <FileClock className="size-4 shrink-0" />
        {/* The letters are the hook: an exhibitor whose paperwork is pending is
            already thinking "NAF" and will scan for it, not for "paperwork". */}
        <span>
          Waiting on RKC paperwork?{' '}
          <span className="whitespace-nowrap font-semibold">NAF / TAF</span>
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-se-line bg-se-paper2/50 p-3">
      <p className="text-sm font-semibold text-se-ink">
        Waiting on RKC paperwork? <span className="text-se-ink3">(NAF / TAF / CNAF)</span>
      </p>
      <p className="mt-0.5 text-xs text-se-ink3">
        Only tick these if you&apos;ve sent something to the RKC and it hasn&apos;t come back yet.
        It prints after the dog&apos;s name in this show&apos;s catalogue, and applies to this
        show only.
      </p>

      <div className="mt-2 space-y-1">
        {OPTIONS.map((opt) => {
          const id = `${idPrefix}-${opt.key}`;
          return (
            <label
              key={opt.key}
              htmlFor={id}
              className="flex min-h-[2.75rem] cursor-pointer items-start gap-3 rounded-md px-1 py-1.5 hover:bg-se-paper2"
            >
              <input
                id={id}
                type="checkbox"
                checked={value[opt.key]}
                onChange={(e) => onChange({ ...value, [opt.key]: e.target.checked })}
                className="mt-1 size-5 shrink-0 accent-se-green"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-se-ink">
                  {opt.label} <span className="text-se-ink3">({opt.short})</span>
                </span>
                <span className="block text-xs text-se-ink3">{opt.hint}</span>
              </span>
            </label>
          );
        })}
      </div>

      {/* ATC is different in kind from the three above — it is GRANTED, not
          pending, and carries a number — so it gets a field, not a tick. */}
      <div className="mt-3 border-t border-se-line pt-3">
        <label
          htmlFor={`${idPrefix}-atc`}
          className="block text-sm font-medium text-se-ink"
        >
          Authority to Compete number (ATC)
        </label>
        <p className="mt-0.5 text-xs text-se-ink3">
          Only for a dog living outside the UK. Leave blank otherwise.
        </p>
        <input
          id={`${idPrefix}-atc`}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. ATC01234SWE"
          value={value.atcNumber}
          onChange={(e) => onChange({ ...value, atcNumber: e.target.value })}
          className="mt-1.5 min-h-[2.75rem] w-full rounded-md border border-se-line bg-white px-3 py-2 text-sm text-se-ink placeholder:text-se-ink3 focus:border-se-green focus:outline-none"
        />
      </div>

      {anySet && (
        <p className="mt-3 text-xs font-medium text-se-ink2">
          Will print as: <span className="font-semibold">Dog&apos;s name{registrationFlagSuffix(value)}</span>
        </p>
      )}
    </div>
  );
}
