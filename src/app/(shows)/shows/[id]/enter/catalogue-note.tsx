'use client';

import Link from 'next/link';
import { SECard } from '@/components/show-experience/kit';
import type { catalogueNoteFor } from '@/lib/sundry-kind';

/**
 * The "you've bought a catalogue" note on the confirmation screen — the same
 * card for a dog entry and for extras bought with no dog, so the two can't
 * drift apart. What to say comes from `catalogueNoteFor` (lib/sundry-kind.ts),
 * which the receipt email asks too. Printed buyers are told to collect it on
 * the day and NOT that the online copy comes with it (Mandy, 15 Oct 2026).
 */
export function CatalogueNote({
  note,
  catalogueHref,
}: {
  note: ReturnType<typeof catalogueNoteFor>;
  catalogueHref: string;
}) {
  if (!note) return null;
  return (
    <SECard className="mx-auto w-full max-w-md border-se-fresh-line bg-se-fresh-soft p-4 text-center">
      <p className="text-sm font-semibold text-se-fresh-deep">
        {note === 'online' ? 'Online Catalogue Purchased' : 'Catalogue Pre-ordered'}
      </p>
      <p className="mt-1 text-xs text-se-ink2">
        {note === 'online' ? (
          <>
            Your catalogue will be available at{' '}
            <Link href={catalogueHref} className="underline font-medium text-se-fresh-deep">
              this link
            </Link>{' '}
            once entries close.
          </>
        ) : (
          <>Collect your printed catalogue from the secretary&apos;s table on the day.</>
        )}
      </p>
    </SECard>
  );
}
