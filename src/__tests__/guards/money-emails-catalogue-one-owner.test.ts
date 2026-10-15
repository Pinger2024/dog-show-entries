import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles } from '../helpers/static-scan';

// GUARD (15 Oct 2026): three rules that each lived in more than one place and
// disagreed in front of real exhibitors. Each now has ONE owner; this fails the
// suite when a second copy appears. If it fails, call the owner instead.
//
// 1. What the card is charged = the club's money + Remi's booking fee —
//    lib/fee-calc.ts amountChargedPence. Every Entry Confirmed email said
//    "Total Paid" was the club's money alone (570C11A8: charged £21.20, the
//    email said £20.00), because each receipt and checkout did its own sum.
// 2. Who is told when an order is paid (receipt + secretary notice) —
//    services/email.ts sendOrderPaidEmails. Only the Stripe webhook sent them,
//    so a £0 order (mostly junior handlers) was silent.
// 3. When exhibitors get the online catalogue (status AND the morning of the
//    show) — lib/catalogue-utils.ts isCatalogueReleasedToExhibitors. My Entries
//    checked the status alone and offered the catalogue from close.
// 4. How a secretary-entered entry was paid, and how that reads — the list in
//    lib/manual-payment-method.ts. The dialog, the router's input and the
//    exhibitor's confirmation each wrote it out by hand (15 Oct 2026).

const SRC = path.join(__dirname, '..', '..');

function sourceFiles(): Array<{ file: string; text: string }> {
  return findFiles('src', ['.ts', '.tsx'])
    .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`) && !/\.test\.(ts|tsx)$/.test(f))
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }));
}

type Rule = { owner: string; label: string; re: RegExp };

const RULES: Rule[] = [
  {
    owner: path.join('lib', 'fee-calc.ts'),
    label: 'club total + booking fee summed inline (use amountChargedPence)',
    re: /[\w.]*(total|subtotal|feediff)\w*\s*\+\s*[\w.]*platformfee\w*|[\w.]*platformfee\w*\s*\+\s*[\w.]*(total|subtotal|feediff)\w*/i,
  },
  {
    owner: path.join('server', 'services', 'email.ts'),
    label: 'order emails called directly (use sendOrderPaidEmails)',
    re: /\b(sendEntryConfirmationEmail|sendSecretaryNotificationEmail)\s*\(/,
  },
  {
    owner: path.join('lib', 'catalogue-utils.ts'),
    label: 'catalogue release decided outside catalogue-utils (use isCatalogueReleasedToExhibitors)',
    re: /\bCATALOGUE_AVAILABLE_STATUSES\b/,
  },
  {
    owner: path.join('lib', 'manual-payment-method.ts'),
    label: 'manual payment methods written out by hand (use MANUAL_PAYMENT_METHODS)',
    re: /['"](postal|cash|bank_transfer)['"]/,
  },
];

export function findSecondCopies(files: Array<{ file: string; text: string }>): string[] {
  const hits: string[] = [];
  for (const { file, text } of files) {
    text.split('\n').forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
      for (const rule of RULES) {
        if (file.endsWith(rule.owner)) continue;
        if (rule.re.test(line)) hits.push(`${path.relative(SRC, file)}:${i + 1}  ${rule.label}`);
      }
    });
  }
  return hits;
}

describe('money, order emails and catalogue release each have one owner', () => {
  it('no second copy anywhere in src', () => {
    expect(findSecondCopies(sourceFiles())).toEqual([]);
  });

  it('the scanner catches each pattern, and lets the owner through', () => {
    const bad = [
      'const grossAmount = totalAmount + platformFeePence;',
      'const grossPence = subtotalPence + platformFeePence;',
      'orderPaymentSummary(order.payments, order.totalAmount + order.platformFeePence);',
      'const previewGrandTotal = previewSubtotal + previewPlatformFee;',
      'const grossAmount = feeDiff + platformFeePence;',
      'sendEntryConfirmationEmail(orderId).catch(() => {});',
      'await sendSecretaryNotificationEmail(order.id);',
      'isAvailable: CATALOGUE_AVAILABLE_STATUSES.has(r.showStatus),',
      "paymentMethod: z.enum(['postal', 'cash', 'bank_transfer', 'online']).default('bank_transfer'),",
      '<SelectItem value="postal">Postal (cheque)</SelectItem>',
    ];
    for (const text of bad) {
      expect(findSecondCopies([{ file: path.join(SRC, 'x.ts'), text }]), text).not.toEqual([]);
    }
    expect(findSecondCopies([{ file: path.join(SRC, 'lib', 'fee-calc.ts'), text: bad[0]! }])).toEqual([]);
    expect(findSecondCopies([{ file: path.join(SRC, 'server', 'services', 'email.ts'), text: bad[5]! }])).toEqual([]);
    expect(findSecondCopies([{ file: path.join(SRC, 'lib', 'catalogue-utils.ts'), text: bad[7]! }])).toEqual([]);
    expect(findSecondCopies([{ file: path.join(SRC, 'lib', 'manual-payment-method.ts'), text: bad[8]! }])).toEqual([]);
    // Sums of fees alone are not the rule (admin income, metrics accumulators).
    expect(findSecondCopies([{ file: path.join(SRC, 'x.ts'), text: 'income: src.reduce((a, s) => a + s.platformFeePence, 0),' }])).toEqual([]);
  });
});
