/**
 * Bug-hunt #10: deleting a discount group nulls orders.discountGroupId (FK
 * onDelete: set null), so a member's later class REMOVAL re-prices at the
 * standard rate and looks like an upgrade demanding new payment. Guard: a group
 * referenced by existing orders cannot be deleted, so its pricing survives edits.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { showDiscountGroups } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeSecretaryWithOrg,
} from '../helpers/factories';

describe('discount group deletion safety (bug-hunt #10)', () => {
  it('refuses to delete a group that existing orders were priced under', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: 2000,
      subsequentEntryFee: 1000,
    });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 2000 });
    const secCaller = createTestCaller(secretary);
    const group = await secCaller.secretary.createDiscountGroup({
      showId: show.id,
      label: 'Members',
      firstEntryFeePence: 1700,
    });

    // A member enters under the group.
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      discountGroupId: group.id,
    });

    // Deletion is refused; the group survives so the member's pricing does too.
    await expect(
      secCaller.secretary.deleteDiscountGroup({ id: group.id })
    ).rejects.toThrow(/used by existing entries/i);
    const stillThere = await testDb.query.showDiscountGroups.findFirst({
      where: eq(showDiscountGroups.id, group.id),
    });
    expect(stillThere).toBeTruthy();
  });

  it('still allows deleting an unused discount group', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: 2000,
    });
    const secCaller = createTestCaller(secretary);
    const group = await secCaller.secretary.createDiscountGroup({
      showId: show.id,
      label: 'Unused',
      firstEntryFeePence: 1700,
    });

    await secCaller.secretary.deleteDiscountGroup({ id: group.id });
    const gone = await testDb.query.showDiscountGroups.findFirst({
      where: eq(showDiscountGroups.id, group.id),
    });
    expect(gone).toBeFalsy();
  });
});
