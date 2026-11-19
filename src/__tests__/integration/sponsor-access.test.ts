import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { sponsors, showSponsors } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeShow,
  makeShowClass,
  makeSponsor,
} from '../helpers/factories';

// Regression guard for the cross-org sponsor IDOR (bug-hunt #7 + #18).
// Every sponsor / show-sponsor / class-sponsor mutation must be scoped to an
// org/show the caller belongs to. These tests assert a secretary of club A
// cannot read or tamper with club B's sponsor data, while club B's own
// secretary still can.
describe('sponsor access control (cross-org IDOR)', () => {
  it('listSponsors rejects reading another org directory, but the owner can read theirs', async () => {
    const { user: secA } = await makeSecretaryWithOrg();
    const { user: secB, org: orgB } = await makeSecretaryWithOrg();
    await makeSponsor({ organisationId: orgB.id, contactEmail: 'contact@clubb.test' });

    await expect(
      createTestCaller(secA).secretary.listSponsors({ organisationId: orgB.id })
    ).rejects.toThrow(/access to this organisation/i);

    const owned = await createTestCaller(secB).secretary.listSponsors({ organisationId: orgB.id });
    expect(owned.length).toBe(1);
  });

  it('updateSponsor rejects editing another org sponsor', async () => {
    const { user: secA } = await makeSecretaryWithOrg();
    const { org: orgB } = await makeSecretaryWithOrg();
    const sponsor = await makeSponsor({ organisationId: orgB.id, name: 'Club B Sponsor' });

    await expect(
      createTestCaller(secA).secretary.updateSponsor({ id: sponsor.id, name: 'Hijacked' })
    ).rejects.toThrow(/access to this organisation/i);

    const after = await testDb.query.sponsors.findFirst({ where: eq(sponsors.id, sponsor.id) });
    expect(after?.name).toBe('Club B Sponsor');
  });

  it('deleteSponsor rejects soft-deleting another org sponsor', async () => {
    const { user: secA } = await makeSecretaryWithOrg();
    const { org: orgB } = await makeSecretaryWithOrg();
    const sponsor = await makeSponsor({ organisationId: orgB.id });

    await expect(
      createTestCaller(secA).secretary.deleteSponsor({ id: sponsor.id })
    ).rejects.toThrow(/access to this organisation/i);

    const after = await testDb.query.sponsors.findFirst({ where: eq(sponsors.id, sponsor.id) });
    expect(after?.deletedAt).toBeNull();
  });

  it('assignShowSponsor rejects attaching a sponsor that belongs to a different org', async () => {
    const { user: secB, org: orgB } = await makeSecretaryWithOrg();
    const { org: orgA } = await makeSecretaryWithOrg();
    const showB = await makeShow({ organisationId: orgB.id });
    const foreignSponsor = await makeSponsor({ organisationId: orgA.id });

    await expect(
      createTestCaller(secB).secretary.assignShowSponsor({
        showId: showB.id,
        sponsorId: foreignSponsor.id,
        tier: 'show',
      })
    ).rejects.toThrow(/not found/i);
  });

  it('updateShowSponsor rejects editing a show sponsor on another org show', async () => {
    const { user: secA } = await makeSecretaryWithOrg();
    const { org: orgB } = await makeSecretaryWithOrg();
    const showB = await makeShow({ organisationId: orgB.id });
    const sponsorB = await makeSponsor({ organisationId: orgB.id });
    const [ss] = await testDb
      .insert(showSponsors)
      .values({ showId: showB.id, sponsorId: sponsorB.id, tier: 'show', displayOrder: 0 })
      .returning();

    await expect(
      createTestCaller(secA).secretary.updateShowSponsor({ id: ss!.id, displayOrder: 99 })
    ).rejects.toThrow(/access to this show/i);
  });

  it('assignClassSponsorship rejects sponsoring a class on another org show', async () => {
    const { user: secA } = await makeSecretaryWithOrg();
    const { org: orgB } = await makeSecretaryWithOrg();
    const showB = await makeShow({ organisationId: orgB.id });
    const classB = await makeShowClass({ showId: showB.id });
    const sponsorB = await makeSponsor({ organisationId: orgB.id });
    const [ss] = await testDb
      .insert(showSponsors)
      .values({ showId: showB.id, sponsorId: sponsorB.id, tier: 'class', displayOrder: 0 })
      .returning();

    await expect(
      createTestCaller(secA).secretary.assignClassSponsorship({
        showClassId: classB.id,
        showSponsorId: ss!.id,
      })
    ).rejects.toThrow(/access to this show/i);
  });
});
