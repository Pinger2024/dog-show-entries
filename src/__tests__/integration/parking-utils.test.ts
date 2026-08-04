import { describe, it, expect } from 'vitest';
import { isParkingSundry, getOrderParkingPassQuantity } from '@/lib/parking-utils';
import { testDb } from '../helpers/db';
import {
  makeSecretaryWithOrg,
  makeShow,
  makeUser,
  makeOrder,
  makeSundryItem,
  makeOrderSundryItem,
} from '../helpers/factories';

describe('isParkingSundry', () => {
  it('matches "Pre-paid Parking Pass"', () => {
    expect(isParkingSundry('Pre-paid Parking Pass')).toBe(true);
  });

  it('matches plain "Parking"', () => {
    expect(isParkingSundry('Parking')).toBe(true);
  });

  it('matches "Car Pass"', () => {
    expect(isParkingSundry('Car Pass')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isParkingSundry('CAR PASS')).toBe(true);
    expect(isParkingSundry('parking')).toBe(true);
  });

  it('does NOT match "Sparking Wine" (substring, not a whole word)', () => {
    expect(isParkingSundry('Sparking Wine')).toBe(false);
  });

  it('does NOT match unrelated sundry names', () => {
    expect(isParkingSundry('Printed Catalogue')).toBe(false);
    expect(isParkingSundry('Club Membership — Sole')).toBe(false);
    expect(isParkingSundry('Donation')).toBe(false);
  });
});

describe('getOrderParkingPassQuantity', () => {
  it('sums quantity across parking sundry lines on an order', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const parkingItem = await makeSundryItem({ showId: show.id, name: 'Pre-paid Parking Pass' });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: parkingItem.id, quantity: 2, unitPrice: 300 });
    void user;

    const qty = await getOrderParkingPassQuantity(testDb, order.id);
    expect(qty).toBe(2);
  });

  it('returns 0 when the order has no parking sundry', async () => {
    const { org } = await makeSecretaryWithOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const catalogueItem = await makeSundryItem({ showId: show.id, name: 'Online Catalogue' });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: catalogueItem.id, quantity: 1, unitPrice: 500 });

    const qty = await getOrderParkingPassQuantity(testDb, order.id);
    expect(qty).toBe(0);
  });

  it('does not confuse a "Sparking Wine" sundry with a parking pass', async () => {
    const { org } = await makeSecretaryWithOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const wineItem = await makeSundryItem({ showId: show.id, name: 'Sparking Wine' });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: wineItem.id, quantity: 3, unitPrice: 800 });

    const qty = await getOrderParkingPassQuantity(testDb, order.id);
    expect(qty).toBe(0);
  });
});
