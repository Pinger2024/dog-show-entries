/**
 * Journey test for discount groups + multi-dog package, locked with
 * Amanda 2026-05-14. Strings the procedures together so the schema +
 * service + checkout integration stays honest:
 *   secretary.createDiscountGroup → orders.checkout(discountGroupId) →
 *   assert order.totalAmount + entries.totalFee sum match Amanda's
 *   live show fixture (£20 / £17 / £56 / £45).
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries, orders, showDiscountGroups } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeSecretaryWithOrg,
} from '../helpers/factories';

describe('fee discounts — journey', () => {
  it('member declares discount group at checkout, pays member rate', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: 2000, // £20
      subsequentEntryFee: 1000, // £10
    });
    const showClass = await makeShowClass({
      showId: show.id,
      breedId: breed.id,
      entryFee: 2000,
    });

    // Secretary adds a Members group at £17 first-class
    const secretaryCaller = createTestCaller(secretary);
    const group = await secretaryCaller.secretary.createDiscountGroup({
      showId: show.id,
      label: 'Members',
      firstEntryFeePence: 1700, // £17
    });

    // Exhibitor checks out one dog in one class, declaring Members
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      discountGroupId: group.id,
    });

    expect(result.totalAmount).toBe(1700);

    // Order persists the discount group id; entry total matches.
    const order = await testDb.query.orders.findFirst({
      where: eq(orders.id, result.orderId),
    });
    expect(order?.discountGroupId).toBe(group.id);

    const orderEntries = await testDb.query.entries.findMany({
      where: eq(entries.orderId, result.orderId),
    });
    expect(orderEntries).toHaveLength(1);
    expect(orderEntries[0]!.totalFee).toBe(1700);
  });

  it('Amanda fixture — 3 member dogs hits member multi-dog package', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: 2000, // £20
      subsequentEntryFee: 1000, // £10
      multiDogThreshold: 3,
      multiDogPackagePence: 5600, // £56 — standard 3+ package
    });
    const [c1, c2, c3] = await Promise.all([
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 }),
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 }),
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 }),
    ]);

    const secretaryCaller = createTestCaller(secretary);
    const group = await secretaryCaller.secretary.createDiscountGroup({
      showId: show.id,
      label: 'Members',
      firstEntryFeePence: 1700, // £17
      multiDogPackagePence: 4500, // £45 — member 3+ package
    });

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const [d1, d2, d3] = await Promise.all([
      makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
      makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
      makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
    ]);

    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [
        { entryType: 'standard', dogId: d1.id, classIds: [c1.id], isNfc: false },
        { entryType: 'standard', dogId: d2.id, classIds: [c2.id], isNfc: false },
        { entryType: 'standard', dogId: d3.id, classIds: [c3.id], isNfc: false },
      ],
      discountGroupId: group.id,
    });

    // Member 3+ package — exactly Amanda's fixture
    expect(result.totalAmount).toBe(4500);

    const orderEntries = await testDb.query.entries.findMany({
      where: eq(entries.orderId, result.orderId),
    });
    // The package splits across the 3 paying dogs and sums to £45 exactly.
    const sum = orderEntries.reduce((acc, e) => acc + e.totalFee, 0);
    expect(sum).toBe(4500);
  });

  it('multi-dog package — 10 paying dogs still pays flat £56 standard package', async () => {
    const { org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: 2000,
      subsequentEntryFee: 1000,
      multiDogThreshold: 3,
      multiDogPackagePence: 5600,
    });
    const classes = await Promise.all(
      Array.from({ length: 10 }, () =>
        makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 })
      )
    );

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogs = await Promise.all(
      Array.from({ length: 10 }, () =>
        makeDog({ ownerId: exhibitor.id, breedId: breed.id })
      )
    );

    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: dogs.map((dog, i) => ({
        entryType: 'standard' as const,
        dogId: dog.id,
        classIds: [classes[i]!.id],
        isNfc: false,
      })),
    });

    expect(result.totalAmount).toBe(5600);
  });

  it('checkout rejects a discount group from a different show', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show1 = await makeShow({
      organisationId: org.id, breedId: breed.id, status: 'entries_open',
      firstEntryFee: 2000,
    });
    const show2 = await makeShow({
      organisationId: org.id, breedId: breed.id, status: 'entries_open',
      firstEntryFee: 2000,
    });
    const showClass2 = await makeShowClass({ showId: show2.id, breedId: breed.id });

    // Group belongs to show1
    const group1 = await createTestCaller(secretary).secretary.createDiscountGroup({
      showId: show1.id,
      label: 'Members',
      firstEntryFeePence: 1700,
    });

    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    // Try checking out on show2 with show1's group
    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show2.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass2.id], isNfc: false }],
        discountGroupId: group1.id,
      })
    ).rejects.toThrow(/not valid for this show/i);
  });
});
