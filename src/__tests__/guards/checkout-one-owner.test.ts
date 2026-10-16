import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles } from '../helpers/static-scan';

// GUARD (16 Oct 2026): buying extras without signing in (Mandy, 15 Oct) added
// a second door to checkout. Both doors must go through ONE checkout —
// placeOrder in routers/orders.ts — or the entry window, the extras rules,
// the price and the Stripe payment would start to differ between a signed-in
// buyer and a guest. And cancelling an abandoned checkout has one owner,
// cancelAbandonedOrders, because the guest door must only ever cancel the
// order it proves is its own.

const ORDERS = path.join('src', 'server', 'trpc', 'routers', 'orders.ts');

function procedureBlock(text: string, name: string): string {
  const start = text.indexOf(`\n  ${name}: `);
  expect(start, `${name} not found in ${ORDERS}`).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}\w+: (protected|public|secretary|admin)Procedure/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('checkout has one owner', () => {
  const text = readFileSync(ORDERS, 'utf8');

  it.each(['checkout', 'guestCheckout'])('%s hands the order to placeOrder and writes nothing itself', (name) => {
    const block = procedureBlock(text, name);
    expect(block).toMatch(/\bplaceOrder\(/);
    expect(block).not.toMatch(/\.insert\(|createPaymentIntent\(|\.update\(/);
  });

  it('only cancelAbandonedOrders cancels a Stripe payment', () => {
    const offenders = findFiles('src', ['.ts', '.tsx'])
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`) && !f.endsWith(path.join('services', 'stripe.ts')))
      .flatMap((file) => {
        const src = readFileSync(file, 'utf8');
        const calls = src.match(/\bcancelPaymentIntent\(/g)?.length ?? 0;
        if (calls === 0) return [];
        if (file.endsWith(ORDERS) && calls === 1) {
          const owner = src.slice(src.indexOf('async function cancelAbandonedOrders('));
          const ownerBody = owner.slice(0, owner.indexOf('\n}\n'));
          if (/\bcancelPaymentIntent\(/.test(ownerBody)) return [];
        }
        return [`${file} (${calls})`];
      });
    expect(offenders).toEqual([]);
  });
});
