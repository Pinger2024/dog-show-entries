import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { orders, sundryItems, orderSundryItems, shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeOrder,
  setShowStatus,
} from '../helpers/factories';

async function paidCatalogueOrder() {
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'completed',
    name: 'Catalogue Show',
  });
  // Create a sundry item that matches the CATALOGUE_NAME_PATTERN ('catalog' / 'catalogue')
  const [sundry] = await testDb.insert(sundryItems).values({
    showId: show.id,
    name: 'Show Catalogue',
    priceInPence: 1000,
    sortOrder: 0,
  }).returning();
  // Paid order with the catalogue sundry attached
  const order = await makeOrder({
    showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 1000,
  });
  await testDb.insert(orderSundryItems).values({
    orderId: order.id,
    sundryItemId: sundry!.id,
    quantity: 1,
    unitPrice: 1000,
  });
  return { exhibitor, org, breed, show, sundry, order };
}

describe('orders.getById', () => {
  it('returns the caller\'s order with embedded entries + payments + sundries', async () => {
    const { exhibitor, order } = await paidCatalogueOrder();
    const fetched = await createTestCaller(exhibitor).orders.getById({ id: order.id });
    expect(fetched.id).toBe(order.id);
    expect(fetched.orderSundryItems).toHaveLength(1);
  });

  it('rejects fetching another exhibitor\'s order', async () => {
    const { order } = await paidCatalogueOrder();
    const stranger = await makeUser({ role: 'exhibitor' });
    await expect(
      createTestCaller(stranger).orders.getById({ id: order.id }),
    ).rejects.toThrow(/Not your order/);
  });

  it('returns NOT_FOUND for an unknown id', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    await expect(
      createTestCaller(exhibitor).orders.getById({
        id: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(/Order not found/);
  });
});

describe('orders.list', () => {
  it('returns only the caller\'s orders, paginated', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const show = await makeShow({ organisationId: org.id });
    await Promise.all([
      makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' }),
      makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'pending_payment' }),
    ]);
    // A third order owned by someone else should not appear.
    const otherUser = await makeUser({ role: 'exhibitor' });
    await makeOrder({ showId: show.id, exhibitorId: otherUser.id, status: 'paid' });

    const res = await createTestCaller(exhibitor).orders.list({});
    expect(res.total).toBe(2);
    expect(res.items.every((o) => o.exhibitorId === exhibitor.id)).toBe(true);
  });
});

describe('shows.getCatalogueAccess', () => {
  it('reports hasPurchased=true for an exhibitor with a paid catalogue order', async () => {
    const { exhibitor, show } = await paidCatalogueOrder();
    const access = await createTestCaller(exhibitor).shows.getCatalogueAccess({
      showId: show.id,
    });
    expect(access.hasPurchased).toBe(true);
    expect(access.isAvailable).toBe(true); // status='completed' is in CATALOGUE_AVAILABLE_STATUSES
  });

  it('reports hasPurchased=false for an exhibitor with no order', async () => {
    const { show } = await paidCatalogueOrder();
    const stranger = await makeUser({ role: 'exhibitor' });
    const access = await createTestCaller(stranger).shows.getCatalogueAccess({
      showId: show.id,
    });
    expect(access.hasPurchased).toBe(false);
  });

  it('reports isAvailable=false when the show status is too early', async () => {
    const { exhibitor, show } = await paidCatalogueOrder();
    await setShowStatus(show.id, 'entries_open');
    const access = await createTestCaller(exhibitor).shows.getCatalogueAccess({
      showId: show.id,
    });
    expect(access.isAvailable).toBe(false);
  });
});

describe('shows.getMyCataloguePurchases', () => {
  it('returns the shows where the caller has bought a catalogue', async () => {
    const { exhibitor, show } = await paidCatalogueOrder();
    const list = await createTestCaller(exhibitor).shows.getMyCataloguePurchases();
    expect(list.map((p) => p.showId)).toContain(show.id);
  });

  it('returns empty for a user with no purchases', async () => {
    const stranger = await makeUser({ role: 'exhibitor' });
    const list = await createTestCaller(stranger).shows.getMyCataloguePurchases();
    expect(list).toEqual([]);
  });
});

describe('shows.getShowDogPhotos (public)', () => {
  it('returns up to 24 random primary photos from confirmed entries', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, status: 'completed',
    });
    // Confirmed entry on a dog with a primary photo should appear
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const { makeEntry, makeEntryClass } = await import('../helpers/factories');
    const entry = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed',
    });
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const { dogPhotos } = await import('@/server/db/schema');
    await testDb.insert(dogPhotos).values({
      dogId: dog.id,
      storageKey: 'test/key',
      url: 'https://r2.test/dog.jpg',
      isPrimary: true,
    });

    const photos = await createTestCaller(null).shows.getShowDogPhotos({ showId: show.id });
    expect(photos).toHaveLength(1);
    expect(photos[0]?.dogId).toBe(dog.id);
    expect(photos[0]?.photoUrl).toBe('https://r2.test/dog.jpg');
  });
});

void shows;
