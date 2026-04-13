import { describe, it, expect } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { shows, showClasses, organisations, venues, rings } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeClassDef,
  makeSecretaryWithOrg,
  makeSecretaryWithOrgAndBreed,
  makeShow,
} from '../helpers/factories';

describe('shows.create', () => {
  it('creates a draft show with a slug derived from name + start date', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const caller = createTestCaller(user);

    const created = await caller.shows.create({
      name: 'Test Open Show',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-06-01',
      endDate: '2030-06-01',
    });

    expect(created.id).toBeTruthy();
    expect(created.slug).toMatch(/test-open-show/);
    expect(created.status).toBe('draft');

    const dbShow = await testDb.query.shows.findFirst({ where: eq(shows.id, created.id) });
    expect(dbShow?.organisationId).toBe(org.id);
    expect(dbShow?.breedId).toBe(breed.id);
  });

  it('seeds show classes from classDefinitionIds in canonical order (combined sex)', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    // Insert class defs out of canonical order to prove the procedure sorts them.
    const [veteran, puppy, open] = await Promise.all([
      makeClassDef({ name: 'Veteran', type: 'age', sortOrder: 99 }),
      makeClassDef({ name: 'Puppy', type: 'age', sortOrder: 1 }),
      makeClassDef({ name: 'Open', type: 'achievement', sortOrder: 50 }),
    ]);
    const caller = createTestCaller(user);

    const created = await caller.shows.create({
      name: 'Classes Show',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-06-01',
      endDate: '2030-06-01',
      classDefinitionIds: [open.id, veteran.id, puppy.id],
      entryFee: 800,
    });

    const cls = await testDb.query.showClasses.findMany({
      where: eq(showClasses.showId, created.id),
      orderBy: [asc(showClasses.sortOrder)],
    });
    expect(cls).toHaveLength(3);
    expect(cls.map((c) => c.classDefinitionId)).toEqual([puppy.id, open.id, veteran.id]);
    expect(cls.every((c) => c.entryFee === 800)).toBe(true);
    expect(cls.every((c) => c.sex === null)).toBe(true);
  });

  it('separate_sex splits classes into dog+bitch but keeps junior_handler single', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const [puppy, jh] = await Promise.all([
      makeClassDef({ name: 'Puppy', type: 'age', sortOrder: 1 }),
      makeClassDef({ name: 'JH 12-17', type: 'junior_handler', sortOrder: 1 }),
    ]);
    const caller = createTestCaller(user);

    const created = await caller.shows.create({
      name: 'Sex Split Show',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-06-01',
      endDate: '2030-06-01',
      classSexArrangement: 'separate_sex',
      classDefinitionIds: [puppy.id, jh.id],
      entryFee: 500,
    });

    const cls = await testDb.query.showClasses.findMany({
      where: eq(showClasses.showId, created.id),
    });
    // Expect 3 rows: Puppy(dog), Puppy(bitch), JH (no sex)
    expect(cls).toHaveLength(3);
    expect(cls.map((c) => c.sex).sort()).toEqual(['bitch', 'dog', null].sort());
    const jhRows = cls.filter((c) => c.classDefinitionId === jh.id);
    expect(jhRows).toHaveLength(1);
    expect(jhRows[0]?.sex).toBeNull();
  });

  it('appends -2 to the slug when the same name is used twice', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const caller = createTestCaller(user);
    const input = {
      name: 'Annual Bonanza',
      showType: 'open' as const,
      showScope: 'single_breed' as const,
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-06-01',
      endDate: '2030-06-01',
    };

    const first = await caller.shows.create(input);
    // Second show needs an active subscription (subscription gate). Set it.
    await testDb
      .update(organisations)
      .set({ subscriptionStatus: 'active' })
      .where(eq(organisations.id, org.id));
    const second = await caller.shows.create(input);

    expect(first.slug).not.toBe(second.slug);
    expect(second.slug).toMatch(/-2$/);
  });

  it('blocks the second show until subscriptionStatus is active (first show free)', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const caller = createTestCaller(user);
    // Org defaults to subscriptionStatus='none'. First show should succeed…
    await caller.shows.create({
      name: 'Free Show',
      showType: 'open',
      showScope: 'single_breed',
      organisationId: org.id,
      breedId: breed.id,
      startDate: '2030-06-01',
      endDate: '2030-06-01',
    });

    // …second should be FORBIDDEN until subscription is active.
    await expect(
      caller.shows.create({
        name: 'Second Show',
        showType: 'open',
        showScope: 'single_breed',
        organisationId: org.id,
        breedId: breed.id,
        startDate: '2030-07-01',
        endDate: '2030-07-01',
      }),
    ).rejects.toThrow(/subscription/i);
  });

  it('rejects a secretary who is not a member of the target organisation', async () => {
    const intruder = await makeUser({ role: 'secretary' });
    const otherOrg = await makeOrg();
    const breed = await makeBreed();
    const caller = createTestCaller(intruder);

    await expect(
      caller.shows.create({
        name: 'Hostile Takeover',
        showType: 'open',
        showScope: 'single_breed',
        organisationId: otherOrg.id,
        breedId: breed.id,
        startDate: '2030-06-01',
        endDate: '2030-06-01',
      }),
    ).rejects.toThrow(/access to this organisation/);
  });
});

describe('secretary.createVenue', () => {
  it('creates a venue scoped to the organisation', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);

    const venue = await caller.secretary.createVenue({
      name: 'Test Showground',
      organisationId: org.id,
    });

    expect(venue.id).toBeTruthy();
    expect(venue.organisationId).toBe(org.id);
    const dbVenue = await testDb.query.venues.findFirst({ where: eq(venues.id, venue.id) });
    expect(dbVenue?.name).toBe('Test Showground');
  });

  it('rejects creation under an organisation the caller is not a member of', async () => {
    const intruder = await makeUser({ role: 'secretary' });
    const otherOrg = await makeOrg();
    const caller = createTestCaller(intruder);

    await expect(
      caller.secretary.createVenue({ name: 'Sneaky Venue', organisationId: otherOrg.id }),
    ).rejects.toThrow(/access/i);
  });
});

describe('secretary.addRing', () => {
  it("adds a ring to a show in the secretary's org", async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);

    const ring = await caller.secretary.addRing({ showId: show.id, number: 1 });

    expect(ring.showId).toBe(show.id);
    expect(ring.number).toBe(1);
    const dbRings = await testDb.query.rings.findMany({ where: eq(rings.showId, show.id) });
    expect(dbRings).toHaveLength(1);
  });

  it('rejects addRing on a show the caller does not own', async () => {
    const { user: outsider } = await makeSecretaryWithOrg();
    const otherOrg = await makeOrg();
    const show = await makeShow({ organisationId: otherOrg.id });
    const caller = createTestCaller(outsider);

    await expect(
      caller.secretary.addRing({ showId: show.id, number: 1 }),
    ).rejects.toThrow(/access/i);
  });
});
