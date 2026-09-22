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
 * Used by entries.update (server), the Edit Classes button on the entry page
 * and the edit page itself.
 */
export type EntryClassChangeBlock = 'not_paid' | 'show_not_open';

export function entryClassChangeBlock(
  entry: { status: string },
  show: { status: string },
): EntryClassChangeBlock | null {
  if (entry.status !== 'confirmed') return 'not_paid';
  if (show.status !== 'entries_open') return 'show_not_open';
  return null;
}

export function canChangeEntryClasses(entry: { status: string }, show: { status: string }): boolean {
  return entryClassChangeBlock(entry, show) === null;
}

export const ENTRY_CLASS_CHANGE_MESSAGES: Record<EntryClassChangeBlock, string> = {
  not_paid: 'Only a paid entry can have its classes changed. Please finish paying for this entry first.',
  show_not_open: 'Show is no longer accepting entry changes',
};
