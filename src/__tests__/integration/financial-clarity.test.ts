import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestCaller } from '../helpers/context';
import { testDb } from '../helpers/db';
import { entries } from '@/server/db/schema';
import { classEntriesLabel, formatBannerBreakdown } from '@/app/(secretary)/secretary/shows/[id]/_lib/show-utils';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
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

// ──────────────────────────────────────────────────────────────
// Mandy, 2026-07-27, South Western GSD: "85 dogs entered ... but 4 done
// manually so payment direct to bank ... this report is showing only 76".
// Her hand-added, paid-direct-to-the-club entries were folded into a row
// labelled "Paid through Remi" with nothing marking them out, so the row
// reconciled against neither the bank statement nor the Remi payout.
// ──────────────────────────────────────────────────────────────
describe('financial clarity — entries paid direct to the club are marked out', () => {
  it('counts them in dogs entered but reports them separately from Remi-collected money', async () => {
    const { secretary, show, showClass, breed } = await setupShow();

    const addEntry = async (opts: { offline: boolean; fee: number }) => {
      const exhibitor = await makeUser({ role: 'exhibitor' });
      const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
      const order = await makeOrder({
        showId: show.id,
        exhibitorId: exhibitor.id,
        status: 'paid',
        totalAmount: opts.fee,
        // Offline = a secretary's manual entry: paid, but with no Stripe
        // PaymentIntent, because the money went straight to the club.
        ...(opts.offline ? { stripePaymentIntentId: null } : {}),
      });
      const entry = await makeEntry({
        showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id,
        orderId: order.id, status: 'confirmed', totalFee: opts.fee,
      });
      await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    };

    for (let i = 0; i < 6; i++) await addEntry({ offline: false, fee: 2000 });
    for (let i = 0; i < 4; i++) await addEntry({ offline: true, fee: 2000 });

    const caller = createTestCaller(secretary);
    const [entryStats, stats] = await Promise.all([
      caller.secretary.getShowEntryStats({ showId: show.id }),
      caller.secretary.getShowStats({ showId: show.id }),
    ]);

    // The headline is unchanged — all ten dogs are entered, all ten print.
    expect(stats.dogsEntered).toBe(10);
    expect(stats.dogsEnteredFeesPence).toBe(20000);

    // ...but the four hand-added ones are now identifiable.
    expect(stats.paidDirectToClubEntries).toBe(4);
    expect(stats.paidDirectToClubFeesPence).toBe(8000);
    expect(entryStats.paidDirectToClubEntries).toBe(stats.paidDirectToClubEntries);

    // And the settlement split is untouched: Remi owes the club only the
    // £120 it actually collected — the £80 is already in the club's bank.
    expect(stats.clubReceivablePence).toBe(12000);
    expect(stats.offlineCollectedPence).toBe(8000);
  });
});

