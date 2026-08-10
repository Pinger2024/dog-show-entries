'use client';

import { useState } from 'react';
import { FileClock } from 'lucide-react';
import { registrationFlagSuffix } from '@/lib/registration-flags';

export type RegistrationFlagValues = { naf: boolean; taf: boolean; cnaf: boolean };

const OPTIONS: ReadonlyArray<{
  key: keyof RegistrationFlagValues;
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
  const anySet = value.naf || value.taf || value.cnaf;
  const [open, setOpen] = useState(anySet);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[2.75rem] items-center gap-2 text-left text-sm font-medium text-se-ink2 underline underline-offset-4 hover:text-se-ink"
      >
        <FileClock className="size-4 shrink-0" />
        Waiting on RKC paperwork?
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-se-line bg-se-paper2/50 p-3">
      <p className="text-sm font-semibold text-se-ink">Waiting on RKC paperwork?</p>
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

      {anySet && (
        <p className="mt-2 text-xs font-medium text-se-ink2">
          Will print as: <span className="font-semibold">Dog&apos;s name{registrationFlagSuffix(value)}</span>
        </p>
      )}
    </div>
  );
}
