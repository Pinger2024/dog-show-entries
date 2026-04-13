import { describe, it, expect } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import { entries, dogs } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeDog,
  makeEntry,
  makeBacklogItem,
} from '../helpers/factories';

describe('backlog router (admin internal)', () => {
  it('list returns rows in featureNumber descending order', async () => {
    const admin = await makeUser({ role: 'admin' });
    await makeBacklogItem({ featureNumber: 100, title: 'A' });
    await makeBacklogItem({ featureNumber: 200, title: 'B' });
    const list = await createTestCaller(admin).backlog.list({});
    expect(list[0]?.title).toBe('B');
    expect(list[1]?.title).toBe('A');
  });

  it('list filters by status', async () => {
    const admin = await makeUser({ role: 'admin' });
    await makeBacklogItem({ status: 'planned' });
    await makeBacklogItem({ status: 'completed' });
    const planned = await createTestCaller(admin).backlog.list({ status: 'planned' });
    expect(planned).toHaveLength(1);
  });

  it('rejects non-admin callers (procedure-level role check)', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    await expect(createTestCaller(exhibitor).backlog.list({}))
      .rejects.toThrow(/Admin access required/);
  });

  it('updates status / notes / response with NOT_FOUND on unknown id', async () => {
    const admin = await makeUser({ role: 'admin' });
    const item = await makeBacklogItem({ status: 'awaiting_feedback' });
    const caller = createTestCaller(admin);

    const statusUpd = await caller.backlog.updateStatus({ id: item.id, status: 'completed' });
    expect(statusUpd.status).toBe('completed');

    const notesUpd = await caller.backlog.updateNotes({ id: item.id, notes: 'Done.' });
    expect(notesUpd.notes).toBe('Done.');

    const respUpd = await caller.backlog.updateResponse({ id: item.id, latestResponse: 'Reply' });
    expect(respUpd.latestResponse).toBe('Reply');

    await expect(
      caller.backlog.updateStatus({
        id: '00000000-0000-0000-0000-000000000000', status: 'completed',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('counts returns per-status totals (zero-filled)', async () => {
    const admin = await makeUser({ role: 'admin' });
    await makeBacklogItem({ status: 'planned' });
    await makeBacklogItem({ status: 'planned' });
    await makeBacklogItem({ status: 'completed' });
    const counts = await createTestCaller(admin).backlog.counts();
    expect(counts.planned).toBe(2);
    expect(counts.completed).toBe(1);
    expect(counts.awaiting_feedback).toBe(0); // zero-filled
  });

  it('get returns a single item or NOT_FOUND', async () => {
    const admin = await makeUser({ role: 'admin' });
    const item = await makeBacklogItem();
    const got = await createTestCaller(admin).backlog.get({ id: item.id });
    expect(got.id).toBe(item.id);
    await expect(
      createTestCaller(admin).backlog.get({
        id: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('soft-delete consistency sweep', () => {
  it('entries.list excludes rows with deletedAt set', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const live = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id });
    const dead = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id });
    await testDb.update(entries).set({ deletedAt: new Date() }).where(eq(entries.id, dead.id));

    const list = await createTestCaller(exhibitor).entries.list({});
    expect(list.items.map((e) => e.id)).toEqual([live.id]);
  });

  it('dogs.list excludes soft-deleted dogs', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const live = await makeDog({ ownerId: owner.id, registeredName: 'Live' });
    const dead = await makeDog({ ownerId: owner.id, registeredName: 'Dead' });
    await testDb.update(dogs).set({ deletedAt: new Date() }).where(eq(dogs.id, dead.id));
    const list = await createTestCaller(owner).dogs.list();
    expect(list.map((d) => d.id)).toEqual([live.id]);
  });

  it('dogs.getById returns NOT_FOUND for soft-deleted dogs', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    await testDb.update(dogs).set({ deletedAt: new Date() }).where(eq(dogs.id, dog.id));
    await expect(
      createTestCaller(owner).dogs.getById({ id: dog.id }),
    ).rejects.toThrow(/Dog not found/);
  });

  it('orders.checkout cleans up stale pending entries from the same user (soft-delete sweep)', async () => {
    // Reproduce: an exhibitor abandoned a checkout (entry pending, no payment).
    // The next successful checkout should soft-delete the stale entry.
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, status: 'entries_open',
    });
    const stale = await makeEntry({
      showId: show.id, dogId: (await makeDog({ ownerId: exhibitor.id, breedId: breed.id })).id,
      exhibitorId: exhibitor.id, status: 'pending',
    });
    // Hand-link the stale entry to a stale order
    const { makeOrder, makeShowClass } = await import('../helpers/factories');
    const staleOrder = await makeOrder({
      showId: show.id, exhibitorId: exhibitor.id, status: 'pending_payment',
    });
    await testDb.update(entries).set({ orderId: staleOrder.id }).where(eq(entries.id, stale.id));

    // New checkout call with a fresh dog
    const dog2 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog2.id, classIds: [showClass.id], isNfc: false }],
    });

    // The stale entry should be soft-deleted + cancelled
    const refreshed = await testDb.query.entries.findFirst({ where: eq(entries.id, stale.id) });
    expect(refreshed?.deletedAt).not.toBeNull();
    expect(refreshed?.status).toBe('cancelled');
  });

  it('soft-deleted entries do not leak into entries.getForShow (secretary view)', async () => {
    const { user: secretary, org } = await import('../helpers/factories').then((f) => f.makeSecretaryWithOrg());
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const live = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed',
    });
    const dead = await makeEntry({
      showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed',
    });
    await testDb.update(entries).set({ deletedAt: new Date() }).where(eq(entries.id, dead.id));

    const data = await createTestCaller(secretary).entries.getForShow({ showId: show.id });
    expect(data.items.map((e) => e.id)).toEqual([live.id]);
  });
});

void isNull;
