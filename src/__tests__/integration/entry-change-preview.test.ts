/**
 * `entries.previewUpdate` — the read-only preview of what changing an
 * existing entry's classes will cost, using the SAME pricing as
 * `entries.update` (the extracted `priceEntryClassChange`, ONE owner —
 * see CLAUDE.md "One owner per rule" and
 * src/server/services/entry-change-pricing.ts).
 *
 * The bug this guards: the edit page used to compute its own `newTotal` as a
 * raw SUM of each selected class's `entryFee` — wrong whenever first/
 * subsequent tiers, the regional scale, a discount group or the multi-dog
 * package apply (show_classes.entryFee is seeded to firstEntryFee, so 3
 * classes read as 3x first fee instead of first + 2x subsequent). The top-up
 * payment screen then showed that wrong client figure while Stripe charged
 * the correct server figure.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries, entryClasses, shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeSecretaryWithOrg,
  settleOrderLikeWebhook,
} from '../helpers/factories';

const FIRST = 2000; // £20
const SUBSEQUENT = 1000; // £10

async function setupRkcShow() {
  const { org } = await makeSecretaryWithOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
    firstEntryFee: FIRST,
    subsequentEntryFee: SUBSEQUENT,
  });
  return { org, breed, show };
}

const TIERS = [
  { standardPence: 2000, memberPence: 1700 }, // 1st dog
  { standardPence: 2000, memberPence: 1700 }, // 2nd dog
  { standardPence: 1600, memberPence: 1100 }, // 3rd dog
  { standardPence: 0, memberPence: 0 }, // 4th+ free
];

async function setupRegionalShow() {
  const { org } = await makeSecretaryWithOrg();
  const breed = await makeBreed({ name: 'German Shepherd Dog' });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'wusv',
    status: 'entries_open',
    juniorHandlerFee: 0,
    startDate: '2026-09-05',
    endDate: '2026-09-05',
    regionalFeeConfig: {
      tiers: TIERS,
      memberships: [{ label: 'BRG/League member' }],
      firstTimeEnabled: false,
      firstTimeFeePence: 0,
      donationsEnabled: false,
    },
  });
  return { org, breed, show };
}

const regionalDog = (ownerId: string, breedId: string, i: number) =>
  makeDog({ ownerId, breedId, kcRegNumber: `SZ300${i}`, microchipNumber: `98130000000${i}` });

describe('entries.previewUpdate — one owner with entries.update', () => {
  it('(a) RKC: 1 class → +2 classes previews first + 2x subsequent (2000), not the raw sum (4000)', async () => {
    const { breed, show } = await setupRkcShow();
    const [classA, classB, classC] = await Promise.all(
      [1, 2, 3].map(() => makeShowClass({ showId: show.id, breedId: breed.id, entryFee: FIRST })),
    );
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const checkout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [classA!.id], isNfc: false }],
    });
    await settleOrderLikeWebhook(checkout.orderId); // only a paid entry can change classes
    const entry = await testDb.query.entries.findFirst({ where: eq(entries.orderId, checkout.orderId) });

    const preview = await createTestCaller(exhibitor).entries.previewUpdate({
      id: entry!.id,
      classIds: [classA!.id, classB!.id, classC!.id],
    });

    expect(preview.feeDiff).toBe(2 * SUBSEQUENT); // 2000, NOT 4000
    expect(preview.newFee).toBe(FIRST + 2 * SUBSEQUENT);
    expect(preview.requiresPayment).toBe(true);
  });

  it('(b) previewUpdate numbers equal what update then returns — upgrade and downgrade', async () => {
    const { breed, show } = await setupRkcShow();
    const [classA, classB, classC] = await Promise.all(
      [1, 2, 3].map(() => makeShowClass({ showId: show.id, breedId: breed.id, entryFee: FIRST })),
    );
    const exhibitor = await makeUser({ role: 'exhibitor' });

    // Upgrade case: 1 class -> 3 classes.
    const upDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const upCheckout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: upDog.id, classIds: [classA!.id], isNfc: false }],
    });
    await settleOrderLikeWebhook(upCheckout.orderId); // only a paid entry can change classes
    const upEntry = await testDb.query.entries.findFirst({ where: eq(entries.orderId, upCheckout.orderId) });

    const upPreview = await createTestCaller(exhibitor).entries.previewUpdate({
      id: upEntry!.id,
      classIds: [classA!.id, classB!.id, classC!.id],
    });
    const upResult = await createTestCaller(exhibitor).entries.update({
      id: upEntry!.id,
      classIds: [classA!.id, classB!.id, classC!.id],
    });
    expect(upPreview.newFee).toBe(upResult.newFee);
    expect(upPreview.feeDiff).toBe(upResult.feeDiff);
    expect(upPreview.requiresPayment).toBe(upResult.requiresPayment);
    expect(upPreview.currentFee).toBe(upResult.oldFee);

    // Downgrade case: 3 classes -> 1 class.
    const downDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const downCheckout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: downDog.id, classIds: [classA!.id, classB!.id, classC!.id], isNfc: false }],
    });
    await settleOrderLikeWebhook(downCheckout.orderId); // only a paid entry can change classes
    const downEntry = await testDb.query.entries.findFirst({ where: eq(entries.orderId, downCheckout.orderId) });

    const downPreview = await createTestCaller(exhibitor).entries.previewUpdate({
      id: downEntry!.id,
      classIds: [classA!.id],
    });
    const downResult = await createTestCaller(exhibitor).entries.update({
      id: downEntry!.id,
      classIds: [classA!.id],
    });
    expect(downPreview.newFee).toBe(downResult.newFee);
    expect(downPreview.feeDiff).toBe(downResult.feeDiff);
    expect(downPreview.requiresPayment).toBe(downResult.requiresPayment);
    expect(downPreview.currentFee).toBe(downResult.oldFee);
  });

  it('(c) regional: 3rd-dog class swap previews feeDiff 0', async () => {
    const { breed, show } = await setupRegionalShow();
    const defA = await makeClassDef({ name: 'Open Dog', type: 'achievement' });
    const defB = await makeClassDef({ name: 'Open Bitch', type: 'achievement' });
    const classA = await makeShowClass({ showId: show.id, classDefinitionId: defA.id, breedId: breed.id, entryFee: 2000 });
    const classB = await makeShowClass({ showId: show.id, classDefinitionId: defB.id, breedId: breed.id, entryFee: 2000 });

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogs = await Promise.all([1, 2, 3].map((i) => regionalDog(exhibitor.id, breed.id, i)));

    const checkout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: dogs.map((d) => ({ entryType: 'standard' as const, dogId: d.id, classIds: [classA!.id], isNfc: false })),
    });
    await settleOrderLikeWebhook(checkout.orderId); // only a paid entry can change classes
    const rows = await testDb.query.entries.findMany({ where: eq(entries.orderId, checkout.orderId) });
    const thirdDog = rows.find((r) => r.totalFee === 1600)!;

    const preview = await createTestCaller(exhibitor).entries.previewUpdate({
      id: thirdDog.id,
      classIds: [classB!.id],
    });
    expect(preview.feeDiff).toBe(0);
    expect(preview.newFee).toBe(1600);
    expect(preview.requiresPayment).toBe(false);
  });

  it('(d) previewUpdate performs no writes — entry and entry_classes rows unchanged', async () => {
    const { breed, show } = await setupRkcShow();
    const [classA, classB] = await Promise.all(
      [1, 2].map(() => makeShowClass({ showId: show.id, breedId: breed.id, entryFee: FIRST })),
    );
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const checkout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [classA!.id], isNfc: false }],
    });
    await settleOrderLikeWebhook(checkout.orderId); // only a paid entry can change classes
    const entry = await testDb.query.entries.findFirst({ where: eq(entries.orderId, checkout.orderId) });
    const beforeEntry = await testDb.query.entries.findFirst({ where: eq(entries.id, entry!.id) });
    const beforeClasses = await testDb.query.entryClasses.findMany({ where: eq(entryClasses.entryId, entry!.id) });

    await createTestCaller(exhibitor).entries.previewUpdate({ id: entry!.id, classIds: [classA!.id, classB!.id] });

    const afterEntry = await testDb.query.entries.findFirst({ where: eq(entries.id, entry!.id) });
    const afterClasses = await testDb.query.entryClasses.findMany({ where: eq(entryClasses.entryId, entry!.id) });

    expect(afterEntry?.totalFee).toBe(beforeEntry?.totalFee);
    expect(afterEntry?.updatedAt?.getTime()).toBe(beforeEntry?.updatedAt?.getTime());
    expect(afterClasses.map((c) => c.showClassId).sort()).toEqual(
      beforeClasses.map((c) => c.showClassId).sort(),
    );
  });

  it('(e) another user cannot preview someone else\'s entry', async () => {
    const { breed, show } = await setupRkcShow();
    const classA = await makeShowClass({ showId: show.id, breedId: breed.id, entryFee: FIRST });
    const owner = await makeUser({ role: 'exhibitor' });
    const stranger = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });

    const checkout = await createTestCaller(owner).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [classA!.id], isNfc: false }],
    });
    await settleOrderLikeWebhook(checkout.orderId); // only a paid entry can change classes
    const entry = await testDb.query.entries.findFirst({ where: eq(entries.orderId, checkout.orderId) });

    await expect(
      createTestCaller(stranger).entries.previewUpdate({ id: entry!.id, classIds: [classA!.id] }),
    ).rejects.toThrow();
  });

  // Extras-to-entry design doc (2026-09-21), window owner (`entryWindowOpen`,
  // src/lib/show-status.ts): priceEntryClassChange used to check ONLY
  // `show.status !== 'entries_open'` and never entryCloseDate at all — so a
  // show whose deadline had passed but whose daily-cron status hadn't caught
  // up yet (stale `status='entries_open'`) still let a class-change top-up
  // through. entryWindowOpen closes that gap for both previewUpdate and update.
  it('(f) stale status="entries_open" with a PASSED entryCloseDate refuses the class change', async () => {
    const { org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: FIRST,
      subsequentEntryFee: SUBSEQUENT,
      entryCloseDate: new Date(Date.now() + 60_000),
    });
    const [classA, classB] = await Promise.all([
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: FIRST }),
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: FIRST }),
    ]);
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const checkout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [classA!.id], isNfc: false }],
    });
    await settleOrderLikeWebhook(checkout.orderId); // only a paid entry can change classes
    const entry = await testDb.query.entries.findFirst({ where: eq(entries.orderId, checkout.orderId) });

    // Deadline has now passed, but nothing has flipped the stored status —
    // exactly the daily-cron lag effectiveShowStatus exists to paper over.
    await testDb
      .update(shows)
      .set({ entryCloseDate: new Date(Date.now() - 60_000) })
      .where(eq(shows.id, show.id));

    await expect(
      createTestCaller(exhibitor).entries.previewUpdate({
        id: entry!.id,
        classIds: [classA!.id, classB!.id],
      }),
    ).rejects.toThrow(/no longer accepting/i);

    await expect(
      createTestCaller(exhibitor).entries.update({
        id: entry!.id,
        classIds: [classA!.id, classB!.id],
      }),
    ).rejects.toThrow(/no longer accepting/i);
  });
});
