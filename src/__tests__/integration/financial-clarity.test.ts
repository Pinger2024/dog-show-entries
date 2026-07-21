import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeUser,
  makeOrder,
} from '../helpers/factories';

// ──────────────────────────────────────────────────────────────
// "Financial numbers must add up" clarity redesign — the entries count
// used to read 74 on the dashboard (paid orders only), 75 on the
// financial/lifecycle banner (74 + 1 withdrawn), and 78 on the entries
// page (includes orderless not-for-competition entries). All three were
// "correct" for the population each one counted, but nothing on screen
// said which population, so the numbers looked broken.
//
// The fix: one canonical "dogs entered" figure (getShowStats /
// getShowEntryStats, both backed by computeShowMetrics) that both the
// dashboard, the lifecycle banner, the entries page, and the financial
// page read — so the screens can never disagree — plus the parts it's
// made of, exposed so the UI can show its workings.
// ──────────────────────────────────────────────────────────────

async function setupShow() {
  const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id });
  const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
  return { secretary, org, breed, show, showClass };
}

describe('financial clarity — orderless entries are visible in "dogs entered"', () => {
  it('counts an orderless NFC entry in dogsEntered, separate from paidThroughRemi', async () => {
    const { secretary, show, showClass, breed } = await setupShow();

    // One normal paid entry
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const paidDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2000 });
    const paidEntry = await makeEntry({
      showId: show.id, dogId: paidDog.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 2000,
    });
    await makeEntryClass({ entryId: paidEntry.id, showClassId: showClass.id });

    // One NFC dog, never touched a Remi order — this is the live bug:
    // orderless entries were invisible on the Financial page's tables
    // (getEntryReport is paid-orders-only) even though they show up on
    // the entries list.
    const nfcOwner = await makeUser({ role: 'exhibitor' });
    const nfcDog = await makeDog({ ownerId: nfcOwner.id, breedId: breed.id });
    await makeEntry({
      showId: show.id, dogId: nfcDog.id, exhibitorId: nfcOwner.id,
      status: 'confirmed', totalFee: 0, isNfc: true,
    });

    const caller = createTestCaller(secretary);
    const entryStats = await caller.secretary.getShowEntryStats({ showId: show.id });
    const stats = await caller.secretary.getShowStats({ showId: show.id });

    expect(entryStats.dogsEntered).toBe(2);
    expect(entryStats.confirmed).toBe(1); // paid-through-Remi only
    expect(entryStats.notForCompetitionEntries).toBe(1);
    expect(entryStats.otherOrderlessEntries).toBe(0);

    // Same shape, same numbers, on the Financial page's procedure.
    expect(stats.dogsEntered).toBe(2);
    expect(stats.notForCompetitionEntries).toBe(1);
    // NFC dog contributes no fee — it's "recorded on the entry, not paid
    // through Remi" — so total income is untouched by it.
    expect(stats.clubReceivablePence).toBe(2000);
  });

  it('counts an orderless non-NFC entry ("added without online payment") in dogsEntered too', async () => {
    const { secretary, show, breed } = await setupShow();
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    // A comp entry / historical row settled directly with the club —
    // status confirmed, no order at all.
    await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: owner.id,
      status: 'confirmed', totalFee: 1000,
    });

    const entryStats = await createTestCaller(secretary).secretary.getShowEntryStats({ showId: show.id });
    expect(entryStats.dogsEntered).toBe(1);
    expect(entryStats.otherOrderlessEntries).toBe(1);
    expect(entryStats.notForCompetitionEntries).toBe(0);
  });
});

describe('financial clarity — withdrawn stays out of dogsEntered but keeps its fee', () => {
  it('excludes the withdrawn dog from dogsEntered while its fee counts as income', async () => {
    const { secretary, show, showClass, breed } = await setupShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const paidDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const withdrawnDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 4000 });
    const paidEntry = await makeEntry({
      showId: show.id, dogId: paidDog.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 2000,
    });
    await makeEntryClass({ entryId: paidEntry.id, showClassId: showClass.id });
    const withdrawnEntry = await makeEntry({
      showId: show.id, dogId: withdrawnDog.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'withdrawn', totalFee: 2000,
    });
    await makeEntryClass({ entryId: withdrawnEntry.id, showClassId: showClass.id });

    const caller = createTestCaller(secretary);
    const entryStats = await caller.secretary.getShowEntryStats({ showId: show.id });
    const stats = await caller.secretary.getShowStats({ showId: show.id });

    expect(entryStats.dogsEntered).toBe(1); // withdrawn dog NOT in dogsEntered
    expect(entryStats.withdrawn).toBe(1);
    expect(entryStats.withdrawnKeptPence).toBe(2000);
    expect(entryStats.allEntries).toBe(2); // ...but it's still in "every entry ever made"

    // The withdrawn fee is still club income (existing money logic,
    // unchanged) — Entry Fees = paid + withdrawn.
    expect(stats.paidEntryFeesPence).toBe(4000);
    expect(stats.paidThroughRemiFeesPence).toBe(2000);
    expect(stats.withdrawnKeptPence).toBe(2000);
    expect(stats.clubReceivablePence).toBe(4000);
  });
});

