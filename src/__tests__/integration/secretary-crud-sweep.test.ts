import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  organisationPeople,
  sundryItems,
  sponsors,
  showSponsors,
  classSponsorships,
} from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeOrg,
  makeShow,
  makeShowClass,
  makeSponsor,
  makeUser,
} from '../helpers/factories';

describe('secretary org people CRUD', () => {
  it('creates an org person', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);
    const person = await caller.secretary.createOrgPerson({
      organisationId: org.id,
      name: 'Sue Secretary',
      position: 'Chair',
      isGuarantor: true,
    });
    expect(person?.name).toBe('Sue Secretary');
    expect(person?.isGuarantor).toBe(true);
  });

  it('lists org people sorted by name', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);
    await caller.secretary.createOrgPerson({ organisationId: org.id, name: 'Zara' });
    await caller.secretary.createOrgPerson({ organisationId: org.id, name: 'Anna' });
    const list = await caller.secretary.listOrgPeople({ organisationId: org.id });
    expect(list.map((p) => p.name)).toEqual(['Anna', 'Zara']);
  });

  it('updates an org person', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);
    const person = await caller.secretary.createOrgPerson({
      organisationId: org.id,
      name: 'Mary',
      position: 'Treasurer',
    });
    const updated = await caller.secretary.updateOrgPerson({
      id: person!.id,
      position: 'Vice Chair',
    });
    expect(updated.position).toBe('Vice Chair');
  });

  it('deletes an org person', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);
    const person = await caller.secretary.createOrgPerson({ organisationId: org.id, name: 'X' });
    await caller.secretary.deleteOrgPerson({ id: person!.id });
    const rows = await testDb.query.organisationPeople.findMany({
      where: eq(organisationPeople.id, person!.id),
    });
    expect(rows).toHaveLength(0);
  });

  it('rejects creating org people in another org', async () => {
    const { user } = await makeSecretaryWithOrg();
    const otherOrg = await makeOrg();
    await expect(
      createTestCaller(user).secretary.createOrgPerson({
        organisationId: otherOrg.id, name: 'Hostile',
      }),
    ).rejects.toThrow(/access/i);
  });
});

describe('secretary sundry items', () => {
  it('creates a sundry item with auto sortOrder', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);
    const a = await caller.secretary.createSundryItem({
      showId: show.id, name: 'Programme', priceInPence: 500,
    });
    const b = await caller.secretary.createSundryItem({
      showId: show.id, name: 'Disc', priceInPence: 1000,
    });
    expect(a?.sortOrder).toBe(0);
    expect(b?.sortOrder).toBe(1);
  });

  it('updates a sundry item (price + enabled)', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);
    const item = await caller.secretary.createSundryItem({
      showId: show.id, name: 'Programme', priceInPence: 500,
    });
    const updated = await caller.secretary.updateSundryItem({
      id: item!.id, showId: show.id, priceInPence: 700, enabled: false,
    });
    expect(updated.priceInPence).toBe(700);
    expect(updated.enabled).toBe(false);
  });

  it('rejects sundry creation on a show in another org', async () => {
    const { user } = await makeSecretaryWithOrg();
    const otherOrg = await makeOrg();
    const otherShow = await makeShow({ organisationId: otherOrg.id });
    await expect(
      createTestCaller(user).secretary.createSundryItem({
        showId: otherShow.id, name: 'Sneak', priceInPence: 100,
      }),
    ).rejects.toThrow(/access/i);
  });

  it('returns NOT_FOUND when updating a sundry from the wrong show', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const otherShow = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);
    const item = await caller.secretary.createSundryItem({
      showId: show.id, name: 'Item', priceInPence: 100,
    });
    await expect(
      caller.secretary.updateSundryItem({ id: item!.id, showId: otherShow.id, priceInPence: 200 }),
    ).rejects.toThrow(/Sundry item not found/);
  });
});

describe('secretary sponsor directory CRUD', () => {
  it('creates / lists / updates / deletes a sponsor', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);

    const created = await caller.secretary.createSponsor({
      organisationId: org.id, name: 'Acme Pet Foods', category: 'pet_food',
    });
    expect(created?.name).toBe('Acme Pet Foods');

    const list = await caller.secretary.listSponsors({ organisationId: org.id });
    expect(list).toHaveLength(1);

    const updated = await caller.secretary.updateSponsor({ id: created!.id, name: 'Acme Foods' });
    expect(updated.name).toBe('Acme Foods');

    await caller.secretary.deleteSponsor({ id: created!.id });
    // Soft-delete: row remains but excluded from list
    const after = await caller.secretary.listSponsors({ organisationId: org.id });
    expect(after).toHaveLength(0);
  });
});

describe('secretary show + class sponsorships', () => {
  it('assigns a sponsor to a show, lists it, then removes', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const sponsor = await makeSponsor({ organisationId: org.id });
    const caller = createTestCaller(user);

    const assigned = await caller.secretary.assignShowSponsor({
      showId: show.id, sponsorId: sponsor.id, tier: 'show',
    });
    expect(assigned.sponsorId).toBe(sponsor.id);

    const list = await caller.secretary.listShowSponsors({ showId: show.id });
    expect(list).toHaveLength(1);

    const updated = await caller.secretary.updateShowSponsor({
      id: assigned.id, prizeMoney: 5000,
    });
    expect(updated.prizeMoney).toBe(5000);

    await caller.secretary.removeShowSponsor({ id: assigned.id });
    const after = await caller.secretary.listShowSponsors({ showId: show.id });
    expect(after).toHaveLength(0);
  });

  it('attaches a class sponsorship to a class', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const showClass = await makeShowClass({ showId: show.id });
    const sponsor = await makeSponsor({ organisationId: org.id });
    const caller = createTestCaller(user);
    const showSponsor = await caller.secretary.assignShowSponsor({
      showId: show.id, sponsorId: sponsor.id, tier: 'class',
    });

    const sponsorship = await caller.secretary.assignClassSponsorship({
      showClassId: showClass.id,
      showSponsorId: showSponsor.id,
      trophyName: 'Best Veteran Trophy',
    });
    expect(sponsorship.trophyName).toBe('Best Veteran Trophy');

    await caller.secretary.removeClassSponsorship({ id: sponsorship.id });
    const remaining = await testDb.query.classSponsorships.findMany({
      where: eq(classSponsorships.id, sponsorship.id),
    });
    expect(remaining).toHaveLength(0);
  });

  it('upserts a free-text class sponsor (no directory link)', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const showClass = await makeShowClass({ showId: show.id });
    const caller = createTestCaller(user);

    const created = await caller.secretary.upsertClassSponsor({
      showClassId: showClass.id,
      sponsorName: '  Manual Sponsor  ',
      sponsorAffix: 'Some Affix',
      trophyName: 'Best Pup',
    });
    expect(created?.sponsorName).toBe('Manual Sponsor'); // trimmed
    expect(created?.sponsorAffix).toBe('Some Affix');
  });
});

// Suppress unused-import warnings — schema tables referenced only via factories.
void organisationPeople; void sundryItems; void sponsors; void showSponsors;
void classSponsorships; void makeUser;
