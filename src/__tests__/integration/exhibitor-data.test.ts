import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { dogs, entries, users, dogOwners } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
} from '../helpers/factories';

describe('dogs.create', () => {
  it('creates a dog owned by the caller and a default primary owner row', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor', name: 'Jane Owner', address: '1 High St' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);

    const dog = await caller.dogs.create({
      registeredName: 'Rocky Of Hill',
      breedId: breed.id,
      sex: 'dog',
      dateOfBirth: '2024-01-01',
    });

    expect(dog?.ownerId).toBe(exhibitor.id);
    expect(dog?.registeredName).toBe('Rocky Of Hill');

    const owners = await testDb.query.dogOwners.findMany({ where: eq(dogOwners.dogId, dog!.id) });
    expect(owners).toHaveLength(1);
    expect(owners[0]?.isPrimary).toBe(true);
    expect(owners[0]?.ownerName).toBe('Jane Owner');
  });

  it('accepts explicit owners and stores them in order with primary set', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);

    const dog = await caller.dogs.create({
      registeredName: 'Co-Owned Dog',
      breedId: breed.id,
      sex: 'bitch',
      dateOfBirth: '2024-01-01',
      owners: [
        { ownerName: 'A First', ownerAddress: '1 St', ownerEmail: 'a@test.com', isPrimary: true },
        { ownerName: 'B Second', ownerAddress: '2 St', ownerEmail: 'b@test.com', isPrimary: false },
      ],
    });

    const owners = await testDb.query.dogOwners.findMany({
      where: eq(dogOwners.dogId, dog!.id),
      orderBy: (o, { asc }) => [asc(o.sortOrder)],
    });
    expect(owners).toHaveLength(2);
    expect(owners[0]?.ownerName).toBe('A First');
    expect(owners[0]?.userId).toBe(exhibitor.id);
    expect(owners[1]?.ownerName).toBe('B Second');
    expect(owners[1]?.userId).toBeNull();
  });
});

describe('dogs.update', () => {
  it('updates fields on an owned dog', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, registeredName: 'Old Name' });
    const caller = createTestCaller(exhibitor);

    const updated = await caller.dogs.update({ id: dog.id, registeredName: 'New Name' });
    expect(updated.registeredName).toBe('New Name');
  });

  it('rejects update of a dog owned by someone else', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const intruder = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const caller = createTestCaller(intruder);

    await expect(caller.dogs.update({ id: dog.id, registeredName: 'Hijacked' }))
      .rejects.toThrow(/do not own this dog/);
  });

  it('returns NOT_FOUND for a soft-deleted dog', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    await testDb.update(dogs).set({ deletedAt: new Date() }).where(eq(dogs.id, dog.id));
    const caller = createTestCaller(exhibitor);

    await expect(caller.dogs.update({ id: dog.id, registeredName: 'Nope' }))
      .rejects.toThrow(/Dog not found/);
  });
});

describe('dogs.list', () => {
  it('returns only dogs the caller owns', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const other = await makeUser({ role: 'exhibitor' });
    await Promise.all([
      makeDog({ ownerId: exhibitor.id }),
      makeDog({ ownerId: exhibitor.id }),
      makeDog({ ownerId: other.id }),
    ]);
    const caller = createTestCaller(exhibitor);
    const list = await caller.dogs.list();
    expect(list).toHaveLength(2);
    expect(list.every((d) => d.ownerId === exhibitor.id)).toBe(true);
  });

  it('excludes soft-deleted dogs', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const live = await makeDog({ ownerId: exhibitor.id });
    const gone = await makeDog({ ownerId: exhibitor.id });
    await testDb.update(dogs).set({ deletedAt: new Date() }).where(eq(dogs.id, gone.id));
    const caller = createTestCaller(exhibitor);
    const list = await caller.dogs.list();
    expect(list.map((d) => d.id)).toEqual([live.id]);
  });
});

describe('dogs.getById', () => {
  it('returns a dog owned by the caller', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    const caller = createTestCaller(exhibitor);
    const fetched = await caller.dogs.getById({ id: dog.id });
    expect(fetched.id).toBe(dog.id);
  });

  it('rejects fetching a dog owned by someone else', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const intruder = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const caller = createTestCaller(intruder);
    await expect(caller.dogs.getById({ id: dog.id }))
      .rejects.toThrow(/do not own this dog/);
  });
});

async function entryFixture(opts: { entryStatus?: 'pending' | 'confirmed' | 'withdrawn' } = {}) {
  const [exhibitor, org, breed] = await Promise.all([
    makeUser({ role: 'exhibitor' }),
    makeOrg(),
    makeBreed(),
  ]);
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
  });
  const [showClass, dog] = await Promise.all([
    makeShowClass({ showId: show.id, breedId: breed.id }),
    makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
  ]);
  const entry = await makeEntry({
    showId: show.id,
    dogId: dog.id,
    exhibitorId: exhibitor.id,
    status: opts.entryStatus ?? 'confirmed',
  });
  await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  return { exhibitor, org, breed, show, showClass, dog, entry };
}