describe('financial clarity — awaiting payment never inflates dogsEntered', () => {
  it('an entry on a pending_payment order counts as awaiting payment, not dogsEntered', async () => {
    const { secretary, show, showClass, breed } = await setupShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const order = await makeOrder({
      showId: show.id, exhibitorId: exhibitor.id, status: 'pending_payment', totalAmount: 2000,
    });
    const entry = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'pending', totalFee: 2000,
    });
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });

    const entryStats = await createTestCaller(secretary).secretary.getShowEntryStats({ showId: show.id });
    expect(entryStats.pending).toBe(1);
    expect(entryStats.dogsEntered).toBe(0);
  });
});

describe('financial clarity — the parts always sum', () => {
  it('paidThroughRemi + notForCompetition + otherOrderless = dogsEntered; income parts = totalIncome', async () => {
    const { secretary, show, showClass, breed } = await setupShow();

    const paidExhibitor = await makeUser({ role: 'exhibitor' });
    const paidDog1 = await makeDog({ ownerId: paidExhibitor.id, breedId: breed.id });
    const paidDog2 = await makeDog({ ownerId: paidExhibitor.id, breedId: breed.id });
    const withdrawnDog = await makeDog({ ownerId: paidExhibitor.id, breedId: breed.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: paidExhibitor.id, status: 'paid', totalAmount: 6000 });

    const paidEntry1 = await makeEntry({
      showId: show.id, dogId: paidDog1.id, exhibitorId: paidExhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 2000,
    });
    await makeEntryClass({ entryId: paidEntry1.id, showClassId: showClass.id });
    const paidEntry2 = await makeEntry({
      showId: show.id, dogId: paidDog2.id, exhibitorId: paidExhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 2000,
    });
    await makeEntryClass({ entryId: paidEntry2.id, showClassId: showClass.id });
    const withdrawnEntry = await makeEntry({
      showId: show.id, dogId: withdrawnDog.id, exhibitorId: paidExhibitor.id,
      orderId: order.id, status: 'withdrawn', totalFee: 2000,
    });
    await makeEntryClass({ entryId: withdrawnEntry.id, showClassId: showClass.id });

    const nfcOwner = await makeUser({ role: 'exhibitor' });
    const nfcDog = await makeDog({ ownerId: nfcOwner.id, breedId: breed.id });
    await makeEntry({
      showId: show.id, dogId: nfcDog.id, exhibitorId: nfcOwner.id,
      status: 'confirmed', totalFee: 0, isNfc: true,
    });

    const manualOwner = await makeUser({ role: 'exhibitor' });
    const manualDog = await makeDog({ ownerId: manualOwner.id, breedId: breed.id });
    await makeEntry({
      showId: show.id, dogId: manualDog.id, exhibitorId: manualOwner.id,
      status: 'confirmed', totalFee: 1200,
    });

    const stats = await createTestCaller(secretary).secretary.getShowStats({ showId: show.id });

    expect(stats.confirmedEntries + stats.notForCompetitionEntries + stats.otherOrderlessEntries)
      .toBe(stats.dogsEntered);
    expect(stats.paidThroughRemiFeesPence + stats.notForCompetitionFeesPence + stats.otherOrderlessFeesPence)
      .toBe(stats.dogsEnteredFeesPence);
    // Total income = entry fees (paid + withdrawn-kept) + sundries.
    expect(stats.paidEntryFeesPence + stats.paidSundryRevenuePence).toBe(stats.clubReceivablePence);
    expect(stats.dogsEntered + stats.withdrawnEntries + stats.cancelledEntries).toBe(stats.allEntries);
  });
});

