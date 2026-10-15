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
 * The online copy unlocks for exhibitors on the morning of the show (Amanda,
 * 28 May 2026 — catalogueShowDayGate), so the wording says that, as the
 * receipt email and the catalogue page do; it used to say "once entries
 * close", which was never true.
 */
export function CatalogueNote({ note }: { note: ReturnType<typeof catalogueNoteFor> }) {
  if (!note) return null;
  return (
    <SECard className="mx-auto w-full max-w-md border-se-fresh-line bg-se-fresh-soft p-4 text-center">
      <p className="text-sm font-semibold text-se-fresh-deep">
        {note === 'online' ? 'Online Catalogue Purchased' : 'Catalogue Pre-ordered'}
      </p>
      <p className="mt-1 text-xs text-se-ink2">
        {note === 'online' ? (
          <>
            Your catalogue unlocks on the morning of the show. We&apos;ll email you the link first
            thing that day, and you&apos;ll find it under{' '}
            <Link href="/entries" className="underline font-medium text-se-fresh-deep">
              My entries and orders
            </Link>{' '}
            too.
          </>
        ) : (
          <>Collect your printed catalogue from the secretary&apos;s table on the day.</>
        )}
      </p>
    </SECard>
  );
}
