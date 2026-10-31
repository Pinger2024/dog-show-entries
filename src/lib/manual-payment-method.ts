/**
 * How an entry the secretary adds by hand was paid — the Add Entry dialog's
 * "Payment Method". ONE owner for the list and its wording: the dialog's
 * choices, createManualEntry's input and the exhibitor's confirmation email
 * (Mandy, 15 Oct 2026: "so they know they have entered") all read it here.
 */
export const MANUAL_PAYMENT_METHODS = ['bank_transfer', 'postal', 'cash', 'online'] as const;

export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

/** What the dialog starts on, and what the server assumes when none is sent. */
export const DEFAULT_MANUAL_PAYMENT_METHOD: ManualPaymentMethod = 'bank_transfer';

/** What the secretary picks from in the Add Entry dialog. */
export const MANUAL_PAYMENT_METHOD_LABELS: Record<ManualPaymentMethod, string> = {
  bank_transfer: 'Bank Transfer',
  postal: 'Postal (cheque)',
  cash: 'Cash',
  online: 'Online (already paid)',
};

/** How the exhibitor's confirmation says it was paid. */
export function manualPaymentPhrase(method: ManualPaymentMethod): string {
  switch (method) {
    case 'bank_transfer':
      return 'Paid by bank transfer';
    case 'postal':
      return 'Paid by cheque';
    case 'cash':
      return 'Paid in cash';
    case 'online':
      return 'Paid online';
  }
}
