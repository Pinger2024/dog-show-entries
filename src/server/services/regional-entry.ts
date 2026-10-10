/**
 * The regional once-per-dog rule (Amanda 2026-05-26: at a regional a dog is
 * entered once, in one class) — ONE owner for "is this dog already on this
 * regional". A dog whose entry has LEFT the show (withdrawn, or cancelled by a
 * refund — `LEFT_SHOW_STATUSES`) may be entered again (Mandy, 30 Sept 2026:
 * "yes it should be allowed"). Used by entries.create and orders.checkout,
 * which each used to carry their own copy counting ANY non-deleted entry.
 */
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { entries } from '@/server/db/schema';
import { LEFT_SHOW_STATUSES } from '@/lib/entry-counts';

export async function dogAlreadyOnRegional(db: Database, dogId: string, showId: string): Promise<boolean> {
  const onShow = await db.query.entries.findFirst({
    where: and(
      eq(entries.dogId, dogId),
      eq(entries.showId, showId),
      isNull(entries.deletedAt),
      notInArray(entries.status, [...LEFT_SHOW_STATUSES]),
    ),
    columns: { id: true },
  });
  return onShow != null;
}
