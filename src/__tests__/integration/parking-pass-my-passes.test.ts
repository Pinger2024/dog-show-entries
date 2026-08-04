import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeUser,
  makeShow,
  makeOrder,
  makeSundryItem,
  makeOrderSundryItem,
} from '../helpers/factories';

describe('orders.myParkingPasses', () => {
  it('lists a paid order with a parking sundry, scoped to the calling exhibitor', async () => {
    const { org } = await makeSecretaryWithOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const parkingItem = await makeSundryItem({ showId: show.id, name: 'Pre-paid Parking Pass' });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: parkingItem.id, quantity: 2, unitPrice: 300 });

    const caller = createTestCaller({
      id: exhibitor.id,
      email: exhibitor.email!,
      name: exhibitor.name!,
      role: 'exhibitor',
    });

    const result = await caller.orders.myParkingPasses();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ orderId: order.id, showId: show.id, quantity: 2 });
  });

  it('excludes an order with no parking sundry', async () => {
    const { org } = await makeSecretaryWithOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const catalogueItem = await makeSundryItem({ showId: show.id, name: 'Online Catalogue' });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: catalogueItem.id, quantity: 1, unitPrice: 500 });

    const caller = createTestCaller({
      id: exhibitor.id,
      email: exhibitor.email!,
      name: exhibitor.name!,
      role: 'exhibitor',
    });

    const result = await caller.orders.myParkingPasses();
    expect(result).toHaveLength(0);
  });

  it('excludes an unpaid order even with a parking sundry', async () => {
    const { org } = await makeSecretaryWithOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'pending_payment' });
    const parkingItem = await makeSundryItem({ showId: show.id, name: 'Pre-paid Parking Pass' });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: parkingItem.id, quantity: 1, unitPrice: 300 });

    const caller = createTestCaller({
      id: exhibitor.id,
      email: exhibitor.email!,
      name: exhibitor.name!,
      role: 'exhibitor',
    });

    const result = await caller.orders.myParkingPasses();
    expect(result).toHaveLength(0);
  });

  it('never returns another exhibitor\'s parking pass', async () => {
    const { org } = await makeSecretaryWithOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const stranger = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const parkingItem = await makeSundryItem({ showId: show.id, name: 'Pre-paid Parking Pass' });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: parkingItem.id, quantity: 1, unitPrice: 300 });

    const caller = createTestCaller({
      id: stranger.id,
      email: stranger.email!,
      name: stranger.name!,
      role: 'exhibitor',
    });

    const result = await caller.orders.myParkingPasses();
    expect(result).toHaveLength(0);
  });

  it('does not confuse a "Sparking Wine" sundry with a parking pass', async () => {
    const { org } = await makeSecretaryWithOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const wineItem = await makeSundryItem({ showId: show.id, name: 'Sparking Wine' });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: wineItem.id, quantity: 1, unitPrice: 800 });

    const caller = createTestCaller({
      id: exhibitor.id,
      email: exhibitor.email!,
      name: exhibitor.name!,
      role: 'exhibitor',
    });

    const result = await caller.orders.myParkingPasses();
    expect(result).toHaveLength(0);
  });
});
