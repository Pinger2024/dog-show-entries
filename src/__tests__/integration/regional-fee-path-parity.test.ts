/**
 * Regional (SV/WUSV) charging — checkout and edit must agree on the tier scale.
 *
 * Regional shows price on a per-DISTINCT-DOG scale (1st £20, 2nd £20, 3rd £16,
 * 4th+ free), member column, first-time-free — a different engine from the RKC
 * first/subsequent model. Checkout ran that engine, but `entries.update` used to
 * fall through to the legacy raw class-fee sum: editing a 3rd dog's class jumped
 * it from its £16 scale price to the £20 class fee and demanded a bogus £4
 * top-up. entries.update now recomputes the whole order on the regional engine
 * and lets the edited entry absorb the order-total delta, so a same-position
 * class swap costs nothing.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries } from '@/server/db/schema';
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
} from '../helpers/factories';

const TIERS = [
  { standardPence: 2000, memberPence: 1700 }, // 1st dog
  { standardPence: 2000, memberPence: 1700 }, // 2nd dog
  { standardPence: 1600, memberPence: 1100 }, // 3rd dog
  { standardPence: 0, memberPence: 0 }, // 4th+ free
];

async function regionalShow() {
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
  const defA = await makeClassDef({ name: 'Open Dog', type: 'achievement' });
  const defB = await makeClassDef({ name: 'Open Bitch', type: 'achievement' });
  const classA = await makeShowClass({ showId: show.id, classDefinitionId: defA.id, breedId: breed.id, entryFee: 2000 });
  const classB = await makeShowClass({ showId: show.id, classDefinitionId: defB.id, breedId: breed.id, entryFee: 2000 });
  return { org, breed, show, classA: classA!, classB: classB! };
}

const regionalDog = (ownerId: string, breedId: string, i: number) =>
  makeDog({ ownerId, breedId, kcRegNumber: `SZ200${i}`, microchipNumber: `98120000000${i}` });

describe('regional edit — the tier scale is honoured, no bogus top-up', () => {
  it('editing a 3rd-dog class swap keeps its £16 fee and charges nothing', async () => {
    const { breed, show, classA, classB } = await regionalShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogs = await Promise.all([1, 2, 3].map((i) => regionalDog(exhibitor.id, breed.id, i)));

    const checkout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: dogs.map((d) => ({ entryType: 'standard' as const, dogId: d.id, classIds: [classA.id], isNfc: false })),
    });
    expect(checkout.totalAmount).toBe(5600); // 20 + 20 + 16

    const rows = await testDb.query.entries.findMany({ where: eq(entries.orderId, checkout.orderId) });
    const thirdDog = rows.find((r) => r.totalFee === 1600)!;
    expect(thirdDog).toBeTruthy();

    // Swap the £16 dog onto another class of the same raw fee. Its scale position
    // is unchanged, so the fee must stay £16 and NO payment may be demanded.
    const edited = await createTestCaller(exhibitor).entries.update({ id: thirdDog.id, classIds: [classB.id] });
    expect(edited.requiresPayment).toBe(false);
    expect(edited.feeDiff).toBe(0);
    expect(edited.newFee).toBe(1600); // NOT the £20 raw class fee (the old bug)

    // Order total unchanged; no sibling disturbed.
    const after = await testDb.query.entries.findMany({ where: eq(entries.orderId, checkout.orderId) });
    expect(after.reduce((s, e) => s + (e.totalFee ?? 0), 0)).toBe(5600);
  });

  it('honours the member column on edit (member 3rd dog stays £11, not £16 or £20)', async () => {
    const { org, breed, show, classA, classB } = await regionalShow();
    void org;
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogs = await Promise.all([1, 2, 3].map((i) => regionalDog(exhibitor.id, breed.id, i)));

    const checkout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      regionalMembership: 'BRG/League member',
      entries: dogs.map((d) => ({ entryType: 'standard' as const, dogId: d.id, classIds: [classA.id], isNfc: false })),
    });
    expect(checkout.totalAmount).toBe(1700 + 1700 + 1100); // member scale = £45

    const rows = await testDb.query.entries.findMany({ where: eq(entries.orderId, checkout.orderId) });
    const memberThird = rows.find((r) => r.totalFee === 1100)!;
    expect(memberThird).toBeTruthy();

    const edited = await createTestCaller(exhibitor).entries.update({ id: memberThird.id, classIds: [classB.id] });
    expect(edited.requiresPayment).toBe(false);
    expect(edited.newFee).toBe(1100); // member 3rd rate held — not £16 standard, not £20 raw
  });

  it('a single-dog regional entry edit reprices to the 1st-dog scale price', async () => {
    const { breed, show, classA, classB } = await regionalShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await regionalDog(exhibitor.id, breed.id, 9);

    const checkout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [classA.id], isNfc: false }],
    });
    expect(checkout.totalAmount).toBe(2000);
    const entry = await testDb.query.entries.findFirst({ where: eq(entries.orderId, checkout.orderId) });

    const edited = await createTestCaller(exhibitor).entries.update({ id: entry!.id, classIds: [classB.id] });
    expect(edited.newFee).toBe(2000); // still the 1st-dog price, not double-charged
    expect(edited.feeDiff).toBe(0);
  });
});