// ──────────────────────────────────────────────────────────────
// Mandy, 2026-07-27, "93 dogs entered" (dashboard) vs "109 entries" (Class
// Breakdown PDF): both numbers were correct, but a dog entered in two
// classes is one dog and two class entries, and neither screen said which
// unit it meant. classEntryCount / classEntries exposes the judges'-book
// unit alongside dogsEntered so the two can never look contradictory again.
// ──────────────────────────────────────────────────────────────
describe('financial clarity — class entries (judges-book count) vs dogs entered', () => {
  it('counts each class entry separately: a dog in two classes counts twice', async () => {
    const { secretary, show, breed } = await setupShow();
    const classA = await makeShowClass({ showId: show.id, breedId: breed.id });
    const classB = await makeShowClass({ showId: show.id, breedId: breed.id });

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog1 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const dog2 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const dog3 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 6000 });

    // Entry 1 — two classes.
    const entry1 = await makeEntry({
      showId: show.id, dogId: dog1.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 4000,
    });
    await makeEntryClass({ entryId: entry1.id, showClassId: classA.id });
    await makeEntryClass({ entryId: entry1.id, showClassId: classB.id });

    // Entry 2 — one class.
    const entry2 = await makeEntry({
      showId: show.id, dogId: dog2.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 1000,
    });
    await makeEntryClass({ entryId: entry2.id, showClassId: classA.id });

    // Entry 3 — one class.
    const entry3 = await makeEntry({
      showId: show.id, dogId: dog3.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 1000,
    });
    await makeEntryClass({ entryId: entry3.id, showClassId: classB.id });

    const caller = createTestCaller(secretary);
    const [entryStats, stats] = await Promise.all([
      caller.secretary.getShowEntryStats({ showId: show.id }),
      caller.secretary.getShowStats({ showId: show.id }),
    ]);

    // 3 dogs, 4 class entries — the exact shape of Mandy's report.
    expect(entryStats.dogsEntered).toBe(3);
    expect(entryStats.classEntries).toBe(4);
    expect(stats.dogsEntered).toBe(3);
    expect(stats.classEntries).toBe(4);
  });

  it('excludes class rows belonging to soft-deleted or non-confirmed entries', async () => {
    const { secretary, show, breed } = await setupShow();
    const classA = await makeShowClass({ showId: show.id, breedId: breed.id });

    const exhibitor = await makeUser({ role: 'exhibitor' });

    // The one entry that should actually count.
    const paidDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2000 });
    const paidEntry = await makeEntry({
      showId: show.id, dogId: paidDog.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 2000,
    });
    await makeEntryClass({ entryId: paidEntry.id, showClassId: classA.id });

    // Soft-deleted entry — its entry_classes row is still in the table,
    // but the entry itself is gone, so it must not be counted.
    const deletedDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const deletedEntry = await makeEntry({
      showId: show.id, dogId: deletedDog.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 2000,
    });
    await makeEntryClass({ entryId: deletedEntry.id, showClassId: classA.id });
    await testDb.update(entries).set({ deletedAt: new Date() }).where(eq(entries.id, deletedEntry.id));

    // Pending (awaiting payment) entry — hasn't reached the catalogue yet.
    const pendingOrder = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'pending_payment', totalAmount: 2000 });
    const pendingDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const pendingEntry = await makeEntry({
      showId: show.id, dogId: pendingDog.id, exhibitorId: exhibitor.id,
      orderId: pendingOrder.id, status: 'pending', totalFee: 2000,
    });
    await makeEntryClass({ entryId: pendingEntry.id, showClassId: classA.id });

    const entryStats = await createTestCaller(secretary).secretary.getShowEntryStats({ showId: show.id });

    expect(entryStats.dogsEntered).toBe(1);
    expect(entryStats.classEntries).toBe(1);
  });
});

describe('classEntriesLabel', () => {
  it('returns null when class entries equal dogs entered — nothing to explain', () => {
    expect(classEntriesLabel(93, 93)).toBeNull();
  });

  it('returns null when classEntries is undefined', () => {
    expect(classEntriesLabel(93, undefined)).toBeNull();
  });

  it('returns the label when classEntries exceeds dogsEntered', () => {
    expect(classEntriesLabel(93, 109)).toBe('109 class entries');
  });
});

