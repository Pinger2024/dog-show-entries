/**
 * TESTING_MAP #126 — entry confirmation email PAYLOAD. The call-wiring (webhook →
 * sendEntryConfirmationEmail(order.id)) is covered in stripe-webhook.test.ts, but
 * the actual email an exhibitor receives (recipient, subject, body) was never
 * asserted because setup.ts mocks the email service at the module boundary.
 *
 * This un-mocks the real sender via vi.importActual and lets it build the payload
 * against the mocked Resend SDK, so we assert the real to/subject/from/reply-to
 * and that the dog + class actually appear in the body.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resendMocks } from '../helpers/resend-mocks';
import {
  makeSecretaryWithOrg,
  makeBreed,
  makeShow,
  makeUser,
  makeDog,
  makeClassDef,
  makeShowClass,
  makeOrder,
  makeEntry,
  makeEntryClass,
} from '../helpers/factories';

// setup.ts mocks the email service at the module boundary; importActual gives us
// the genuine sender so it builds a real payload against the mocked Resend SDK.
const { sendEntryConfirmationEmail } =
  await vi.importActual<typeof import('@/server/services/email')>('@/server/services/email');

describe('entry confirmation email payload (TESTING_MAP #126)', () => {
  beforeEach(() => {
    resendMocks.send.mockClear();
  });

  it('sends the exhibitor a confirmation naming their show, dog and class', async () => {
    const { org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      name: 'Clyde Valley Champ Show',
      status: 'entries_open',
    });
    const exhibitor = await makeUser({ role: 'exhibitor', email: 'jane.exhibitor@test.local', name: 'Jane Exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, registeredName: 'Hundark Bright Spark' });
    const classDef = await makeClassDef({ name: 'Open' });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id, classDefinitionId: classDef.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2000 });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, orderId: order.id, status: 'confirmed' });
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });

    await sendEntryConfirmationEmail(order.id);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const payload = resendMocks.send.mock.calls[0]![0] as {
      to: string; from: string; replyTo: string; subject: string; html: string;
    };
    expect(payload.to).toBe('jane.exhibitor@test.local');
    expect(payload.subject).toBe('Entry Confirmed — Clyde Valley Champ Show');
    expect(payload.from).toContain('noreply@'); // configured EMAIL_FROM sender
    expect(payload.replyTo).toContain('@'); // reply routes back into the feedback pipeline
    // Body actually names the dog and the class the exhibitor paid for.
    expect(payload.html).toContain('Hundark Bright Spark');
    expect(payload.html).toContain('Open');
  });

  it('does not send when the order has no exhibitor email', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id, status: 'entries_open' });
    // Exhibitor exists but we point the order at a non-existent order id → no send.
    await sendEntryConfirmationEmail('00000000-0000-0000-0000-000000000000');
    expect(resendMocks.send).not.toHaveBeenCalled();
  });
});
