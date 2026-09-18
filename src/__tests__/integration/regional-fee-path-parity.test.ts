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
import { entries, orders } from '@/server/db/schema';
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
  const { user: secretary, org } = await makeSecretaryWithOrg();
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
  return { secretary, org, breed, show, classA: classA!, classB: classB! };
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

/**
 * Dogs entered EARLIER count towards the scale (Mandy 2026-09-16).
 *
 * The scale is per exhibitor per show, not per basket. Before this, an
 * exhibitor who entered 2 dogs and came back later for a 3rd had that 3rd dog
 * priced as their first — £20 instead of £16 — and a 4th charged £20 instead
 * of free. Manual entry was worse: it never ran the regional engine at all, so
 * every keyed-in dog paid the raw class fee (found on the NE Regional, four
 * dogs keyed one at a time at £20 each).
 */

/**
 * Settle an order the way Stripe's webhook does. Needed because `orders.checkout`
 * clears an exhibitor's abandoned UNPAID order for the show when they start a new
 * one — so an unpaid first basket is not "dogs already entered", it is a dropped
 * basket. Only a paid entry holds its place on the scale.
 */
async function settleOrder(orderId: string) {
  await testDb.update(orders).set({ status: 'paid' }).where(eq(orders.id, orderId));
  await testDb.update(entries).set({ status: 'confirmed' }).where(eq(entries.orderId, orderId));
}

