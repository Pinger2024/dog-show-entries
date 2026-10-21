import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestCaller } from '../helpers/context';
import { testDb } from '../helpers/db';
import { entries } from '@/server/db/schema';
import {
  makeSecretaryWithOrg,
  makeUser,
  makeShow,
  makeDog,
  makeBreed,
  makeEntry,
} from '../helpers/factories';

/**
 * Exhibitors ring the secretary after entering to say the RKC paperwork has
 * (or hasn't) come through, so she must be able to set the flags herself.
 * They are per SHOW, so this writes to the entry, never to the dog.
 */
async function seedEntry() {
  const { user: secretary, org } = await makeSecretaryWithOrg();
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const breed = await makeBreed();
  const show = await makeShow({ organisationId: org.id });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
  const entry = await makeEntry({
    showId: show.id,
    dogId: dog.id,
    exhibitorId: exhibitor.id,
  });
  return { secretary, exhibitor, show, entry };
}

describe('secretary.updateEntryRegistrationFlags', () => {
  it('sets the flags on the entry', async () => {
    const { secretary, entry } = await seedEntry();
    const caller = createTestCaller(secretary);

    const result = await caller.secretary.updateEntryRegistrationFlags({
      entryId: entry!.id,
      naf: true,
      taf: true,
      cnaf: false,
    });

    expect(result).toMatchObject({ naf: true, taf: true, cnaf: false });

    const [row] = await testDb.select().from(entries).where(eq(entries.id, entry!.id));
    expect(row?.naf).toBe(true);
    expect(row?.taf).toBe(true);
    expect(row?.cnaf).toBe(false);
  });

  it('clears flags again once the paperwork comes through', async () => {
    const { secretary, entry } = await seedEntry();
    const caller = createTestCaller(secretary);

    await caller.secretary.updateEntryRegistrationFlags({
      entryId: entry!.id,
      naf: true,
      taf: true,
      cnaf: false,
    });
    await caller.secretary.updateEntryRegistrationFlags({
      entryId: entry!.id,
      naf: false,
      taf: false,
      cnaf: false,
    });

    const [row] = await testDb.select().from(entries).where(eq(entries.id, entry!.id));
    expect(row?.naf).toBe(false);
    expect(row?.taf).toBe(false);
  });

  it("refuses a secretary from another club", async () => {
    const { entry } = await seedEntry();
    const { user: otherSecretary } = await makeSecretaryWithOrg();
    const caller = createTestCaller(otherSecretary);

    await expect(
      caller.secretary.updateEntryRegistrationFlags({
        entryId: entry!.id,
        naf: true,
        taf: false,
        cnaf: false,
      })
    ).rejects.toThrow();
  });

  it('defaults to all-false on a new entry', async () => {
    const { entry } = await seedEntry();
    const [row] = await testDb.select().from(entries).where(eq(entries.id, entry!.id));
    expect(row?.naf).toBe(false);
    expect(row?.taf).toBe(false);
    expect(row?.cnaf).toBe(false);
  });
});
