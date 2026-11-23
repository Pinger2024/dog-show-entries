/**
 * The RKC multi-dog package is per exhibitor per SHOW, not per basket.
 *
 * North Eastern GSD Club Championship 2026 (28 Sept, Mandy from Nuremberg):
 * first class £18 (members £16), subsequent £18, package 3+ dogs £45 (members
 * £40). Ann Robinson put 3 dogs on the member package (£40), came back a week
 * later for a 4th and was charged £18. Claire Starkey had 2 member dogs (£32)
 * and her 3rd would have cost £16, not the £8 the package leaves. Regionals
 * were fixed for exactly this on 18 Sept (regional-fee-path-parity.test.ts);
 * the RKC package was never taught about earlier baskets.
 *
 * Every path that prices an RKC entry must agree: checkout, the enter-page
 * preview (entries.packagePriorStanding), a secretary's manual entry, and an
 * exhibitor's class edit.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries, orders } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeBreed, makeShow, makeShowClass, makeDog, makeSecretaryWithOrg } from '../helpers/factories';

async function northEasternShow() {
  const { user: secretary, org } = await makeSecretaryWithOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
    firstEntryFee: 1800,
    subsequentEntryFee: 1800,
    nfcEntryFee: 500,
    juniorHandlerFee: 300,
    multiDogThreshold: 3,
    multiDogPackagePence: 4500,
  });
  const [classA, classB] = await Promise.all([
    makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 1800 }),
    makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 1800 }),
  ]);
  const members = await createTestCaller(secretary).secretary.createDiscountGroup({
    showId: show.id,
    label: 'Members',
    firstEntryFeePence: 1600,
    multiDogPackagePence: 4000,
  });
  return { secretary, breed, show, classA: classA!, classB: classB!, members };
}

/** Settle an order the way Stripe's webhook does — only a paid basket's dogs
 *  are "already entered" (checkout sweeps an abandoned unpaid basket). */
async function settleOrder(orderId: string) {
  await testDb.update(orders).set({ status: 'paid' }).where(eq(orders.id, orderId));
  await testDb.update(entries).set({ status: 'confirmed' }).where(eq(entries.orderId, orderId));
}

const std = (dogId: string, classIds: string[]) => ({ entryType: 'standard' as const, dogId, classIds, isNfc: false });