describe('financial clarity — offline (manual/postal/cash) orders never inflate what Remi owes', () => {
  it('splits clubReceivablePence (Stripe) from offlineCollectedPence (club already holds it) on getShowStats and getPaymentReport', async () => {
    const { secretary, show, showClass, breed } = await setupShow();

    // A normal online entry, paid through Remi via Stripe.
    const onlineExhibitor = await makeUser({ role: 'exhibitor' });
    const onlineDog = await makeDog({ ownerId: onlineExhibitor.id, breedId: breed.id });
    const onlineOrder = await makeOrder({
      showId: show.id, exhibitorId: onlineExhibitor.id, status: 'paid', totalAmount: 2000,
    });
    const onlineEntry = await makeEntry({
      showId: show.id, dogId: onlineDog.id, exhibitorId: onlineExhibitor.id,
      orderId: onlineOrder.id, status: 'confirmed', totalFee: 2000,
    });
    await makeEntryClass({ entryId: onlineEntry.id, showClassId: showClass.id });

    // A postal entry a secretary recorded manually — an order exists
    // (unlike an orderless NFC/manual entry) but it never touched Stripe.
    const postalExhibitor = await makeUser({ role: 'exhibitor' });
    const postalDog = await makeDog({ ownerId: postalExhibitor.id, breedId: breed.id });
    const postalOrder = await makeOrder({
      showId: show.id, exhibitorId: postalExhibitor.id, status: 'paid', totalAmount: 1500,
      stripePaymentIntentId: null,
    });
    const postalEntry = await makeEntry({
      showId: show.id, dogId: postalDog.id, exhibitorId: postalExhibitor.id,
      orderId: postalOrder.id, status: 'confirmed', totalFee: 1500,
    });
    await makeEntryClass({ entryId: postalEntry.id, showClassId: showClass.id });

    const caller = createTestCaller(secretary);
    const [stats, paymentReport] = await Promise.all([
      caller.secretary.getShowStats({ showId: show.id }),
      caller.secretary.getPaymentReport({ showId: show.id }),
    ]);

    // Settlement split — only the Stripe order is due from Remi.
    expect(stats.clubReceivablePence).toBe(2000);
    expect(stats.offlineCollectedPence).toBe(1500);
    expect(stats.totalClubRevenuePence).toBe(3500);

    // Entry counts stay channel-agnostic — both entries are "paid through Remi"
    // in the dogsEntered sense (an entry is an entry regardless of how it was
    // paid); only the settlement figures above split.
    expect(stats.confirmedEntries).toBe(2);
    expect(stats.dogsEntered).toBe(2);
    expect(stats.paidThroughRemiFeesPence).toBe(3500);

    // The Payment Report lists every order regardless of channel, so its
    // headline total is the club's full take across both channels.
    expect(paymentReport.summary.totalRevenue).toBe(3500);
  });
});

describe('financial clarity — one procedure, one shape, everywhere', () => {
  it('getShowEntryStats and getShowStats agree on dogsEntered for the same show', async () => {
    const { secretary, show, showClass, breed } = await setupShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2000 });
    const entry = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 2000,
    });
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });

    const nfcOwner = await makeUser({ role: 'exhibitor' });
    const nfcDog = await makeDog({ ownerId: nfcOwner.id, breedId: breed.id });
    await makeEntry({
      showId: show.id, dogId: nfcDog.id, exhibitorId: nfcOwner.id,
      status: 'confirmed', totalFee: 0, isNfc: true,
    });

    const caller = createTestCaller(secretary);
    const [entryStats, stats] = await Promise.all([
      caller.secretary.getShowEntryStats({ showId: show.id }),
      caller.secretary.getShowStats({ showId: show.id }),
    ]);

    // Both procedures expose the identical canonical shape — the
    // dashboard/banner/entries-page (getShowEntryStats) and the
    // financial page (getShowStats) are reading the same underlying
    // computeShowMetrics() call, so they cannot drift apart.
    expect(entryStats.dogsEntered).toBe(stats.dogsEntered);
    expect(entryStats.dogsEnteredFeesPence).toBe(stats.dogsEnteredFeesPence);
    expect(entryStats.notForCompetitionEntries).toBe(stats.notForCompetitionEntries);
    expect(entryStats.otherOrderlessEntries).toBe(stats.otherOrderlessEntries);
    expect(entryStats.withdrawnKeptPence).toBe(stats.withdrawnKeptPence);
    expect(entryStats.allEntries).toBe(stats.allEntries);
    expect(entryStats.dogsEntered).toBe(2);
  });
});
