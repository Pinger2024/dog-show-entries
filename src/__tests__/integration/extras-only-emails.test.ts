/**
 * Extras with no dog (Mandy, 15 Oct 2026): an order with ZERO entries gets its
 * own receipt (customer) and its own secretary notice, rather than "Entry
 * Confirmed" with an empty table and a "tell your breed group" share block.
 * The ordinary entry email is unchanged for orders that have entries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/services/email', async () => {
  return await vi.importActual<typeof import('@/server/services/email')>('@/server/services/email');
});

import { resendMocks } from '../helpers/resend-mocks';
import { sendEntryConfirmationEmail, sendSecretaryNotificationEmail } from '@/server/services/email';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeOrder,
  makeSundryItem,
  makeOrderSundryItem,
} from '../helpers/factories';
import { testDb } from '../helpers/db';
import { entries } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

beforeEach(() => resendMocks.send.mockClear());

async function extrasOnlyOrder() {
  const exhibitor = await makeUser({ role: 'exhibitor', email: 'shirley@example.test', name: 'Shirley Smith' });
  const org = await makeOrg({ name: 'GSDL BRG', contactEmail: 'sec@example.test' });
  const breed = await makeBreed();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, name: 'Regional Show', secretaryEmail: 'sec@example.test' });
  const cat = await makeSundryItem({ showId: show.id, name: 'Printed Catalogue', priceInPence: 500 });
  const parking = await makeSundryItem({ showId: show.id, name: 'Parking Pass', priceInPence: 300 });
  const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 1300 });
  await makeOrderSundryItem({ orderId: order.id, sundryItemId: cat.id, quantity: 2, unitPrice: 500 });
  await makeOrderSundryItem({ orderId: order.id, sundryItemId: parking.id, quantity: 1, unitPrice: 300 });
  return { exhibitor, show, order };
}

function sent() {
  return resendMocks.send.mock.calls[0]?.[0] as unknown as { to: string; subject: string; html: string };
}

describe('extras-only order emails', () => {
  it('customer receipt: "Your order", items, total, entries-and-orders button, no share block', async () => {
    const { order, exhibitor } = await extrasOnlyOrder();
    await sendEntryConfirmationEmail(order.id);
    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const p = sent();
    expect(p.to).toBe(exhibitor.email);
    expect(p.subject).toBe('Your order for Regional Show');
    expect(p.html).toContain('Thank you for your order');
    expect(p.html).toContain('Printed Catalogue');
    expect(p.html).toContain('x2');
    expect(p.html).toContain('Parking Pass');
    expect(p.html).toContain('£13.00');
    expect(p.html).toContain('View my entries and orders');
    expect(p.html).not.toContain('Entry Confirmed');
    expect(p.html).not.toContain('Tell your breed group');
  });

  it('secretary notice: names the buyer, says no dog, lists the items and total', async () => {
    const { order } = await extrasOnlyOrder();
    await sendSecretaryNotificationEmail(order.id);
    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const p = sent();
    expect(p.to).toBe('sec@example.test');
    expect(p.subject).toBe('New order (extras, no dog) — Shirley Smith → Regional Show');
    expect(p.html).toContain('Printed Catalogue');
    expect(p.html).toContain('Parking Pass');
    expect(p.html).toContain('£13.00');
  });

  it('an order WITH entries still gets the ordinary entry emails', async () => {
    const { exhibitor, show, order } = await extrasOnlyOrder();
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Bonzo Of The Glen' });
    const sc = await makeShowClass({ showId: show.id, breedId: breed.id });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    await testDb.update(entries).set({ orderId: order.id }).where(eq(entries.id, entry.id));
    await makeEntryClass({ entryId: entry.id, showClassId: sc.id });

    await sendEntryConfirmationEmail(order.id);
    expect(sent().subject).toBe('Entry Confirmed — Regional Show');
    expect(sent().html).toContain('Tell your breed group');
    resendMocks.send.mockClear();
    await sendSecretaryNotificationEmail(order.id);
    expect(sent().subject).toBe('New Entry — Shirley Smith → Regional Show');
  });
});
