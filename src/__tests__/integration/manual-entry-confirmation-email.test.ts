/**
 * Mandy, 15 Oct 2026 (Telegram 8021): an entry the secretary adds by hand —
 * postal, cash, bank transfer — should email the exhibitor "so they know they
 * have entered and what class". Until now it emailed nobody.
 *
 * Who is told goes through the one owner, sendOrderPaidEmails, with the
 * secretary as the source: the exhibitor gets their Entry Confirmed, the
 * secretary is not sent a notice about the entry she just typed in.
 *
 * The receipt goes to the exhibitor's Remi account. When the email typed in
 * has no account, the entry is filed under the secretary (long-standing), so
 * an email built from the order would land in HER inbox — none is sent, and
 * the result says so for the dialog to tell her. Whether such a person should
 * get one (and a sign-in) is Mandy's question, asked 15 Oct (8023).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendOrderPaidEmails } from '@/server/services/email';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeUser,
} from '../helpers/factories';

async function showWithClass() {
  const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({ organisationId: org.id, status: 'entries_open', firstEntryFee: 2000 });
  const def = await makeClassDef({ name: 'Open' });
  const showClass = await makeShowClass({ showId: show.id, classDefinitionId: def.id, breedId: breed.id, entryFee: 2000 });
  return { secretary, caller: createTestCaller(secretary as never), show, showClass, breed };
}

const sent = vi.mocked(sendOrderPaidEmails);

describe('secretary.createManualEntry — the exhibitor is emailed', () => {
  beforeEach(() => sent.mockClear());

  it('an exhibitor on Remi gets their confirmation, saying how it was paid', async () => {
    const { caller, show, showClass, breed } = await showWithClass();
    const exhibitor = await makeUser({ email: 'postal.exhibitor@test.local' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const result = await caller.secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [showClass.id],
      exhibitorEmail: exhibitor.email,
      paymentMethod: 'postal',
    });

    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledWith(result.orderId, { recordedBy: 'secretary', paymentMethod: 'postal' });
    expect(result.confirmationEmailedTo).toBe('postal.exhibitor@test.local');
  });

  it('the email typed in any case still finds the account', async () => {
    const { caller, show, showClass, breed } = await showWithClass();
    const exhibitor = await makeUser({ email: 'mixed.case@test.local' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

    const result = await caller.secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [showClass.id],
      exhibitorEmail: 'Mixed.Case@Test.local',
      paymentMethod: 'cash',
    });

    expect(sent).toHaveBeenCalledWith(result.orderId, { recordedBy: 'secretary', paymentMethod: 'cash' });
    expect(result.exhibitorId).toBe(exhibitor.id);
  });

  it('an email with no Remi account: nothing is sent (it would reach the secretary), and the dialog is told', async () => {
    const { secretary, caller, show, showClass, breed } = await showWithClass();
    const dog = await makeDog({ ownerId: secretary.id, breedId: breed.id });

    const result = await caller.secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [showClass.id],
      exhibitorEmail: 'not.on.remi@test.local',
      paymentMethod: 'bank_transfer',
    });

    expect(result.id).toBeTruthy(); // the entry is still saved
    expect(result.exhibitorId).toBe(secretary.id); // long-standing: filed under the secretary
    expect(sent).not.toHaveBeenCalled();
    expect(result.confirmationEmailedTo).toBeNull();
  });

  it("the secretary's own email (her own dog) is an account like any other — she gets the receipt", async () => {
    const { secretary, caller, show, showClass, breed } = await showWithClass();
    const dog = await makeDog({ ownerId: secretary.id, breedId: breed.id });

    const result = await caller.secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [showClass.id],
      exhibitorEmail: secretary.email,
      paymentMethod: 'online',
    });

    expect(sent).toHaveBeenCalledWith(result.orderId, { recordedBy: 'secretary', paymentMethod: 'online' });
    expect(result.confirmationEmailedTo).toBe(secretary.email);
  });
});
