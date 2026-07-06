/**
 * Journey test for the regional (SV/WUSV) tiered entry-fee model, locked with
 * Mandy 2026-07-05 (project_regional_fee_structure). Exercises the checkout
 * wiring end to end: a wusv show with a regionalFeeConfig →
 * orders.checkout(regionalMembership / regionalFirstTimeExhibitor / donation) →
 * assert the order total, per-entry fees, and persisted declarations match the
 * BRG scale (1st £20, 2nd £20, 3rd £16, 4th+ free; member £17/£17/£11/free).
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
  makeDog,
  makeSecretaryWithOrg,
} from '../helpers/factories';
import type { RegionalFeeConfig } from '@/server/db/schema/shows';

const BRG_CONFIG: RegionalFeeConfig = {
  tiers: [
    { standardPence: 2000, memberPence: 1700 }, // 1st dog
    { standardPence: 2000, memberPence: 1700 }, // 2nd dog
    { standardPence: 1600, memberPence: 1100 }, // 3rd dog
    { standardPence: 0, memberPence: 0 }, // 4th+ free
  ],
  memberships: [
    { label: 'BRG/League member', requiresNumber: true },
    // A club's own membership with its own price list (Mandy's option B).
    {
      label: 'Clyde Valley member',
      requiresNumber: false,
      tiers: [
        { standardPence: 1500, memberPence: 1500 },
        { standardPence: 1500, memberPence: 1500 },
        { standardPence: 1000, memberPence: 1000 },
        { standardPence: 0, memberPence: 0 },
      ],
    },
  ],
  firstTimeEnabled: true,
  firstTimeFeePence: 0,
  donationsEnabled: true,
};

/** A regional show + N single-class show classes + a fully SV-compliant
 *  exhibitor with N dogs, ready to check out. */
async function regionalFixture(dogCount: number, config: RegionalFeeConfig = BRG_CONFIG) {
  const { org } = await makeSecretaryWithOrg();
  const breed = await makeBreed({ name: 'German Shepherd Dog' });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'wusv',
    status: 'entries_open',
    juniorHandlerFee: 0,
    regionalFeeConfig: config,
  });
  const classes = await Promise.all(
    Array.from({ length: dogCount }, () =>
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 0 }),
    ),
  );
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dogs = await Promise.all(
    Array.from({ length: dogCount }, (_, i) =>
      makeDog({
        ownerId: exhibitor.id,
        breedId: breed.id,
        kcRegNumber: `SZ${1000 + i}`,
        microchipNumber: `98100000000${i}`,
      }),
    ),
  );
  const cartEntries = dogs.map((dog, i) => ({
    entryType: 'standard' as const,
    dogId: dog.id,
    classIds: [classes[i]!.id],
    isNfc: false,
  }));
  return { show, exhibitor, dogs, classes, cartEntries };
}

describe('regional (SV/WUSV) entry fees — journey', () => {
  it("Mandy's example: 3 BRG-member dogs pay £17 + £17 + £11 = £45", async () => {
    const { show, exhibitor, cartEntries } = await regionalFixture(3);
    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: cartEntries,
      regionalMembership: 'BRG/League member',
      regionalMembershipNumber: 'BRG-12345',
    });

    expect(result.totalAmount).toBe(4500);

    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(order?.regionalMembership).toBe('BRG/League member');
    expect(order?.regionalMembershipNumber).toBe('BRG-12345');

    const orderEntries = await testDb.query.entries.findMany({ where: eq(entries.orderId, result.orderId) });
    const sum = orderEntries.reduce((acc, e) => acc + e.totalFee, 0);
    expect(sum).toBe(4500);
  });

  it('non-member 3 dogs pay standard £20 + £20 + £16 = £56', async () => {
    const { show, exhibitor, cartEntries } = await regionalFixture(3);
    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: cartEntries,
    });
    expect(result.totalAmount).toBe(5600);

    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(order?.regionalMembership).toBeNull();
  });

  it('makes the 4th dog free (4 dogs = £56 standard)', async () => {
    const { show, exhibitor, cartEntries } = await regionalFixture(4);
    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: cartEntries,
    });
    expect(result.totalAmount).toBe(5600);
  });

  it('a club membership uses its own price list (option B)', async () => {
    const { show, exhibitor, cartEntries } = await regionalFixture(3);
    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: cartEntries,
      regionalMembership: 'Clyde Valley member',
    });
    // Club schedule: £15 + £15 + £10 = £40
    expect(result.totalAmount).toBe(4000);

    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(order?.regionalMembership).toBe('Clyde Valley member');
  });

  it('first-time exhibitor with one dog enters free (£0, auto-confirmed)', async () => {
    const { show, exhibitor, cartEntries } = await regionalFixture(1);
    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: cartEntries,
      regionalFirstTimeExhibitor: true,
    });
    expect(result.totalAmount).toBe(0);
    expect(result.freeEntry).toBe(true);

    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(order?.regionalFirstTimeExhibitor).toBe(true);
    expect(order?.status).toBe('paid');
  });

  it('first-time exhibitor with three dogs: only the first is free (£0 + £20 + £16 = £36)', async () => {
    const { show, exhibitor, cartEntries } = await regionalFixture(3);
    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: cartEntries,
      regionalFirstTimeExhibitor: true,
    });
    expect(result.totalAmount).toBe(3600);
  });

  it('adds a discretionary donation to the total and records the affix', async () => {
    const { show, exhibitor, cartEntries } = await regionalFixture(1);
    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: cartEntries,
      regionalMembership: 'BRG/League member',
      donationPence: 500,
      donationAffix: 'Hundark',
    });
    // 1 member dog (£17) + £5 donation = £22
    expect(result.totalAmount).toBe(2200);

    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(order?.donationPence).toBe(500);
    expect(order?.donationAffix).toBe('Hundark');
  });

  it('rejects a membership label that is not configured for the show', async () => {
    const { show, exhibitor, cartEntries } = await regionalFixture(1);
    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: cartEntries,
        regionalMembership: 'Made Up Club',
      }),
    ).rejects.toThrow(/unknown membership/i);
  });

  it('ignores a donation when the show has donations disabled', async () => {
    const cfg: RegionalFeeConfig = { ...BRG_CONFIG, donationsEnabled: false };
    const { show, exhibitor, cartEntries } = await regionalFixture(1, cfg);
    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: cartEntries,
      regionalMembership: 'BRG/League member',
      donationPence: 500,
    });
    // Donation dropped → just the £17 member entry.
    expect(result.totalAmount).toBe(1700);
    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, result.orderId) });
    expect(order?.donationPence).toBe(0);
  });
});
