import { describe, it, expect, vi, beforeEach } from 'vitest';

// Run the REAL email sender (setup.ts stubs it globally).
vi.mock('@/server/services/email', async () => {
  return await vi.importActual<typeof import('@/server/services/email')>('@/server/services/email');
});

import { resendMocks } from '../helpers/resend-mocks';
import { sendEntryConfirmationEmail } from '@/server/services/email';
import {
  makeSecretaryWithOrg,
  makeUser,
  makeShow,
  makeOrder,
  makeSundryItem,
  makeOrderSundryItem,
} from '../helpers/factories';
import type { SundryKind } from '@/lib/sundry-kind';

beforeEach(() => resendMocks.send.mockClear());

async function confirmationHtml(name: string, kind: SundryKind) {
  const { org } = await makeSecretaryWithOrg();
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const show = await makeShow({ organisationId: org.id });
  const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 500 });
  const item = await makeSundryItem({ showId: show.id, name, kind });
  await makeOrderSundryItem({ orderId: order.id, sundryItemId: item.id, quantity: 1, unitPrice: 500 });
  await sendEntryConfirmationEmail(order.id);
  expect(resendMocks.send).toHaveBeenCalledTimes(1);
  const payload = resendMocks.send.mock.calls[0]?.[0] as Record<string, unknown>;
  return String(payload.html ?? '');
}

// Mandy, 15 Oct 2026: a hard copy also gets the online copy, but we don't
// advertise it (otherwise people share it instead of buying a hard copy).
describe('order-confirmation email: "Online Catalogue Purchased" box', () => {
  it('printed-only order: no box', async () => {
    const html = await confirmationHtml('Printed Catalogue', 'printed_catalogue');
    expect(html).not.toContain('Online Catalogue Purchased');
  });
  it('online order: box shown', async () => {
    const html = await confirmationHtml('Online Catalogue', 'online_catalogue');
    expect(html).toContain('Online Catalogue Purchased');
  });
  it('a catalogue-named advert: no box', async () => {
    const html = await confirmationHtml('Catalogue Advert', 'advert');
    expect(html).not.toContain('Online Catalogue Purchased');
  });
  it('the kind decides, not the name', async () => {
    const html = await confirmationHtml('Programme PDF', 'online_catalogue');
    expect(html).toContain('Online Catalogue Purchased');
  });
});
