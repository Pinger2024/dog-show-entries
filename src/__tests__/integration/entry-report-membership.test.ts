import { describe, it, expect } from 'vitest';
import { membershipClaimLabel } from '@/lib/report-rows';
import { showDiscountGroups } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeDog,
  makeEntry,
  makeOrder,
  makeUser,
} from '../helpers/factories';

// Mandy 2026-08-10: secretaries could never see which membership option an
// exhibitor claimed at checkout (regional Club member vs League member, or an
// RKC discount group), so member-rate claims were unverifiable. The Entry
// Report must expose what was claimed — the option, the number given, and
// the discount group label.
describe('secretary.getEntryReport membership visibility', () => {
  it('exposes claimed membership option, number and discount group per entry', async () => {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });

    const [group] = await testDb
      .insert(showDiscountGroups)
      .values({ showId: show.id, label: 'Members', firstEntryFeePence: 400 })
      .returning();

    const regionalOrder = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'paid',
      regionalMembership: 'League member',
      regionalMembershipNumber: 'LM-77',
    });
    const groupOrder = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'paid',
      discountGroupId: group.id,
    });
    const plainOrder = await makeOrder({
      showId: show.id,
      exhibitorId: exhibitor.id,
      status: 'paid',
    });

    for (const order of [regionalOrder, groupOrder, plainOrder]) {
      const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
      await makeEntry({
        showId: show.id,
        dogId: dog.id,
        exhibitorId: exhibitor.id,
        orderId: order.id,
        status: 'confirmed',
      });
    }

    const report = await createTestCaller(secretary).secretary.getEntryReport({
      showId: show.id,
    });
    expect(report).toHaveLength(3);
    const byOrder = (id: string) => report.find((r) => r.orderId === id);

    const regional = byOrder(regionalOrder.id);
    expect(regional?.order?.regionalMembership).toBe('League member');
    expect(regional?.order?.regionalMembershipNumber).toBe('LM-77');

    const grouped = byOrder(groupOrder.id);
    expect(grouped?.order?.discountGroup?.label).toBe('Members');

    const plain = byOrder(plainOrder.id);
    expect(plain?.order?.regionalMembership ?? null).toBeNull();
    expect(plain?.order?.discountGroup ?? null).toBeNull();

    // The exact cell the Entry Report CSV prints, via the shared helper.
    expect(membershipClaimLabel(regional?.order)).toBe('League member (LM-77)');
    expect(membershipClaimLabel(grouped?.order)).toBe('Members');
    expect(membershipClaimLabel(plain?.order)).toBe('');
  });
});

describe('membershipClaimLabel', () => {
  it('formats each claim shape', () => {
    expect(
      membershipClaimLabel({ regionalMembership: 'Club member', regionalMembershipNumber: null, discountGroup: null }),
    ).toBe('Club member');
    expect(
      membershipClaimLabel({ regionalMembership: 'Club member', regionalMembershipNumber: '42', discountGroup: null }),
    ).toBe('Club member (42)');
    // A regional claim wins over a discount group if both are ever set.
    expect(
      membershipClaimLabel({ regionalMembership: 'League member', regionalMembershipNumber: null, discountGroup: { label: 'Members' } }),
    ).toBe('League member');
    expect(membershipClaimLabel({ regionalMembership: null, regionalMembershipNumber: null, discountGroup: { label: 'Pensioners' } })).toBe('Pensioners');
    expect(membershipClaimLabel(null)).toBe('');
    expect(membershipClaimLabel(undefined)).toBe('');
  });
});
