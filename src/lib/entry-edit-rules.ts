import { entryWindowOpen } from '@/lib/show-status';

/**
 * One owner for "can the exhibitor change this entry's classes".
 *
 * Only a PAID entry (status 'confirmed') on a show still taking entries.
 * Bug hunt 2026-09-22: 'pending' was allowed too. A pending entry is one left
 * at checkout's payment step — never paid. Edit Classes charged only the
 * DIFFERENCE for an added class, and the Stripe webhook then confirmed and
 * numbered the whole entry, so the dog reached the catalogue, judges book and
 * ring numbers for a few pounds. An unpaid entry is completed by checking out.
 *
 * "Still taking entries" is entryWindowOpen's call (status AND close date), not
 * a second copy here — a show past its close date whose status the hourly cron
 * hasn't flipped yet is closed.
 *
 * Used by priceEntryClassChange (so entries.update AND previewUpdate), the Edit
 * Classes button on the entry page and the edit page itself.
 */
export type EntryClassChangeBlock = 'not_paid' | 'show_not_open';

type ShowWindow = Parameters<typeof entryWindowOpen>[0];

export function entryClassChangeBlock(
  entry: { status: string },
  show: ShowWindow,
): EntryClassChangeBlock | null {
  if (entry.status !== 'confirmed') return 'not_paid';
  if (!entryWindowOpen(show)) return 'show_not_open';
  return null;
}

export function canChangeEntryClasses(entry: { status: string }, show: ShowWindow): boolean {
  return entryClassChangeBlock(entry, show) === null;
}

export const ENTRY_CLASS_CHANGE_MESSAGES: Record<EntryClassChangeBlock, string> = {
  not_paid: 'Only a paid entry can have its classes changed. Please finish paying for this entry first.',
  show_not_open: 'Show is no longer accepting entry changes',
};
