/**
 * My Entries data for people who bought extras with no dog (Mandy, 15 Oct
 * 2026). entries.list is built from entries, so an extras-only buyer would see
 * "No entries yet". orders.myExtrasOnlyOrders is the order-keyed query that
 * puts those orders back on the page: paid, at least one sundry line, and NO
 * live entry. A withdrawn dog keeps its entry row (deletedAt stays NULL), so
 * its order is NOT extras-only and keeps its normal dog card.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeDog,
  makeEntry,
  makeOrder,
  makeSundryItem,
  makeOrderSundryItem,
} from '../helpers/factories';

async function base() {
  const org = await makeOrg();
  const breed = await makeBreed();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, name: 'Midland Regional' });
  const item = await makeSundryItem({ showId: show.id, name: 'Printed Catalogue', priceInPence: 500 });
  const user = await makeUser({ role: 'exhibitor' });
  return { show, breed, item, user };
}

describe('orders.myExtrasOnlyOrders', () => {
  it('returns a paid order with sundries and no entries, with show and items', async () => {
    const { show, item, user } = await base();
    const order = await makeOrder({ showId: show.id, exhibitorId: user.id, status: 'paid', totalAmount: 1000 });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: item.id, quantity: 2, unitPrice: 500 });

    const res = await createTestCaller(user).orders.myExtrasOnlyOrders();
    expect(res).toHaveLength(1);
    expect(res[0]!.id).toBe(order.id);
    expect(res[0]!.show.name).toBe('Midland Regional');
    expect(res[0]!.items).toEqual([{ id: expect.any(String), name: 'Printed Catalogue', quantity: 2, unitPrice: 500 }]);
    expect(res[0]!.totalAmount).toBe(1000);
  });

  it("does not return an order whose dog was withdrawn (that order keeps its dog card)", async () => {
    const { show, item, user, breed } = await base();
    const dog = await makeDog({ ownerId: user.id, breedId: breed.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: user.id, status: 'paid', totalAmount: 1500 });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: item.id, unitPrice: 500 });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: user.id, orderId: order.id, status: 'confirmed' });
    await testDb.update(entries).set({ status: 'withdrawn' }).where(eq(entries.id, entry.id));

    expect(await createTestCaller(user).orders.myExtrasOnlyOrders()).toEqual([]);
  });

  it("does not return someone else's order, an unpaid order, or a paid order with no extras", async () => {
    const { show, item, user } = await base();
    const other = await makeUser({ role: 'exhibitor' });
    const theirs = await makeOrder({ showId: show.id, exhibitorId: other.id, status: 'paid' });
    await makeOrderSundryItem({ orderId: theirs.id, sundryItemId: item.id, unitPrice: 500 });
    const unpaid = await makeOrder({ showId: show.id, exhibitorId: user.id, status: 'pending_payment' });
    await makeOrderSundryItem({ orderId: unpaid.id, sundryItemId: item.id, unitPrice: 500 });
    await makeOrder({ showId: show.id, exhibitorId: user.id, status: 'paid' }); // no sundry lines

    expect(await createTestCaller(user).orders.myExtrasOnlyOrders()).toEqual([]);
    const theirsList = await createTestCaller(other).orders.myExtrasOnlyOrders();
    expect(theirsList.map((o) => o.id)).toEqual([theirs.id]);
  });
});