describe('RKC multi-dog package spans separate baskets', () => {
  it("Claire: 2 member dogs (£32) paid, a 3rd member dog later costs £8, not £16", async () => {
    const { breed, show, classA, members } = await northEasternShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));
    const caller = createTestCaller(exhibitor);

    const first = await caller.orders.checkout({
      showId: show.id,
      entries: [std(d1.id, [classA.id]), std(d2.id, [classA.id])],
      discountGroupId: members.id,
    });
    expect(first.totalAmount).toBe(3200);
    await settleOrder(first.orderId);

    // What the enter page is told before it quotes a price.
    expect(await caller.entries.packagePriorStanding({ showId: show.id })).toEqual({
      payingDogCount: 2,
      firstClassPaidPence: 3200,
    });

    const later = await caller.orders.checkout({
      showId: show.id,
      entries: [std(d3.id, [classA.id])],
      discountGroupId: members.id,
    });
    expect(later.totalAmount).toBe(800);
    const third = await testDb.query.entries.findFirst({ where: eq(entries.orderId, later.orderId) });
    expect(third?.totalFee).toBe(800);
  });

  it('Ann: 3 dogs on the £40 member package, a 4th member dog later costs nothing', async () => {
    const { breed, show, classA, members } = await northEasternShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogs = await Promise.all([1, 2, 3, 4].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));
    const caller = createTestCaller(exhibitor);

    const first = await caller.orders.checkout({
      showId: show.id,
      entries: dogs.slice(0, 3).map((d) => std(d.id, [classA.id])),
      discountGroupId: members.id,
    });
    expect(first.totalAmount).toBe(4000);
    await settleOrder(first.orderId);

    const later = await caller.orders.checkout({
      showId: show.id,
      entries: [std(dogs[3]!.id, [classA.id])],
      discountGroupId: members.id,
    });
    expect(later.totalAmount).toBe(0);
  });

  it('a later basket without the member tick pays what is left of the standard £45 package', async () => {
    const { breed, show, classA, members } = await northEasternShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogs = await Promise.all([1, 2, 3, 4].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));
    const caller = createTestCaller(exhibitor);

    const first = await caller.orders.checkout({
      showId: show.id,
      entries: dogs.slice(0, 3).map((d) => std(d.id, [classA.id])),
      discountGroupId: members.id,
    });
    await settleOrder(first.orderId);

    const later = await caller.orders.checkout({ showId: show.id, entries: [std(dogs[3]!.id, [classA.id])] });
    expect(later.totalAmount).toBe(500); // £45 − £40 already paid — not £18
  });

  it("counts only an earlier dog's FIRST class — extra classes were never part of the package", async () => {
    const { breed, show, classA, classB } = await northEasternShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));
    const caller = createTestCaller(exhibitor);

    const first = await caller.orders.checkout({
      showId: show.id,
      entries: [std(d1.id, [classA.id, classB.id]), std(d2.id, [classA.id])],
    });
    expect(first.totalAmount).toBe(5400); // £18 + £18 extra class + £18
    await settleOrder(first.orderId);
    expect(await caller.entries.packagePriorStanding({ showId: show.id })).toEqual({
      payingDogCount: 2,
      firstClassPaidPence: 3600,
    });

    const later = await caller.orders.checkout({ showId: show.id, entries: [std(d3.id, [classA.id])] });
    expect(later.totalAmount).toBe(900); // £45 − £36 of first classes
  });

  it('does not count a dog in an abandoned UNPAID basket (the preview and the charge agree)', async () => {
    const { breed, show, classA } = await northEasternShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));
    const caller = createTestCaller(exhibitor);

    await caller.orders.checkout({ showId: show.id, entries: [std(d1.id, [classA.id]), std(d2.id, [classA.id])] });
    // Never paid.
    expect(await caller.entries.packagePriorStanding({ showId: show.id })).toEqual({
      payingDogCount: 0,
      firstClassPaidPence: 0,
    });
    const later = await caller.orders.checkout({ showId: show.id, entries: [std(d3.id, [classA.id])] });
    expect(later.totalAmount).toBe(1800);
  });

  it('does not count a cancelled dog', async () => {
    const { breed, show, classA } = await northEasternShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));
    const caller = createTestCaller(exhibitor);

    const first = await caller.orders.checkout({ showId: show.id, entries: [std(d1.id, [classA.id]), std(d2.id, [classA.id])] });
    await settleOrder(first.orderId);
    const seeded = await testDb.query.entries.findMany({ where: eq(entries.orderId, first.orderId) });
    await testDb.update(entries).set({ status: 'cancelled' }).where(eq(entries.id, seeded[0]!.id));

    const later = await caller.orders.checkout({ showId: show.id, entries: [std(d3.id, [classA.id])] });
    expect(later.totalAmount).toBe(1800); // only 2 dogs at the show — no package
  });

  it("a secretary's manual entry counts the exhibitor's earlier dogs", async () => {
    const { secretary, breed, show, classA, members } = await northEasternShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));

    const first = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [std(d1.id, [classA.id]), std(d2.id, [classA.id])],
      discountGroupId: members.id,
    });
    await settleOrder(first.orderId);

    const manual = await createTestCaller(secretary).secretary.createManualEntry({
      showId: show.id,
      dogId: d3.id,
      classIds: [classA.id],
      exhibitorEmail: exhibitor.email,
    });
    // Manual entries price at the standard rate: £45 − £32 already paid.
    expect(manual.totalFee).toBe(1300);
  });

  it('a manual entry counts toward the next online basket', async () => {
    const { secretary, breed, show, classA } = await northEasternShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));

    const manual = await createTestCaller(secretary).secretary.createManualEntry({
      showId: show.id,
      dogId: d1.id,
      classIds: [classA.id],
      exhibitorEmail: exhibitor.email,
    });
    expect(manual.totalFee).toBe(1800);

    const later = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [std(d2.id, [classA.id]), std(d3.id, [classA.id])],
    });
    expect(later.totalAmount).toBe(2700); // £45 − £18
  });

  it("editing the later dog's class keeps its £8 — no bogus top-up", async () => {
    const { breed, show, classA, classB, members } = await northEasternShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));
    const caller = createTestCaller(exhibitor);

    const first = await caller.orders.checkout({
      showId: show.id,
      entries: [std(d1.id, [classA.id]), std(d2.id, [classA.id])],
      discountGroupId: members.id,
    });
    await settleOrder(first.orderId);
    const later = await caller.orders.checkout({ showId: show.id, entries: [std(d3.id, [classA.id])], discountGroupId: members.id });
    await settleOrder(later.orderId);
    const third = await testDb.query.entries.findFirst({ where: eq(entries.orderId, later.orderId) });

    const edited = await caller.entries.update({ id: third!.id, classIds: [classB.id] });
    expect(edited.newFee).toBe(800);
    expect(edited.feeDiff).toBe(0);
    expect(edited.requiresPayment).toBe(false);
  });

  it("editing an EARLIER basket's dog is priced as it was then — a later basket never shifts its fees", async () => {
    const { breed, show, classA, classB, members } = await northEasternShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogs = await Promise.all([1, 2, 3, 4].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));
    const caller = createTestCaller(exhibitor);

    const first = await caller.orders.checkout({
      showId: show.id,
      entries: dogs.slice(0, 3).map((d) => std(d.id, [classA.id])),
      discountGroupId: members.id,
    });
    await settleOrder(first.orderId);
    const later = await caller.orders.checkout({ showId: show.id, entries: [std(dogs[3]!.id, [classA.id])], discountGroupId: members.id });
    await settleOrder(later.orderId);

    const firstEntries = await testDb.query.entries.findMany({ where: eq(entries.orderId, first.orderId) });
    const edited = await caller.entries.update({ id: firstEntries[0]!.id, classIds: [classB.id] });
    expect(edited.feeDiff).toBe(0);
    expect(edited.requiresPayment).toBe(false);

    const after = await testDb.query.entries.findMany({ where: eq(entries.orderId, first.orderId) });
    expect(after.reduce((s, e) => s + (e.totalFee ?? 0), 0)).toBe(4000);
  });

  it('JH and NFC entries in an earlier basket never count toward the package', async () => {
    const { breed, show, classA } = await northEasternShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2] = await Promise.all([1, 2].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));
    const caller = createTestCaller(exhibitor);

    const first = await caller.orders.checkout({
      showId: show.id,
      entries: [std(d1.id, [classA.id]), { entryType: 'standard', dogId: d2.id, classIds: [classA.id], isNfc: true }],
    });
    await settleOrder(first.orderId);
    expect(await caller.entries.packagePriorStanding({ showId: show.id })).toEqual({
      payingDogCount: 1,
      firstClassPaidPence: 1800,
    });
  });
});
