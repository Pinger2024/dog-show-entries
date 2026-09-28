/**
 * The secretary's "Add entry" dialog must show the fee Remi will actually
 * record — the same pricing as secretary.createManualEntry.
 *
 * Found 28 Sept 2026 (fixing the North Eastern package): the dialog showed
 * "Entry fees" as the plain sum of each class's own fee. The manual entry is
 * priced through the fee engine — subsequent-class rate, the regional per-dog
 * scale, the multi-dog package and the exhibitor's dogs already entered — so a
 * secretary keying Ann Robinson's 4th dog was shown one figure while Remi
 * recorded another. Both now come from priceManualEntry.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { entries, orders } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeBreed, makeShow, makeShowClass, makeClassDef, makeDog, makeSecretaryWithOrg } from '../helpers/factories';

async function settleOrder(orderId: string) {
  await testDb.update(orders).set({ status: 'paid' }).where(eq(orders.id, orderId));
  await testDb.update(entries).set({ status: 'confirmed' }).where(eq(entries.orderId, orderId));
}

async function rkcShow(opts: { subsequentEntryFee: number; package?: boolean }) {
  const { user: secretary, org } = await makeSecretaryWithOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
    firstEntryFee: 1800,
    subsequentEntryFee: opts.subsequentEntryFee,
    ...(opts.package ? { multiDogThreshold: 3, multiDogPackagePence: 4500 } : {}),
  });
  const [classA, classB] = await Promise.all([
    makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 1800 }),
    makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 1800 }),
  ]);
  return { secretary, breed, show, classA: classA!, classB: classB! };
}

describe('manual entry — the dialog shows the fee Remi records', () => {
  it('a later dog on a package: previews and records what is left of it (£45 − £32)', async () => {
    const { secretary, breed, show, classA } = await rkcShow({ subsequentEntryFee: 1800, package: true });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));
    const group = await createTestCaller(secretary).secretary.createDiscountGroup({
      showId: show.id, label: 'Members', firstEntryFeePence: 1600, multiDogPackagePence: 4000,
    });
    const first = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [
        { entryType: 'standard', dogId: d1.id, classIds: [classA.id], isNfc: false },
        { entryType: 'standard', dogId: d2.id, classIds: [classA.id], isNfc: false },
      ],
      discountGroupId: group.id,
    });
    await settleOrder(first.orderId);

    const secretaryCaller = createTestCaller(secretary);
    const preview = await secretaryCaller.secretary.previewManualEntryFee({
      showId: show.id, classIds: [classA.id], exhibitorEmail: exhibitor.email, isNfc: false,
    });
    expect(preview.entryFee).toBe(1300);

    const manual = await secretaryCaller.secretary.createManualEntry({
      showId: show.id, dogId: d3.id, classIds: [classA.id], exhibitorEmail: exhibitor.email,
    });
    expect(manual.totalFee).toBe(preview.entryFee);
  });

  it('extra classes at the subsequent rate: previews £18 + £10, not £18 + £18', async () => {
    const { secretary, breed, show, classA, classB } = await rkcShow({ subsequentEntryFee: 1000 });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const caller = createTestCaller(secretary);

    const preview = await caller.secretary.previewManualEntryFee({
      showId: show.id, classIds: [classA.id, classB.id], exhibitorEmail: exhibitor.email, isNfc: false,
    });
    expect(preview.entryFee).toBe(2800);

    const manual = await caller.secretary.createManualEntry({
      showId: show.id, dogId: dog.id, classIds: [classA.id, classB.id], exhibitorEmail: exhibitor.email,
    });
    expect(manual.totalFee).toBe(2800);
  });

  it('a regional 3rd dog previews and records £16 on the scale, not the £20 class fee', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed({ name: 'German Shepherd Dog' });
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, showScope: 'single_breed', showRuleset: 'wusv',
      status: 'entries_open', juniorHandlerFee: 0,
      regionalFeeConfig: {
        tiers: [
          { standardPence: 2000, memberPence: 1700 },
          { standardPence: 2000, memberPence: 1700 },
          { standardPence: 1600, memberPence: 1100 },
          { standardPence: 0, memberPence: 0 },
        ],
        memberships: [{ label: 'BRG/League member' }],
        firstTimeEnabled: false, firstTimeFeePence: 0, donationsEnabled: false,
      },
    });
    const def = await makeClassDef({ name: 'Open Dog', type: 'achievement' });
    const cls = await makeShowClass({ showId: show.id, classDefinitionId: def.id, breedId: breed.id, entryFee: 2000 });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogs = await Promise.all([1, 2, 3].map((i) =>
      makeDog({ ownerId: exhibitor.id, breedId: breed.id, kcRegNumber: `SZ300${i}`, microchipNumber: `98130000000${i}` }),
    ));
    const first = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: dogs.slice(0, 2).map((d) => ({ entryType: 'standard' as const, dogId: d.id, classIds: [cls!.id], isNfc: false })),
    });
    await settleOrder(first.orderId);

    const caller = createTestCaller(secretary);
    const preview = await caller.secretary.previewManualEntryFee({
      showId: show.id, classIds: [cls!.id], exhibitorEmail: exhibitor.email, isNfc: false,
    });
    expect(preview.entryFee).toBe(1600);

    const manual = await caller.secretary.createManualEntry({
      showId: show.id, dogId: dogs[2]!.id, classIds: [cls!.id], exhibitorEmail: exhibitor.email,
    });
    expect(manual.totalFee).toBe(1600);
  });

  it('before an exhibitor email is typed, previews the price for someone with nothing entered yet', async () => {
    const { secretary, show, classA } = await rkcShow({ subsequentEntryFee: 1800, package: true });
    const preview = await createTestCaller(secretary).secretary.previewManualEntryFee({
      showId: show.id, classIds: [classA.id], isNfc: false,
    });
    expect(preview.entryFee).toBe(1800);
  });

  it("refuses a secretary from another club", async () => {
    const { show, classA } = await rkcShow({ subsequentEntryFee: 1800 });
    const { user: other } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(other).secretary.previewManualEntryFee({ showId: show.id, classIds: [classA.id], isNfc: false }),
    ).rejects.toThrow(/do not have access/);
  });
});

describe('manual entry pricing — one owner', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

  it('the entry and the dialog preview both price through priceManualEntry', () => {
    const router = read('server/trpc/routers/secretary.ts');
    const calls = router.match(/await priceManualEntry\(/g) ?? [];
    expect(calls.length).toBe(2); // createManualEntry + previewManualEntryFee
  });

  it('the Add entry dialog never adds up class fees itself', () => {
    const page = read('app/(secretary)/secretary/shows/[id]/entries/page.tsx');
    expect(page).not.toMatch(/reduce\(\(sum, sc\) => sum \+ sc\.entryFee/);
    expect(page).toContain('previewManualEntryFee');
  });
});
