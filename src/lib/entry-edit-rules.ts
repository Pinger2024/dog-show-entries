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

/**
 * One owner for "can the exhibitor withdraw this entry".
 *
 * Mandy, 30 Sept 2026: "withdrawals should only be made up to closing not
 * afterwards". Up to and including the closing day the exhibitor may withdraw
 * (and the catalogue re-numbers so it runs in order — entries.withdraw); once
 * entries close the catalogue goes to print, so a dog that doesn't come is
 * marked ABSENT on the day instead of vanishing from the printed lists, the
 * absentee list and SH01. Found on North Eastern and Midland, both closed and
 * printed, where the Withdraw button was still offered.
 *
 * "Up to closing" is entryWindowOpen's call — the same rule that decides
 * whether the show still accepts entries — so the two can never disagree.
 *
 * Used by entries.withdraw and the Withdraw button on the entry page.
 */
export type EntryWithdrawBlock = 'already_withdrawn' | 'entries_closed';

export function entryWithdrawBlock(
  entry: { status: string },
  show: ShowWindow,
): EntryWithdrawBlock | null {
  if (entry.status === 'withdrawn' || entry.status === 'cancelled') return 'already_withdrawn';
  if (!entryWindowOpen(show)) return 'entries_closed';
  return null;
}

export function canWithdrawEntry(entry: { status: string }, show: ShowWindow): boolean {
  return entryWithdrawBlock(entry, show) === null;
}

export const ENTRY_WITHDRAW_MESSAGES: Record<EntryWithdrawBlock, string> = {
  already_withdrawn: 'Entry is already withdrawn or cancelled',
  entries_closed:
    'Entries have closed for this show, so the entry can no longer be withdrawn. If your dog can’t come, please let the show secretary know.',
};
