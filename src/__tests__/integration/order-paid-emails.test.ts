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

  // Mandy, 15 Oct 2026 (8021): an entry the secretary adds by hand emails the
  // exhibitor. She typed it in, so she is not sent a notice about it.
  it('an entry the secretary recorded: the exhibitor alone is emailed, told who entered it and how it was paid', async () => {
    const { org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, name: 'Postal Show', secretaryEmail: 'sec@test.local' });
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'postal@test.local', name: 'Polly Postal' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const sc = await makeShowClass({ showId: show.id, breedId: breed.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2000, platformFeePence: 0, stripePaymentIntentId: null });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, orderId: order.id, status: 'confirmed', totalFee: 2000 });
    await makeEntryClass({ entryId: entry.id, showClassId: sc.id, fee: 2000 });

    await sendOrderPaidEmails(order.id, { recordedBy: 'secretary', paymentMethod: 'postal' });

    expect(sentTo()).toEqual([{ to: 'postal@test.local', subject: 'Entry Confirmed — Postal Show' }]);
    const html = (resendMocks.send.mock.calls[0] as unknown as [{ html: string }])[0].html;
    expect(html).toContain('Entered for you by the show secretary');
    expect(html).toContain('Paid by cheque');
    expect(html).not.toContain('Booking fee');
    expect(html).toMatch(/Total Paid[\s\S]*£20\.00/);
  });

  it('an online receipt never says the secretary entered it', async () => {
    const { org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, name: 'Card Show', secretaryEmail: 'sec@test.local' });
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'card@test.local', name: 'Cara Card' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const sc = await makeShowClass({ showId: show.id, breedId: breed.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2000, platformFeePence: 120 });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, orderId: order.id, status: 'confirmed', totalFee: 2000 });
    await makeEntryClass({ entryId: entry.id, showClassId: sc.id, fee: 2000 });

    await sendOrderPaidEmails(order.id);

    const receipt = (resendMocks.send.mock.calls as unknown as Array<[{ to: string; html: string }]>)
      .map(([p]) => p)
      .find((p) => p.to === 'card@test.local')!;
    expect(receipt.html).not.toContain('show secretary');
    expect(receipt.html).not.toMatch(/Paid (by|in) (cheque|cash|bank)/);
  });

  // Three colours were written as '${BRAND.x}' inside plain quotes, so the
  // email carried the text "${BRAND.green}" instead of a colour — the
  // receipt's View Catalogue button had no background at all.
  it('neither email carries an unfilled ${…} (NFC entry + online catalogue)', async () => {
    const { org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, name: 'NFC Show', secretaryEmail: 'sec@test.local' });
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'nfc@test.local', name: 'Nora NFC' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const sc = await makeShowClass({ showId: show.id, breedId: breed.id });
    const item = await makeSundryItem({ showId: show.id, name: 'Online catalogue', priceInPence: 300, kind: 'online_catalogue' });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2300, platformFeePence: 123 });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, orderId: order.id, status: 'confirmed', totalFee: 2000, isNfc: true });
    await makeEntryClass({ entryId: entry.id, showClassId: sc.id, fee: 2000 });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: item.id, quantity: 1, unitPrice: 300 });

    await sendOrderPaidEmails(order.id);

    const sentHtml = (resendMocks.send.mock.calls as unknown as Array<[{ to: string; html: string }]>).map(([p]) => p);
    expect(sentHtml.map((p) => p.to).sort()).toEqual(['nfc@test.local', 'sec@test.local']);
    for (const p of sentHtml) {
      expect(p.html, p.to).not.toContain('${');
    }
    expect(sentHtml.find((p) => p.to === 'nfc@test.local')!.html).toContain('NOT FOR COMPETITION');
  });
});