// The "Entries closed — 93 dogs entered" banner reads its sub-line from
// formatBannerBreakdown. Mandy's number has to actually appear there, not
// just in the helper the banner calls.
// Mandy 2026-07-27, on the Entries tile reading 91: "i'm scratching me head
// with this 91 … 81 entries for hugh which is 80 unique dogs. 24 for Kat of
// which only 2 are unique as the rest are entered under Hugh and 4 Junior
// Handlers". She was right — 91 counted entry ROWS, so a dog who came back to
// buy a Special Award was counted twice, against a catalogue of 90.
describe('the figures a secretary quotes — class entries, dogs, catalogue numbers', () => {
  it('counts a dog once however many separate entries it holds', async () => {
    const { secretary, show, showClass, breed } = await setupShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2300 });

    // ONE dog, TWO entry rows — a main class then a Special Award bought
    // later, which is exactly LORNSTONE SIJUR's shape on South Western.
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    for (const fee of [2000, 300]) {
      const e = await makeEntry({
        showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id,
        orderId: order.id, status: 'confirmed', totalFee: fee,
      });
      await makeEntryClass({ entryId: e.id, showClassId: showClass.id });
    }

    const stats = await createTestCaller(secretary).secretary.getShowStats({ showId: show.id });

    expect(stats.dogCount).toBe(1);            // one dog
    expect(stats.classEntries).toBe(2);        // two class entries
    expect(stats.catalogueNumberCount).toBe(1); // one catalogue number
    // ...and the money is untouched by the de-duplication.
    expect(stats.dogsEnteredFeesPence).toBe(2300);
  });

  it('never counts a Junior Handler as a dog — the RKC return is competing dogs', async () => {
    const { secretary, show, showClass, breed } = await setupShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2300 });

    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const competing = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 2000,
    });
    await makeEntryClass({ entryId: competing.id, showClassId: showClass.id });

    // A Not For Competition dog — in the catalogue, in no judged class.
    const nfcDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    await makeEntry({
      showId: show.id, dogId: nfcDog.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 0, isNfc: true,
    });

    // A Junior Handler — a child and a handling class, NO dog at all.
    await makeEntry({
      showId: show.id, dogId: null, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 300,
      entryType: 'junior_handler',
    });

    const stats = await createTestCaller(secretary).secretary.getShowStats({ showId: show.id });

    expect(stats.dogCount).toBe(2);             // the competing dog + the NFC dog
    expect(stats.nfcDogCount).toBe(1);
    expect(stats.competingDogCount).toBe(1);    // ← Mandy's RKC figure
    expect(stats.catalogueNumberCount).toBe(3); // 2 dogs + 1 junior handler
  });
});

describe('formatBannerBreakdown — carries the class-entries count', () => {
  const base = {
    confirmed: 93,
    notForCompetitionEntries: 0,
    otherOrderlessEntries: 0,
    withdrawn: 0,
  };

  it('appends the class-entries count when it differs from dogs entered', () => {
    expect(formatBannerBreakdown({ ...base, dogsEntered: 93, classEntries: 109 })).toBe(
      'all paid · 109 class entries',
    );
  });

  it('leaves the line alone when every dog is in a single class', () => {
    expect(formatBannerBreakdown({ ...base, dogsEntered: 93, classEntries: 93 })).toBe('all paid');
  });

  it('still works for callers that pass no class-entry data at all', () => {
    expect(formatBannerBreakdown(base)).toBe('all paid');
  });

  it('keeps the withdrawn suffix ahead of the class count', () => {
    const line = formatBannerBreakdown({
      ...base,
      withdrawn: 1,
      dogsEntered: 93,
      classEntries: 109,
    });
    expect(line).toBe('93 paid · 1 withdrawn (fee kept) · 109 class entries');
  });
});

