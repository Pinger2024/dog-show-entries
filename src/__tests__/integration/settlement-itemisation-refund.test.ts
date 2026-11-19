import { describe, it, expect } from 'vitest';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeDog,
  makeEntry,
  makeOrder,
  makePayment,
} from '../helpers/factories';
import { computeSettlementItemisation } from '@/server/services/settlement-itemisation';
import { computeShowMetrics } from '@/server/services/show-metrics';
import { db } from '@/server/db';
import type { SettlementSection, SettlementLine } from '@/server/db/schema/invoices';

/**
 * Reproduces the real GSD Club of Scotland bug (invoice
 * INV-GSD-CLUB-OF-SCOTLAND-0001, flagged 2026-09-04): a fully refunded
 * order's entries never appear in the "Entries" lines (correctly excluded
 * because the order's status is 'refunded', not 'paid'), but the "Refunds
 * to exhibitors" credit line summed EVERY payments.type='refund' row for
 * the whole show — including this order's refund — and subtracted it a
 * SECOND time. The club was under-settled by the full refund amount
 * (which also wrongly included Remi's platform fee, never club money).
 *
 * The same double-count hits a per-entry refund on a still-'paid' order
 * whenever the refund pushes the entry to status='cancelled' (a withdrawn
 * entry refunded in full, or a confirmed entry's refund that clears the
 * whole order-payment) — that entry is already excluded from every entry
 * line by its status, so crediting the refund on top double-subtracts it
 * again.
 *
 * A refund line is still genuinely needed when the entry ISN'T excluded —
 * a partial refund on an entry that stays 'confirmed' or 'withdrawn' (the
 * secretary refunded only part of the fee, per financial/page.tsx "Refund
 * fee" on a confirmed OR withdrawn entry) still shows its full totalFee in
 * the Entries/Withdrawn lines, so the money that actually went back must
 * still be credited or the club statement overstates what it's owed.
 */

const NO_DISCOUNT = { mode: 'fixed' as const, value: 0, label: 'No discount' };
const ITEMISATION_OPTS = {
  packageFeePence: 0,
  packageFeeDescription: 'Test package fee',
  discount: NO_DISCOUNT,
};

function findLines(section: SettlementSection, label: string): SettlementLine[] {
  return section.lines.filter((l) => l.label === label);
}

describe('computeSettlementItemisation — refund double-counting', () => {
  it('a fully refunded order contributes nothing to viaRemi AND no refund credit — total equals clubReceivablePence', async () => {
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Test Scotland Reproduction Club' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    // A healthy paid order — untouched by the refund.
    const orderA = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 5000 });
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderA.id, totalFee: 5000 });

    // The fully refunded order (GSD Club of Scotland shape): two £18.00
    // entries (now cancelled), order total £51.00 (incl. discount say
    // none here) + platform fee £1.51, refunded in full via refundOrder
    // (entryId is null on the refund row — a whole-order refund).
    const orderB = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'refunded', totalAmount: 3600 });
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderB.id, totalFee: 1800, status: 'cancelled' });
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderB.id, totalFee: 1800, status: 'cancelled' });
    await makePayment({ orderId: orderB.id, stripePaymentId: 'pi_scotland', amount: 3751, status: 'refunded', refundAmount: 3751 });
    // The refund row includes Remi's £1.51 platform fee — 51.00 + 1.51 — exactly like the real case.
    await makePayment({ orderId: orderB.id, stripePaymentId: 'pi_scotland', amount: 3751, status: 'refunded', type: 'refund' });

    const itemisation = await computeSettlementItemisation(db, show.id, ITEMISATION_OPTS);
    const metrics = await computeShowMetrics(db, show.id);

    expect(findLines(itemisation.viaRemi, 'Refunds to exhibitors')).toEqual([]);
    expect(itemisation.viaRemi.totalPence).toBe(5000);
    expect(itemisation.viaRemi.totalPence).toBe(metrics.clubReceivablePence);
  });

  it('a withdrawn entry refunded in full (order stays paid, entry becomes cancelled) is excluded once, not twice', async () => {
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Test Withdrawn Refund Club' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    // One order, two entries: one stays confirmed, the other was withdrawn
    // then fully refunded (per secretary.issueRefund's withdrawnFullyRefunded
    // path) — the order itself never fully clears, so it stays 'paid'.
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2000 });
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: order.id, totalFee: 800 });
    const cancelledEntry = await makeEntry({
      showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: order.id, totalFee: 1200, status: 'cancelled',
    });
    await makePayment({
      orderId: order.id, stripePaymentId: 'pi_withdrawn_refund', amount: 2000, status: 'partially_refunded', refundAmount: 1200,
    });
    await makePayment({
      orderId: order.id, entryId: cancelledEntry!.id, stripePaymentId: 'pi_withdrawn_refund', amount: 1200, status: 'refunded', type: 'refund',
    });

    const itemisation = await computeSettlementItemisation(db, show.id, ITEMISATION_OPTS);
    const metrics = await computeShowMetrics(db, show.id);

    expect(findLines(itemisation.viaRemi, 'Entries')).toEqual([{ label: 'Entries', sub: '1 @ £8.00', amountPence: 800 }]);
    expect(findLines(itemisation.viaRemi, 'Refunds to exhibitors')).toEqual([]);
    expect(itemisation.viaRemi.totalPence).toBe(800);
    expect(itemisation.viaRemi.totalPence).toBe(metrics.clubReceivablePence);
  });

  it('a genuine partial refund on an entry that stays confirmed still shows as a credit — the club statement must not overstate what it collected', async () => {
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Test Confirmed Partial Refund Club' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    // A second entry keeps the order-payment from fully clearing, so the
    // refunded entry stays 'confirmed' (not cancelled) — a price
    // correction / partial goodwill refund, not a withdrawal.
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 3000 });
    const refundedEntry = await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: order.id, totalFee: 2000 });
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: order.id, totalFee: 1000 });
    await makePayment({
      orderId: order.id, stripePaymentId: 'pi_partial_confirmed', amount: 3000, status: 'partially_refunded', refundAmount: 500,
    });
    await makePayment({
      orderId: order.id, entryId: refundedEntry!.id, stripePaymentId: 'pi_partial_confirmed', amount: 500, status: 'refunded', type: 'refund',
    });

    const itemisation = await computeSettlementItemisation(db, show.id, ITEMISATION_OPTS);
    const metrics = await computeShowMetrics(db, show.id);

    expect(findLines(itemisation.viaRemi, 'Entries')).toEqual([
      { label: 'Entries', sub: '1 @ £10.00', amountPence: 1000 },
      { label: 'Entries', sub: '1 @ £20.00', amountPence: 2000 },
    ]);
    expect(findLines(itemisation.viaRemi, 'Refunds to exhibitors')).toEqual([
      { label: 'Refunds to exhibitors', amountPence: -500, isCredit: true },
    ]);
    expect(itemisation.viaRemi.totalPence).toBe(2500);
    expect(itemisation.viaRemi.totalPence).toBe(metrics.clubReceivablePence);
  });
});
