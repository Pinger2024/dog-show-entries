import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { dogs, entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeMembership,
  makeDog,
  makeShow,
  makeEntry,
} from '../helpers/factories';

/**
 * dev.listUsers — the admin Users page.
 *
 * Michael 2026-09-11: "would be good if this page showed more details so I
 * know who is part of Midland Regional GSD Group". Club membership is the
 * thing that matters, because an ACTIVE membership is what verifyOrgAccess
 * gates a secretary's show access on — and several clubs on both prod and
 * demo have near-identical names.
 */

const adminCaller = async () => createTestCaller(await makeUser({ role: 'admin' }));

describe('dev.listUsers', () => {
  it('lists each user with the clubs they belong to', async () => {
    const caller = await adminCaller();
    const club = await makeOrg({ name: 'Midland Regional GSD Group' });
    const member = await makeUser({ role: 'secretary' });
    await makeMembership({ userId: member.id, organisationId: club.id });

    const rows = await caller.dev.listUsers();
    const row = rows.find((r) => r.id === member.id);

    expect(row?.clubs).toEqual([
      { id: club.id, name: 'Midland Regional GSD Group', status: 'active' },
    ]);
  });

  it('reports a non-active membership with its status rather than hiding it', async () => {
    const caller = await adminCaller();
    const club = await makeOrg({ name: 'Pending Club' });
    const member = await makeUser({});
    await makeMembership({ userId: member.id, organisationId: club.id, status: 'pending' });

    const rows = await caller.dev.listUsers();
    const row = rows.find((r) => r.id === member.id);

    // "pending" looks like access until you try to use it — verifyOrgAccess
    // requires status 'active', so the page must not present the two alike.
    expect(row?.clubs).toEqual([
      { id: club.id, name: 'Pending Club', status: 'pending' },
    ]);
  });

  it('lists every club for a user in more than one', async () => {
    const caller = await adminCaller();
    const a = await makeOrg({ name: 'Aardvark Club' });
    const b = await makeOrg({ name: 'Beagle Club' });
    const member = await makeUser({});
    await makeMembership({ userId: member.id, organisationId: a.id });
    await makeMembership({ userId: member.id, organisationId: b.id });

    const rows = await caller.dev.listUsers();
    const row = rows.find((r) => r.id === member.id);

    expect(row?.clubs.map((c) => c.name).sort()).toEqual(['Aardvark Club', 'Beagle Club']);
  });

  it('gives an empty club list for someone in no club', async () => {
    const caller = await adminCaller();
    const loner = await makeUser({});

    const rows = await caller.dev.listUsers();
    expect(rows.find((r) => r.id === loner.id)?.clubs).toEqual([]);
  });

  // The trap this query is built to avoid: joining BOTH entries and dogs off
  // users multiplies the two together, so 3 dogs × 4 entries reads as 12 of
  // each. Correlated subqueries keep them independent.
  it('counts dogs and entries independently, not multiplied together', async () => {
    const caller = await adminCaller();
    const org = await makeOrg({});
    const show = await makeShow({ organisationId: org.id });
    const exhibitor = await makeUser({});

    const d1 = await makeDog({ ownerId: exhibitor.id });
    const d2 = await makeDog({ ownerId: exhibitor.id });
    await makeDog({ ownerId: exhibitor.id });

    await makeEntry({ showId: show.id, dogId: d1.id, exhibitorId: exhibitor.id });
    await makeEntry({ showId: show.id, dogId: d2.id, exhibitorId: exhibitor.id });

    const rows = await caller.dev.listUsers();
    const row = rows.find((r) => r.id === exhibitor.id);

    expect(row?.dogCount).toBe(3);
    expect(row?.entryCount).toBe(2);
  });

  it('excludes soft-deleted dogs and entries from the counts', async () => {
    const caller = await adminCaller();
    const org = await makeOrg({});
    const show = await makeShow({ organisationId: org.id });
    const exhibitor = await makeUser({});

    const kept = await makeDog({ ownerId: exhibitor.id });
    const binned = await makeDog({ ownerId: exhibitor.id });
    const keptEntry = await makeEntry({ showId: show.id, dogId: kept.id, exhibitorId: exhibitor.id });
    const binnedEntry = await makeEntry({ showId: show.id, dogId: binned.id, exhibitorId: exhibitor.id });

    await testDb.update(dogs).set({ deletedAt: new Date() }).where(eq(dogs.id, binned.id));
    await testDb.update(entries).set({ deletedAt: new Date() }).where(eq(entries.id, binnedEntry.id));

    const rows = await caller.dev.listUsers();
    const row = rows.find((r) => r.id === exhibitor.id);

    expect(row?.dogCount).toBe(1);
    expect(row?.entryCount).toBe(1);
    expect(keptEntry.id).toBeTruthy();
  });

  it('refuses a non-admin', async () => {
    const caller = await createTestCaller(await makeUser({ role: 'secretary' }));
    await expect(caller.dev.listUsers()).rejects.toThrow();
  });
});