describe('regional scale spans separate orders', () => {
  it('prices a 3rd dog entered in a LATER order as the 3rd dog', async () => {
    const { breed, show, classA } = await regionalShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map((i) => regionalDog(exhibitor.id, breed.id, i)));
    const caller = createTestCaller(exhibitor);

    const first = await caller.orders.checkout({
      showId: show.id,
      entries: [
        { entryType: 'standard', dogId: d1.id, classIds: [classA.id], isNfc: false },
        { entryType: 'standard', dogId: d2.id, classIds: [classA.id], isNfc: false },
      ],
    });
    expect(first.totalAmount).toBe(4000); // £20 + £20
    await settleOrder(first.orderId);

    // A week later — separate basket, same show.
    const second = await caller.orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: d3.id, classIds: [classA.id], isNfc: false }],
    });
    expect(second.totalAmount).toBe(1600); // 3rd dog, not a fresh 1st

    const third = await testDb.query.entries.findFirst({ where: eq(entries.orderId, second.orderId) });
    expect(third?.totalFee).toBe(1600);
  });

  it('charges nothing for a 4th dog entered later', async () => {
    const { breed, show, classA } = await regionalShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogList = await Promise.all([1, 2, 3, 4].map((i) => regionalDog(exhibitor.id, breed.id, i)));
    const caller = createTestCaller(exhibitor);

    const seed = await caller.orders.checkout({
      showId: show.id,
      entries: dogList.slice(0, 3).map((d) => ({
        entryType: 'standard' as const, dogId: d.id, classIds: [classA.id], isNfc: false,
      })),
    });
    await settleOrder(seed.orderId);
    const later = await caller.orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dogList[3]!.id, classIds: [classA.id], isNfc: false }],
    });
    expect(later.totalAmount).toBe(0);
  });

  it('does not count a cancelled dog against the exhibitor', async () => {
    const { breed, show, classA } = await regionalShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map((i) => regionalDog(exhibitor.id, breed.id, i)));
    const caller = createTestCaller(exhibitor);

    const first = await caller.orders.checkout({
      showId: show.id,
      entries: [
        { entryType: 'standard', dogId: d1.id, classIds: [classA.id], isNfc: false },
        { entryType: 'standard', dogId: d2.id, classIds: [classA.id], isNfc: false },
      ],
    });
    await settleOrder(first.orderId);
    // Cancel one of the two — the next dog is now their 2nd, not their 3rd.
    const seeded = await testDb.query.entries.findMany({ where: eq(entries.orderId, first.orderId) });
    await testDb.update(entries).set({ status: 'cancelled' }).where(eq(entries.id, seeded[0]!.id));

    const later = await caller.orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: d3.id, classIds: [classA.id], isNfc: false }],
    });
    expect(later.totalAmount).toBe(2000); // 2nd-dog price
  });

  it('prices a secretary-keyed manual entry on the regional scale, counting earlier dogs', async () => {
    const { secretary: secretaryUser, breed, show, classA } = await regionalShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map((i) => regionalDog(exhibitor.id, breed.id, i)));

    const seed = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [
        { entryType: 'standard', dogId: d1.id, classIds: [classA.id], isNfc: false },
        { entryType: 'standard', dogId: d2.id, classIds: [classA.id], isNfc: false },
      ],
    });
    await settleOrder(seed.orderId);

    const manual = await createTestCaller(secretaryUser).secretary.createManualEntry({
      showId: show.id,
      dogId: d3.id,
      classIds: [classA.id],
      exhibitorEmail: exhibitor.email,
    });
    expect(manual.totalFee).toBe(1600); // 3rd dog on the scale, not the £20 class fee
  });

  it('does not count a dog sitting in an abandoned UNPAID basket (preview and charge must agree)', async () => {
    const { breed, show, classA } = await regionalShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([1, 2, 3].map((i) => regionalDog(exhibitor.id, breed.id, i)));
    const caller = createTestCaller(exhibitor);

    // 2 dogs paid for.
    const first = await caller.orders.checkout({
      showId: show.id,
      entries: [
        { entryType: 'standard', dogId: d1.id, classIds: [classA.id], isNfc: false },
        { entryType: 'standard', dogId: d2.id, classIds: [classA.id], isNfc: false },
      ],
    });
    await settleOrder(first.orderId);

    // A 3rd dog is entered but the basket is abandoned — never settled. Its
    // order is left sitting at 'pending_payment', exactly as it would be if
    // the exhibitor closed the tab before paying.
    const abandoned = await caller.orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: d3.id, classIds: [classA.id], isNfc: false }],
    });
    expect(abandoned.totalAmount).toBe(1600); // priced as the 3rd dog at checkout time
    // Left unsettled — do NOT call settleOrder.

    // The fee preview must NOT count the abandoned 3rd dog as "already entered".
    const priorCount = await caller.entries.regionalPriorDogCount({ showId: show.id });
    expect(priorCount).toBe(2);

    // A fresh checkout of a genuine 3rd dog (checkout sweeps the abandoned
    // basket first) must charge the same £16 the preview implied — not double
    // count the swept dog and jump to the 4th-dog free tier.
    const d4 = await regionalDog(exhibitor.id, breed.id, 4);
    const real = await caller.orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: d4.id, classIds: [classA.id], isNfc: false }],
    });
    expect(real.totalAmount).toBe(1600); // preview (2) and charge agree — 3rd dog, £16
  });

  it('counts a secretary manual entry (its order is created paid) towards the scale immediately', async () => {
    const { secretary: secretaryUser, breed, show, classA } = await regionalShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2] = await Promise.all([1, 2].map((i) => regionalDog(exhibitor.id, breed.id, i)));

    await createTestCaller(secretaryUser).secretary.createManualEntry({
      showId: show.id,
      dogId: d1.id,
      classIds: [classA.id],
      exhibitorEmail: exhibitor.email,
    });

    const priorCount = await createTestCaller(exhibitor).entries.regionalPriorDogCount({ showId: show.id });
    expect(priorCount).toBe(1);

    const manual2 = await createTestCaller(secretaryUser).secretary.createManualEntry({
      showId: show.id,
      dogId: d2.id,
      classIds: [classA.id],
      exhibitorEmail: exhibitor.email,
    });
    expect(manual2.totalFee).toBe(2000); // 2nd dog, still on the paying tier — manual entries count
  });

  it('prices the FIRST manually-keyed regional dog on the scale, not the raw class fee', async () => {
    const { secretary: secretaryUser, breed, show, classA } = await regionalShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogList = await Promise.all([1, 2, 3, 4].map((i) => regionalDog(exhibitor.id, breed.id, i)));
    const secCaller = createTestCaller(secretaryUser);

    const fees: number[] = [];
    for (const d of dogList) {
      const m = await secCaller.secretary.createManualEntry({
        showId: show.id,
        dogId: d.id,
        classIds: [classA.id],
        exhibitorEmail: exhibitor.email,
      });
      fees.push(m.totalFee);
    }
    // The NE Regional case: four dogs keyed one at a time used to be £20 each.
    expect(fees).toEqual([2000, 2000, 1600, 0]);
  });
});
