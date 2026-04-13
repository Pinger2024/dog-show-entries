import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries, payments, organisations } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeSecretaryWithOrg,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeUser,
  makePayment,
} from '../helpers/factories';

describe('secretary.assignCatalogueNumbers', () => {
  it('numbers confirmed entries 1..n in class+group+breed+sex+date order', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });

    // Two confirmed entries on the same class — should number 1 and 2
    const ex = await makeUser({ role: 'exhibitor' });
    const dog1 = await makeDog({ ownerId: ex.id, breedId: breed.id, registeredName: 'A Dog' });
    const dog2 = await makeDog({ ownerId: ex.id, breedId: breed.id, registeredName: 'B Dog' });
    const e1 = await makeEntry({ showId: show.id, dogId: dog1.id, exhibitorId: ex.id, status: 'confirmed' });
    const e2 = await makeEntry({ showId: show.id, dogId: dog2.id, exhibitorId: ex.id, status: 'confirmed' });
    await makeEntryClass({ entryId: e1.id, showClassId: showClass.id });
    await makeEntryClass({ entryId: e2.id, showClassId: showClass.id });

    const res = await createTestCaller(user).secretary.assignCatalogueNumbers({
      showId: show.id,
    });
    expect(res.assigned).toBe(2);

    const refreshed = await testDb.query.entries.findMany({
      where: eq(entries.showId, show.id),
    });
    const numbers = refreshed.map((e) => e.catalogueNumber).filter(Boolean).sort();
    expect(numbers).toEqual(['1', '2']);
  });

  it('returns 0 when no confirmed entries exist', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const res = await createTestCaller(user).secretary.assignCatalogueNumbers({
      showId: show.id,
    });
    expect(res.assigned).toBe(0);
  });
});

describe('secretary.updateOrganisation', () => {
  it('updates name + contact + website on the org', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    await createTestCaller(user).secretary.updateOrganisation({
      organisationId: org.id,
      name: 'Renamed Club',
      contactEmail: 'club@test.local',
      contactPhone: '07700123',
      website: 'https://club.test',
      logoUrl: 'https://logo.test/club.png',
    });
    const refreshed = await testDb.query.organisations.findFirst({ where: eq(organisations.id, org.id) });
    expect(refreshed?.name).toBe('Renamed Club');
    expect(refreshed?.contactEmail).toBe('club@test.local');
    expect(refreshed?.website).toBe('https://club.test');
  });

  it('rejects updateOrganisation on a foreign org', async () => {
    const { user } = await makeSecretaryWithOrg();
    const { org: otherOrg } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(user).secretary.updateOrganisation({
        organisationId: otherOrg.id, name: 'Hostile rename',
      }),
    ).rejects.toThrow(/access/i);
  });
});

describe('secretary.issueRefund', () => {
  async function paidEntry() {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const entry = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed',
      totalFee: 1000,
    });
    await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    const originalPayment = await makePayment({
      entryId: entry.id,
      stripePaymentId: 'pi_test_paid',
      amount: 1000,
      status: 'succeeded',
    });
    return { secretary, exhibitor, show, entry, originalPayment };
  }

  it('full refund: marks payment refunded + cancels the entry', async () => {
    const { secretary, entry, originalPayment } = await paidEntry();
    const res = await createTestCaller(secretary).secretary.issueRefund({
      entryId: entry.id, reason: 'Customer requested',
    });
    expect(res.refunded).toBe(true);
    expect(res.amount).toBe(1000);
    expect(res.fullyRefunded).toBe(true);

    const refreshedEntry = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(refreshedEntry?.status).toBe('cancelled');

    // Refund payment row inserted; original marked 'refunded'
    const original = await testDb.query.payments.findFirst({
      where: eq(payments.id, originalPayment.id),
    });
    expect(original?.status).toBe('refunded');
    expect(original?.refundAmount).toBe(1000);
  });

  it('partial refund: marks original payment partially_refunded; entry stays confirmed', async () => {
    const { secretary, entry, originalPayment } = await paidEntry();
    const res = await createTestCaller(secretary).secretary.issueRefund({
      entryId: entry.id, amount: 400,
    });
    expect(res.fullyRefunded).toBe(false);

    const refreshedEntry = await testDb.query.entries.findFirst({ where: eq(entries.id, entry.id) });
    expect(refreshedEntry?.status).toBe('confirmed');

    const original = await testDb.query.payments.findFirst({
      where: eq(payments.id, originalPayment.id),
    });
    expect(original?.status).toBe('partially_refunded');
    expect(original?.refundAmount).toBe(400);
  });

  it('rejects refund > remaining amount', async () => {
    const { secretary, entry } = await paidEntry();
    await expect(
      createTestCaller(secretary).secretary.issueRefund({ entryId: entry.id, amount: 5000 }),
    ).rejects.toThrow(/remaining amount/);
  });

  it('rejects refund without a completed payment', async () => {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const ex = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: ex.id, breedId: breed.id });
    const entry = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: ex.id, status: 'pending', totalFee: 500,
    });
    // No payment row inserted
    await expect(
      createTestCaller(secretary).secretary.issueRefund({ entryId: entry.id }),
    ).rejects.toThrow(/No completed payment/);
  });

  it('rejects refund on a foreign show', async () => {
    const { entry } = await paidEntry();
    const { user: outsider } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(outsider).secretary.issueRefund({ entryId: entry.id }),
    ).rejects.toThrow(/access/i);
  });
});
