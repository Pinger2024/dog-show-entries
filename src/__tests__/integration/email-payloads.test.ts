import { describe, it, expect, vi, beforeEach } from 'vitest';

// Override setup.ts's global stub so the REAL email senders run and
// we can inspect what they pass to resend.emails.send (captured below).
vi.mock('@/server/services/email', async () => {
  return await vi.importActual<typeof import('@/server/services/email')>(
    '@/server/services/email',
  );
});

import { resendMocks } from '../helpers/resend-mocks';
import {
  sendEntryConfirmationEmail,
  sendSecretaryNotificationEmail,
  sendPrintOrderConfirmationEmail,
  sendJudgeApprovalRequestEmail,
} from '@/server/services/email';
import { eq } from 'drizzle-orm';
import { entries, printOrders } from '@/server/db/schema';
import { testDb } from '../helpers/db';
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
} from '../helpers/factories';

beforeEach(() => {
  resendMocks.send.mockClear();
});

async function paidOrder() {
  const exhibitor = await makeUser({
    role: 'exhibitor',
    email: 'mandy@hundarkgsd.co.uk',
    name: 'Mandy',
  });
  const org = await makeOrg({
    name: 'Clyde Valley GSD Club',
    contactEmail: 'secretary@example.test',
  });
  const breed = await makeBreed({ name: 'German Shepherd' });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    name: 'Spring Open Show',
    secretaryEmail: 'secretary@example.test',
  });
  const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
  const dog = await makeDog({
    ownerId: exhibitor.id,
    breedId: breed.id,
    registeredName: 'Bonzo Of The Glen',
  });
  const order = await makeOrder({
    showId: show.id,
    exhibitorId: exhibitor.id,
    status: 'paid',
    totalAmount: 1500,
  });
  const entry = await makeEntry({
    showId: show.id,
    dogId: dog.id,
    exhibitorId: exhibitor.id,
    status: 'confirmed',
  });
  await testDb.update(entries).set({ orderId: order.id }).where(eq(entries.id, entry.id));
  await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  return { exhibitor, org, breed, show, dog, order, entry };
}

describe('sendEntryConfirmationEmail', () => {
  it('sends to the exhibitor with the show + dog details in the body', async () => {
    const { order, exhibitor, show, dog } = await paidOrder();
    await sendEntryConfirmationEmail(order.id);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const payload = resendMocks.send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.to).toBe(exhibitor.email);
    expect(payload.subject).toMatch(new RegExp(show.name));
    const html = String(payload.html ?? '');
    expect(html).toContain(dog.registeredName);
  });

  it('does nothing when the order is missing', async () => {
    await sendEntryConfirmationEmail('00000000-0000-0000-0000-000000000000');
    expect(resendMocks.send).not.toHaveBeenCalled();
  });
});

describe('sendSecretaryNotificationEmail', () => {
  it('sends to the show secretary with the order summary', async () => {
    const { order, show } = await paidOrder();
    await sendSecretaryNotificationEmail(order.id);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const payload = resendMocks.send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.to).toBe('secretary@example.test');
    void show;
    const html = String(payload.html ?? '');
    expect(html).toContain('Bonzo Of The Glen');
  });
});

describe('sendPrintOrderConfirmationEmail', () => {
  it('sends to the order owner with the print order details', async () => {
    const exhibitor = await makeUser({
      role: 'exhibitor',
      email: 'pp@test.local',
      name: 'Print Person',
    });
    const org = await makeOrg();
    const show = await makeShow({ organisationId: org.id, name: 'Print Show' });
    // Insert a paid print order with one item
    const [printOrder] = await testDb
      .insert(printOrders)
      .values({
        showId: show.id,
        organisationId: org.id,
        orderedByUserId: exhibitor.id,
        status: 'paid',
        subtotalAmount: 5000,
        totalAmount: 5000,
        markupAmount: 1000,
        serviceLevel: 'standard',
        deliveryName: 'Print Person',
        deliveryAddress1: '1 Print Lane',
        deliveryTown: 'Printtown',
        deliveryPostcode: 'P1 1AA',
        tradeprintOrderRef: 'MIXAM-XYZ',
      })
      .returning();
    const { printOrderItems } = await import('@/server/db/schema');
    await testDb.insert(printOrderItems).values({
      printOrderId: printOrder!.id,
      documentType: 'catalogue',
      documentLabel: 'Show Catalogue',
      tradeprintProductId: 'cat-001',
      quantity: 50,
      unitTradeCost: 100,
      unitSellingPrice: 100,
      lineTotal: 5000,
    });

    await sendPrintOrderConfirmationEmail(printOrder!.id);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const payload = resendMocks.send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.to).toBe(exhibitor.email);
    const html = String(payload.html ?? '');
    expect(html).toContain('Show Catalogue');
  });
});

describe('sendJudgeApprovalRequestEmail', () => {
  it('sends to the judge with the show + breed list and approval link', async () => {
    await sendJudgeApprovalRequestEmail({
      judge: { name: 'Judge Bob', email: 'bob@example.test' },
      show: {
        name: 'Test Show',
        startDate: '2030-06-01',
        slug: 'test-show',
        id: '00000000-0000-0000-0000-000000000001',
        organisation: { name: 'Test Society' },
      },
      approvalToken: 'token-abc-123',
      breeds: ['00000000-0000-0000-0000-000000000010'],
    });

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const payload = resendMocks.send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.to).toBe('bob@example.test');
    const html = String(payload.html ?? '');
    expect(html).toContain('token-abc-123');
    expect(html).toContain('Test Show');
  });
});