describe('entries.list', () => {
  it('returns the caller\'s entries with show + dog + classes embedded', async () => {
    const { exhibitor, entry } = await entryFixture();
    const list = await createTestCaller(exhibitor).entries.list({});
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe(entry.id);
    expect(list.total).toBe(1);
  });

  it('filters by dogId', async () => {
    const { exhibitor, dog, show, breed } = await entryFixture();
    const dog2 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    await makeEntry({
      showId: show.id,
      dogId: dog2.id,
      exhibitorId: exhibitor.id,
      status: 'confirmed',
    });

    const all = await createTestCaller(exhibitor).entries.list({});
    expect(all.total).toBe(2);
    const filtered = await createTestCaller(exhibitor).entries.list({ dogId: dog.id });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.dogId).toBe(dog.id);
  });

  it('does not return entries belonging to other exhibitors', async () => {
    await entryFixture(); // entry exists under another exhibitor
    const stranger = await makeUser({ role: 'exhibitor' });
    const list = await createTestCaller(stranger).entries.list({});
    expect(list.items).toHaveLength(0);
  });

  it('excludes soft-deleted entries', async () => {
    const { exhibitor, entry } = await entryFixture();
    await testDb.update(entries).set({ deletedAt: new Date() }).where(eq(entries.id, entry.id));
    const list = await createTestCaller(exhibitor).entries.list({});
    expect(list.items).toHaveLength(0);
  });
});

describe('entries.getById', () => {
  it('returns the caller\'s own entry', async () => {
    const { exhibitor, entry } = await entryFixture();
    const fetched = await createTestCaller(exhibitor).entries.getById({ id: entry.id });
    expect(fetched.id).toBe(entry.id);
  });

  it('rejects another exhibitor reading it', async () => {
    const { entry } = await entryFixture();
    const stranger = await makeUser({ role: 'exhibitor' });
    await expect(createTestCaller(stranger).entries.getById({ id: entry.id }))
      .rejects.toThrow(/do not have access/);
  });

  it('lets a secretary read any entry', async () => {
    const { entry } = await entryFixture();
    const secretary = await makeUser({ role: 'secretary' });
    const fetched = await createTestCaller(secretary).entries.getById({ id: entry.id });
    expect(fetched.id).toBe(entry.id);
  });

  it('lets an admin read any entry', async () => {
    const { entry } = await entryFixture();
    const admin = await makeUser({ role: 'admin' });
    const fetched = await createTestCaller(admin).entries.getById({ id: entry.id });
    expect(fetched.id).toBe(entry.id);
  });
});

describe('entries.withdraw', () => {
  it('flips an entry to withdrawn', async () => {
    const { exhibitor, entry } = await entryFixture();
    const updated = await createTestCaller(exhibitor).entries.withdraw({ id: entry.id });
    expect(updated.status).toBe('withdrawn');
  });

  it('rejects withdrawing an entry the caller does not own', async () => {
    const { entry } = await entryFixture();
    const stranger = await makeUser({ role: 'exhibitor' });
    await expect(createTestCaller(stranger).entries.withdraw({ id: entry.id }))
      .rejects.toThrow(/do not own this entry/);
  });

  it('rejects double-withdrawal', async () => {
    const { exhibitor, entry } = await entryFixture();
    await createTestCaller(exhibitor).entries.withdraw({ id: entry.id });
    await expect(createTestCaller(exhibitor).entries.withdraw({ id: entry.id }))
      .rejects.toThrow(/already withdrawn/);
  });
});

describe('entries.validateExhibitorForEntry', () => {
  it('flags missing name and address as issues', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor', name: '', address: null });
    const result = await createTestCaller(exhibitor).entries.validateExhibitorForEntry();
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('returns valid for a complete profile', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor', name: 'Full Name', address: '1 Full St' });
    const result = await createTestCaller(exhibitor).entries.validateExhibitorForEntry();
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('auto-fills missing fields from the primary dog-owner record (and saves them back)', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor', name: '', address: null, phone: null });
    const dog = await makeDog({ ownerId: exhibitor.id });
    // Primary dogOwner with the data we want backfilled
    await testDb.insert(dogOwners).values({
      dogId: dog.id,
      userId: exhibitor.id,
      ownerName: 'Backfilled Name',
      ownerAddress: '99 Backfill Rd',
      ownerEmail: exhibitor.email,
      ownerPhone: '07700000000',
      isPrimary: true,
      sortOrder: 0,
    });

    const result = await createTestCaller(exhibitor).entries.validateExhibitorForEntry();
    expect(result.valid).toBe(true);
    expect(result.user.name).toBe('Backfilled Name');
    expect(result.user.address).toBe('99 Backfill Rd');

    // The user row itself should now be updated.
    const refreshed = await testDb.query.users.findFirst({ where: eq(users.id, exhibitor.id) });
    expect(refreshed?.name).toBe('Backfilled Name');
    expect(refreshed?.address).toBe('99 Backfill Rd');
  });
});