// ──────────────────────────────────────────────────────────────
// 2026-07-27 fault log, guarded here: four screens each computed "how many
// entries" a different way for the SAME show — the show tile said 110
// (class entries), the dashboard said 91 (entry rows + pending), the
// Reports tab said 91 (rows in its own list), the catalogue printed 90
// numbers. Every one of those was "fixed" as a one-line label change with
// no test, and the underlying bug (one quantity, several call sites) came
// back three more times the same day. getShowStats, getShowEntryStats and
// secretary.getDashboard must now all read the SAME classEntries figure —
// this test builds one deliberately awkward show and proves they agree.
// ──────────────────────────────────────────────────────────────
describe('every screen\'s entries figure comes from one calculation', () => {
  it('getShowStats, getShowEntryStats and getDashboard agree on class entries, dogs, and catalogue numbers', async () => {
    const { secretary, org, show, breed } = await setupShow();
    const classA = await makeShowClass({ showId: show.id, breedId: breed.id });
    const classB = await makeShowClass({ showId: show.id, breedId: breed.id });
    const jhClassDef = await makeClassDef({ type: 'junior_handler' });
    const jhClass = await makeShowClass({ showId: show.id, classDefinitionId: jhClassDef.id });

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 8000 });

    // Dog 1 — one entry row, entered in TWO classes. Class entries > dogs.
    const dog1 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const dog1Entry = await makeEntry({
      showId: show.id, dogId: dog1.id, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 4000,
    });
    await makeEntryClass({ entryId: dog1Entry.id, showClassId: classA.id });
    await makeEntryClass({ entryId: dog1Entry.id, showClassId: classB.id });

    // Dog 2 — ONE dog, TWO entry rows (main class, then a later Special
    // Award purchase) — LORNSTONE SIJUR's exact shape on South Western.
    const dog2 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    for (const fee of [2000, 300]) {
      const e = await makeEntry({
        showId: show.id, dogId: dog2.id, exhibitorId: exhibitor.id,
        orderId: order.id, status: 'confirmed', totalFee: fee,
      });
      await makeEntryClass({ entryId: e.id, showClassId: classA.id });
    }

    // A Not For Competition dog — in the catalogue, no judged class, no order.
    const nfcOwner = await makeUser({ role: 'exhibitor' });
    const nfcDog = await makeDog({ ownerId: nfcOwner.id, breedId: breed.id });
    await makeEntry({
      showId: show.id, dogId: nfcDog.id, exhibitorId: nfcOwner.id,
      status: 'confirmed', totalFee: 0, isNfc: true,
    });

    // A Junior Handler entry — no dog at all, but its own class entry and
    // catalogue number.
    const jhEntry = await makeEntry({
      showId: show.id, dogId: null, exhibitorId: exhibitor.id,
      orderId: order.id, status: 'confirmed', totalFee: 300,
      entryType: 'junior_handler',
    });
    await makeEntryClass({ entryId: jhEntry.id, showClassId: jhClass.id });

    const caller = createTestCaller(secretary);
    const [entryStats, stats, dashboard] = await Promise.all([
      caller.secretary.getShowEntryStats({ showId: show.id }),
      caller.secretary.getShowStats({ showId: show.id }),
      caller.secretary.getDashboard(),
    ]);

    // classEntries: dog1 (2) + dog2 (2) + JH (1) = 5. The NFC dog contributes
    // no class entry (it's in no judged class).
    expect(stats.classEntries).toBe(5);
    expect(entryStats.classEntries).toBe(stats.classEntries);

    const dashboardRow = [...dashboard.activeShows, ...dashboard.pastShows].find((s) => s.id === show.id);
    expect(dashboardRow).toBeDefined();
    expect(dashboardRow?.entryCount).toBe(stats.classEntries);

    // dogCount counts distinct dogs — dog2's second entry row must not
    // double it. 3 dogs: dog1, dog2, the NFC dog.
    expect(stats.dogCount).toBe(3);
    expect(entryStats.dogCount).toBe(stats.dogCount);

    // catalogueNumberCount = dogCount + junior handlers = 3 + 1.
    expect(stats.catalogueNumberCount).toBe(stats.dogCount + 1);
    expect(stats.catalogueNumberCount).toBe(4);

    // competingDogCount = dogCount − nfcDogCount = 3 − 1.
    expect(stats.nfcDogCount).toBe(1);
    expect(stats.competingDogCount).toBe(stats.dogCount - stats.nfcDogCount);
    expect(stats.competingDogCount).toBe(2);

    // Sanity: the org this show belongs to is the one the secretary caller owns.
    expect(dashboard.organisations.map((o) => o.id)).toContain(org.id);
  });
});
