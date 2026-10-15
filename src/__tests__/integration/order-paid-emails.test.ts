/**
 * sendOrderPaidEmails — the ONE place that decides who is told when an order
 * is paid: the exhibitor gets their receipt and the show secretary gets a
 * notice. The Stripe webhook calls it for a card payment and checkout calls it
 * for a £0 order, so a free order is never silent (live bug to 15 Oct 2026: 7
 * free orders on prod, mostly junior handlers, got no email at all).
 *
 * setup.ts mocks the email service at the module boundary; importActual gives
 * the real function, which builds both payloads against the mocked Resend SDK.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resendMocks } from '../helpers/resend-mocks';
import {
  makeSecretaryWithOrg,
  makeBreed,
  makeShow,
  makeUser,
  makeDog,
  makeShowClass,
  makeOrder,
  makeEntry,
  makeEntryClass,
  makeSundryItem,
  makeOrderSundryItem,
} from '../helpers/factories';

const { sendOrderPaidEmails } =
  await vi.importActual<typeof import('@/server/services/email')>('@/server/services/email');

type Sent = { to: string; subject: string };
const sentTo = () => (resendMocks.send.mock.calls as unknown as Array<[Sent]>).map(([p]) => ({ to: p.to, subject: p.subject }));

describe('sendOrderPaidEmails', () => {
  beforeEach(() => resendMocks.send.mockClear());

  it('a dog entry: the exhibitor gets Entry Confirmed and the secretary gets New Entry', async () => {
    const { org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, name: 'Free JH Show', secretaryEmail: 'sec@test.local' });
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'parent@test.local', name: 'Pat Parent' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const sc = await makeShowClass({ showId: show.id, breedId: breed.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 0, stripePaymentIntentId: null });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, orderId: order.id, status: 'confirmed' });
    await makeEntryClass({ entryId: entry.id, showClassId: sc.id });

    await sendOrderPaidEmails(order.id);

    expect(sentTo()).toEqual(expect.arrayContaining([
      { to: 'parent@test.local', subject: 'Entry Confirmed — Free JH Show' },
      { to: 'sec@test.local', subject: 'New Entry — Pat Parent → Free JH Show' },
    ]));
    expect(resendMocks.send).toHaveBeenCalledTimes(2);
  });

  it('extras with no dog: the buyer gets their order receipt and the secretary the no-dog notice', async () => {
    const { org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, name: 'Extras Show', secretaryEmail: 'sec@test.local' });
    const buyer = await makeUser({ role: 'exhibitor', email: 'buyer@test.local', name: 'Bea Buyer' });
    const item = await makeSundryItem({ showId: show.id, name: 'Members Parking', priceInPence: 0, kind: 'parking' });
    const order = await makeOrder({ showId: show.id, exhibitorId: buyer.id, status: 'paid', totalAmount: 0, stripePaymentIntentId: null });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: item.id, quantity: 1, unitPrice: 0 });

    await sendOrderPaidEmails(order.id);

    expect(sentTo()).toEqual(expect.arrayContaining([
      { to: 'buyer@test.local', subject: 'Your order for Extras Show' },
      { to: 'sec@test.local', subject: 'New order (extras, no dog) — Bea Buyer → Extras Show' },
    ]));
    expect(resendMocks.send).toHaveBeenCalledTimes(2);
  });
});
