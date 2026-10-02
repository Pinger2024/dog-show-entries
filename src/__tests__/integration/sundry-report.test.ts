/**
 * TESTING_MAP #69 — secretary.getSundryItemReport was uncovered. Aggregates
 * sold quantity + revenue per sundry item across PAID orders only, org-scoped.
 */
import { describe, it, expect } from 'vitest';
import { sundryItems as sundryItemsTable, orderSundryItems } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeBreed, makeShow, makeSecretaryWithOrg, makeOrder } from '../helpers/factories';

describe('secretary.getSundryItemReport', () => {
  it('aggregates sold quantity + revenue per item, paid orders only', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress' });
    const exhibitor = await makeUser({ role: 'exhibitor' });

    const [catalogue] = await testDb
      .insert(sundryItemsTable)
      .values({ showId: show.id, name: 'Catalogue', priceInPence: 300, sortOrder: 0, enabled: true })
      .returning();

    // Paid order: 2 catalogues — counts.
    const paid = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 600 });
    await testDb.insert(orderSundryItems).values({ orderId: paid.id, sundryItemId: catalogue!.id, quantity: 2, unitPrice: 300 });

    // Pending order: 5 catalogues — must NOT count.
    const pending = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'pending_payment', totalAmount: 1500 });
    await testDb.insert(orderSundryItems).values({ orderId: pending.id, sundryItemId: catalogue!.id, quantity: 5, unitPrice: 300 });

    const report = await createTestCaller(secretary).secretary.getSundryItemReport({ showId: show.id });
    const row = report.find((r) => r.sundryItemId === catalogue!.id);
    expect(row?.quantitySold).toBe(2);
    expect(row?.totalRevenue).toBe(600);
  });

  it('rejects cross-org access', async () => {
    const { user: secA } = await makeSecretaryWithOrg();
    const { org: orgB } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: orgB.id, status: 'in_progress' });
    await expect(
      createTestCaller(secA).secretary.getSundryItemReport({ showId: show.id })
    ).rejects.toThrow(/access to this show/i);
  });
});
