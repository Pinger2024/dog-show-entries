import { describe, it, expect } from 'vitest';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeShowClass,
  makeClassDef,
  makeOrder,
  makePayment,
} from '../helpers/factories';
import { computeSettlementItemisation } from '@/server/services/settlement-itemisation';
import { computeShowMetrics } from '@/server/services/show-metrics';
import { db } from '@/server/db';
import type { SettlementSection, SettlementLine } from '@/server/db/schema/invoices';

/**
 * Reproduces the real Clyde Valley bug (show 19cb637d-8ec0-44fb-9032-
 * f1fc51616d75, flagged by Mandy 2026-08-18): 48 confirmed entries + 1
 * withdrawn entry with total_fee £10 on a PAID order, no refund issued —
 * house rule is the fee stays with the club. The old itemisation built
 * `taggedEntries` from CONFIRMED rows only, so the withdrawn £10 appeared
 * NOWHERE on the settlement even though Remi charged it at Stripe and the
 * club is owed it. Mandy reconciled by hand and expected "46 entries at
 * £10" — the money was invisible, not wrong.
 *
 * These tests assert the itemisation now shows that fee as its own
 * "Withdrawn — fee kept" line (matching the existing wording on the
 * Financial page / entries dashboard — see financial/page.tsx,
 * entries/page.tsx), WITHOUT folding it into the "Entries N @ £X" count
 * (that count drives the total-entries/catalogue footer, and a withdrawn
 * dog isn't printed), and that the numbers reconcile to the penny against
 * the canonical show-metrics engine.
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

describe('computeSettlementItemisation — withdrawn-but-paid entries', () => {
  it('Clyde Valley reproduction: a withdrawn £10 entry shows as its own line, stays out of the Entries count, and reconciles to show-metrics', async () => {
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Clyde Valley Test Show Society' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const jhClassDef = await makeClassDef({ name: 'Junior Handling', type: 'junior_handler' });
    const jhClass = await makeShowClass({ showId: show.id, classDefinitionId: jhClassDef.id, entryFee: 0 });

    // Order A (viaRemi, paid): 45 confirmed @ £10.00 + 2 free JH entries.
    const orderA = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 45_00 * 10 });
    for (let i = 0; i < 45; i++) {
      await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderA.id, totalFee: 1000 });
    }
    for (let i = 0; i < 2; i++) {
      const jhEntry = await makeEntry({
        showId: show.id,
        dogId: dog!.id,
        exhibitorId: exhibitor.id,
        orderId: orderA.id,
        totalFee: 0,
        entryType: 'junior_handler',
      });
      await makeEntryClass({ entryId: jhEntry!.id, showClassId: jhClass!.id, fee: 0 });
    }

    // Order B (direct, paid): 1 confirmed @ £10.00.
    const orderB = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'paid',
      totalAmount: 1000,
      stripePaymentIntentId: null,
    });
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderB.id, totalFee: 1000 });

    // Order C (viaRemi, paid): the withdrawn £10 entry — charged, kept, no refund.
    const orderC = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 1000 });
    await makeEntry({
      showId: show.id,
      dogId: dog!.id,
      exhibitorId: exhibitor.id,
      orderId: orderC.id,
      totalFee: 1000,
      status: 'withdrawn',
    });

    const itemisation = await computeSettlementItemisation(
      db,
      show.id,
      ITEMISATION_OPTS,
    );

    // ── Rule 1: withdrawn fee gets its own line, worded like the existing
    // Financial page convention, NOT folded into "Entries". ──
    const viaRemiEntries = findLines(itemisation.viaRemi, 'Entries');
    expect(viaRemiEntries).toEqual([{ label: 'Entries', sub: '45 @ £10.00', amountPence: 45_000 }]);

    const viaRemiWithdrawn = findLines(itemisation.viaRemi, 'Withdrawn — fee kept');
    expect(viaRemiWithdrawn).toEqual([{ label: 'Withdrawn — fee kept', sub: '1 @ £10.00', amountPence: 1_000 }]);

    expect(itemisation.viaRemi.totalPence).toBe(46_000); // 45,000 confirmed + 1,000 withdrawn-kept
    expect(itemisation.direct.totalPence).toBe(1_000);

    // ── The confirmed-entry counts driving the catalogue/total-entries
    // footer must NOT move — still 47 via Remi (45 + 2 free JH) + 1 direct
    // = 48, exactly as before the withdrawn entry existed. ──
    expect(itemisation.totalEntriesLine).toBe(
      '47 via Remi + 1 direct = 48 (including 2 junior handlers and 0 not-for-competition)',
    );

    // ── Rule 4: reconciles to the penny against the canonical show-metrics
    // engine — paidEntryFeesPence sums confirmed + withdrawn-kept fees on
    // paid orders, with no refunds in this fixture the itemisation's
    // channel totals must sum to exactly that figure. ──
    const metrics = await computeShowMetrics(db, show.id);
    expect(metrics.paidEntryFeesPence).toBe(47_000);
    expect(itemisation.viaRemi.totalPence + itemisation.direct.totalPence).toBe(metrics.paidEntryFeesPence);
  });

  it('mixed-price withdrawn entries group like Entries lines, direct-channel withdrawals show too, and a REFUNDED withdrawal (status=cancelled) never appears as fee kept', async () => {
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Test Mixed Withdrawn Fees Club' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    // Order V1 (viaRemi, paid): 2 confirmed @ £8.00.
    const orderV1 = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 1600 });
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderV1.id, totalFee: 800 });
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderV1.id, totalFee: 800 });

    // Order V2 (viaRemi, paid): withdrawn @ £10.00, fee kept.
    const orderV2 = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 1000 });
    await makeEntry({
      showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderV2.id, totalFee: 1000, status: 'withdrawn',
    });

    // Order V3 (viaRemi, paid): withdrawn @ £15.00, fee kept — a second,
    // different price point to prove the withdrawn line groups mixed fees
    // the same way buildEntryLines groups the Entries line.
    const orderV3 = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 1500 });
    await makeEntry({
      showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderV3.id, totalFee: 1500, status: 'withdrawn',
    });

    // Order V4 (viaRemi, paid): 1 confirmed @ £8.00 + 1 entry that was
    // WITHDRAWN THEN REFUNDED. Per entries.ts / secretary.ts issueRefund, a
    // refunded withdrawal transitions status to 'cancelled' — it never
    // stays 'withdrawn' once the money actually goes back. Modelled here
    // exactly like the real refund flow (stripe-refunds.ts): a payments row
    // with type='refund', AND the running refundAmount on the original
    // payment — both must agree with how show-metrics reads refund state.
    const orderV4 = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2000 });
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderV4.id, totalFee: 800 });
    const orderV4CancelledEntry = await makeEntry({
      showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderV4.id, totalFee: 1200, status: 'cancelled',
    });
    await makePayment({
      orderId: orderV4.id, stripePaymentId: 'pi_v4', amount: 2000, status: 'partially_refunded', refundAmount: 1200,
    });
    // entryId set, matching executeStripeRefund's real behaviour when
    // secretary.issueRefund passes opts.entryId — the refund row is tied to
    // the specific entry it refunded.
    await makePayment({
      orderId: orderV4.id, entryId: orderV4CancelledEntry!.id, stripePaymentId: 'pi_v4', amount: 1200, status: 'refunded', type: 'refund',
    });

    // Order V5 (direct, paid): withdrawn @ £9.00 — rule 3, direct channel.
    const orderV5 = await makeOrder({
      showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 900, stripePaymentIntentId: null,
    });
    await makeEntry({
      showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderV5.id, totalFee: 900, status: 'withdrawn',
    });

    const itemisation = await computeSettlementItemisation(
      db,
      show.id,
      ITEMISATION_OPTS,
    );

    // ── Rule 2: 2 distinct withdrawn prices (≤3) → two separate lines,
    // exactly like buildEntryLines' regular-entries grouping. The £12
    // refunded (cancelled) entry must NOT appear in either. ──
    const viaRemiWithdrawn = findLines(itemisation.viaRemi, 'Withdrawn — fee kept');
    expect(viaRemiWithdrawn).toEqual([
      { label: 'Withdrawn — fee kept', sub: '1 @ £10.00', amountPence: 1_000 },
      { label: 'Withdrawn — fee kept', sub: '1 @ £15.00', amountPence: 1_500 },
    ]);
    const viaRemiWithdrawnTotal = viaRemiWithdrawn.reduce((s, l) => s + l.amountPence, 0);
    expect(viaRemiWithdrawnTotal).toBe(2_500); // NOT 3,700 — the refunded £12 must be excluded

    // ── Rule 3: direct-channel withdrawn entry shows the same way. ──
    const directWithdrawn = findLines(itemisation.direct, 'Withdrawn — fee kept');
    expect(directWithdrawn).toEqual([{ label: 'Withdrawn — fee kept', sub: '1 @ £9.00', amountPence: 900 }]);

    // No spurious "Multi-dog package discount" line — V4's confirmed (£8)
    // + cancelled (£12) components sum to exactly its £20 order total
    // (orderFeeComponentPence includes the cancelled fee), so there's no
    // false gap even though the refund happened after the fact.
    expect(findLines(itemisation.viaRemi, 'Multi-dog package discount')).toEqual([]);

    // The £12 refund fully cancelled its entry (a withdrawn entry refunded
    // in full) — that entry already shows nowhere on the statement (not in
    // Entries, not in Withdrawn — fee kept), so the refund must NOT also
    // appear as a credit line, or the club is under-settled by £12 twice
    // over (fix 2026-09-04, GSD Club of Scotland double-count bug).
    expect(findLines(itemisation.viaRemi, 'Refunds to exhibitors')).toEqual([]);

    // ── Rule 4/5: reconcile precisely against show-metrics' withdrawnKeptPence
    // — the canonical figure for "fee withdrawn entries keep with the
    // club" — which by construction excludes the refunded (cancelled) one. ──
    const metrics = await computeShowMetrics(db, show.id);
    expect(metrics.withdrawnKeptPence).toBe(3_400); // 1,000 + 1,500 + 900 — NOT the refunded 1,200
    expect(metrics.cancelledRefundedPence).toBe(1_200);
    const itemisationWithdrawnTotal =
      findLines(itemisation.viaRemi, 'Withdrawn — fee kept').reduce((s, l) => s + l.amountPence, 0) +
      findLines(itemisation.direct, 'Withdrawn — fee kept').reduce((s, l) => s + l.amountPence, 0);
    expect(itemisationWithdrawnTotal).toBe(metrics.withdrawnKeptPence);
  });

  it('a withdrawn entry sharing an order with a genuine multi-dog discount must not make the club statement overstate what Remi actually collected', async () => {
    const breed = await makeBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg({ name: 'Test Discount Plus Withdrawal Club' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    // 2 dogs at full £20.00 each = £40.00, but a £5.00 multi-dog discount
    // means Stripe only actually charged £35.00. One of the two later
    // withdraws (fee kept, no refund) — the order's totalAmount (the real
    // Stripe charge) never changes.
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 3500 });
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: order.id, totalFee: 2000 });
    await makeEntry({
      showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: order.id, totalFee: 2000, status: 'withdrawn',
    });

    const itemisation = await computeSettlementItemisation(
      db,
      show.id,
      ITEMISATION_OPTS,
    );

    expect(findLines(itemisation.viaRemi, 'Entries')).toEqual([{ label: 'Entries', sub: '1 @ £20.00', amountPence: 2_000 }]);
    expect(findLines(itemisation.viaRemi, 'Withdrawn — fee kept')).toEqual([
      { label: 'Withdrawn — fee kept', sub: '1 @ £20.00', amountPence: 2_000 },
    ]);
    // The discount must still be detected (£40 components vs £35 charged)
    // now that the withdrawn entry's fee counts towards the component sum —
    // without that, the gap check would only see the £20 confirmed entry
    // against a £35 charge, find no positive gap, and MISS the £5 discount
    // entirely, overstating what the club is owed by £5.
    expect(findLines(itemisation.viaRemi, 'Multi-dog package discount')).toEqual([
      { label: 'Multi-dog package discount', amountPence: -500, isCredit: true },
    ]);
    // The statement must reconcile to the penny with what Remi actually
    // charged at Stripe — order.totalAmount — not the undiscounted £40.
    expect(itemisation.viaRemi.totalPence).toBe(order.totalAmount);
    expect(itemisation.viaRemi.totalPence).toBe(3_500);
  });
});
