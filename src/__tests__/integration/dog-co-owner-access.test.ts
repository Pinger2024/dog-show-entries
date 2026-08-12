/**
 * Rafaye Kanto incident, 2026-08-12 (live, real users): the dog's
 * `dogs.owner_id` was one co-owner's account (the "primary"), but a second
 * co-owner was properly linked via a `dog_owners` row with a matching
 * `user_id` on the SAME dog — and every access gate in the app checked
 * `dogs.owner_id` alone, so the linked co-owner got "you do not own this
 * dog" everywhere (entering shows, editing details) and the dog didn't
 * appear in her My Dogs at all.
 *
 * Founders' ruling: a co-owner whose account is linked on the dog gets the
 * SAME day-to-day rights as the account holder (view / edit / enter shows /
 * upload photos). Destructive or account-level actions (delete the dog,
 * transfer `owner_id`) stay with the account holder only.
 *
 * These tests pin that rule at every gate the incident review found, using
 * three actors on one dog throughout:
 *   - `primary`  — the account holder (`dogs.owner_id`)
 *   - `coOwner`  — linked via a `dog_owners` row with `userId` set (Rachel)
 *   - `stranger` — no relationship to the dog at all (must stay refused)
 * Plus a fourth shape: a named joint owner on the dog's `dog_owners` rows
 * whose row has NO `userId` (an address-book entry, not a linked account) —
 * that user must also stay refused.
 */
import { describe, it, expect } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { dogOwners, dogs, entries, orders } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeDog,
  makeOrg,
  makeShow,
  makeShowClass,
  makeClassDef,
} from '../helpers/factories';

const pedigree = { sireName: 'Sire A', damName: 'Dam A', breederName: 'Breeder A', colour: 'Black & Tan' };

/** Link `userId` as a co-owner on `dogId` via a `dog_owners` row — the shape
 *  the Rafaye Kanto incident's manual fix used. Mirrors the row-1 shape the
 *  app itself would create if it had a self-service linking flow. */
async function linkCoOwner(dogId: string, userId: string, name = 'Co-Owner') {
  const [row] = await testDb
    .insert(dogOwners)
    .values({
      dogId,
      userId,
      ownerName: name,
      ownerAddress: '2 Low St',
      ownerEmail: `${name.toLowerCase().replace(/\s+/g, '.')}@test.local`,
      isPrimary: false,
      sortOrder: 1,
    })
    .returning();
  return row;
}

/** A named joint owner on the catalogue — NOT linked to any account. */
async function addUnlinkedOwnerRow(dogId: string, name = 'Paper Only Owner') {
  const [row] = await testDb
    .insert(dogOwners)
    .values({
      dogId,
      userId: null,
      ownerName: name,
      ownerAddress: '3 Nowhere Ln',
      ownerEmail: `${name.toLowerCase().replace(/\s+/g, '.')}@test.local`,
      isPrimary: false,
      sortOrder: 1,
    })
    .returning();
  return row;
}

async function setUp() {
  const primary = await makeUser({ role: 'exhibitor', name: 'Primary Owner' });
  const coOwner = await makeUser({ role: 'exhibitor', name: 'Linked Co-Owner' });
  const stranger = await makeUser({ role: 'exhibitor', name: 'Total Stranger' });
  const breed = await makeBreed();
  const dog = await makeDog({ ownerId: primary.id, breedId: breed.id, ...pedigree });
  await linkCoOwner(dog.id, coOwner.id);
  return { primary, coOwner, stranger, breed, dog };
}

describe('dog co-owner access — Rafaye Kanto incident, 2026-08-12', () => {
  describe('dogs.list — My Dogs', () => {
    it('includes a co-owned dog for the linked co-owner', async () => {
      const { coOwner, dog } = await setUp();
      const list = await createTestCaller(coOwner).dogs.list();
      expect(list.map((d) => d.id)).toContain(dog.id);
    });

    it('does not include the dog for a stranger', async () => {
      const { stranger, dog } = await setUp();
      const list = await createTestCaller(stranger).dogs.list();
      expect(list.map((d) => d.id)).not.toContain(dog.id);
    });
  });

  describe('dogs.getById', () => {
    it('a linked co-owner can fetch the dog', async () => {
      const { coOwner, dog } = await setUp();
      const fetched = await createTestCaller(coOwner).dogs.getById({ id: dog.id });
      expect(fetched.id).toBe(dog.id);
    });

    it('a stranger is refused', async () => {
      const { stranger, dog } = await setUp();
      await expect(createTestCaller(stranger).dogs.getById({ id: dog.id })).rejects.toThrow(/do not own this dog/);
    });

    it('a named joint owner with NO account link is refused', async () => {
      const { primary, breed } = await setUp();
      const paperOwner = await makeUser({ role: 'exhibitor', name: 'Paper Only Owner' });
      const dog = await makeDog({ ownerId: primary.id, breedId: breed.id, ...pedigree });
      await addUnlinkedOwnerRow(dog.id, 'Paper Only Owner');
      // paperOwner's account was never linked (userId stayed null on the row)
      await expect(createTestCaller(paperOwner).dogs.getById({ id: dog.id })).rejects.toThrow(/do not own this dog/);
    });

    it('the primary account holder is unaffected', async () => {
      const { primary, dog } = await setUp();
      const fetched = await createTestCaller(primary).dogs.getById({ id: dog.id });
      expect(fetched.id).toBe(dog.id);
    });
  });

  describe('dogs.update — editing details', () => {
    it('a linked co-owner can edit the dog', async () => {
      const { coOwner, dog } = await setUp();
      const updated = await createTestCaller(coOwner).dogs.update({
        id: dog.id,
        registeredName: 'Renamed By Co-Owner',
      });
      expect(updated.registeredName).toBe('Renamed By Co-Owner');
    });

    it('a stranger is refused and the dog is untouched', async () => {
      const { stranger, dog } = await setUp();
      await expect(
        createTestCaller(stranger).dogs.update({ id: dog.id, registeredName: 'Hijacked' })
      ).rejects.toThrow(/do not own this dog/);
      const row = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
      expect(row?.registeredName).not.toBe('Hijacked');
    });

    it('preserves the co-owner\'s dog_owners.user_id link when the co-owner edits the owners array', async () => {
      // The exact failure mode that would silently re-break this incident:
      // any edit that includes the `owners` array (the Edit Dog form always
      // sends one) used to wipe every non-primary userId to null.
      const { primary, coOwner, dog } = await setUp();
      await createTestCaller(coOwner).dogs.update({
        id: dog.id,
        owners: [
          { ownerName: 'Primary Owner', ownerAddress: '1 High St', ownerEmail: 'primary@test.local', isPrimary: true },
          { ownerName: 'Linked Co-Owner', ownerAddress: '2 Low St', ownerEmail: 'co-owner@test.local', isPrimary: false },
        ],
      });

      const owners = await testDb.query.dogOwners.findMany({
        where: eq(dogOwners.dogId, dog.id),
        orderBy: [asc(dogOwners.sortOrder)],
      });
      expect(owners[0]?.userId).toBe(primary.id);
      expect(owners[1]?.userId).toBe(coOwner.id); // link preserved, not nulled

      // Rachel still has access after her own edit — the regression this
      // guards against would refuse her here.
      await expect(createTestCaller(coOwner).dogs.getById({ id: dog.id })).resolves.toBeDefined();
    });

    it('does not preserve a co-owner link when the caller changes that row\'s email', async () => {
      const { coOwner, dog } = await setUp();
      await createTestCaller(coOwner).dogs.update({
        id: dog.id,
        owners: [
          { ownerName: 'Primary Owner', ownerAddress: '1 High St', ownerEmail: 'primary@test.local', isPrimary: true },
          { ownerName: 'Linked Co-Owner', ownerAddress: '2 Low St', ownerEmail: 'brand-new-email@test.local', isPrimary: false },
        ],
      });
      const owners = await testDb.query.dogOwners.findMany({
        where: eq(dogOwners.dogId, dog.id),
        orderBy: [asc(dogOwners.sortOrder)],
      });
      // Can't confidently match a changed email to the prior link — no
      // duplicate/incorrect userId assignment either.
      expect(owners[1]?.userId).toBeNull();
    });
  });

  describe('dogs.delete — destructive, stays account-holder only', () => {
    it('a linked co-owner CANNOT delete the dog', async () => {
      const { coOwner, dog } = await setUp();
      await expect(createTestCaller(coOwner).dogs.delete({ id: dog.id })).rejects.toThrow(/do not own this dog/);
      const row = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
      expect(row?.deletedAt).toBeNull();
    });

    it('the primary account holder can still delete the dog', async () => {
      const { primary, dog } = await setUp();
      await createTestCaller(primary).dogs.delete({ id: dog.id });
      const row = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
      expect(row?.deletedAt).not.toBeNull();
    });
  });

  describe('dogs.toggleFeedPrivacy / addTitle / removeTitle / setPrimaryPhoto', () => {
    it('a linked co-owner can toggle feed privacy', async () => {
      const { coOwner, dog } = await setUp();
      const updated = await createTestCaller(coOwner).dogs.toggleFeedPrivacy({ id: dog.id, feedPrivate: true });
      expect(updated.feedPrivate).toBe(true);
    });

    it('a stranger cannot toggle feed privacy', async () => {
      const { stranger, dog } = await setUp();
      await expect(
        createTestCaller(stranger).dogs.toggleFeedPrivacy({ id: dog.id, feedPrivate: true })
      ).rejects.toThrow(/not your dog/i);
    });

    it('a linked co-owner can add and remove a title', async () => {
      const { coOwner, dog } = await setUp();
      const title = await createTestCaller(coOwner).dogs.addTitle({ dogId: dog.id, title: 'ch' });
      expect(title.dogId).toBe(dog.id);
      await expect(createTestCaller(coOwner).dogs.removeTitle({ id: title.id })).resolves.toEqual({ success: true });
    });

    it('a stranger cannot add a title', async () => {
      const { stranger, dog } = await setUp();
      await expect(
        createTestCaller(stranger).dogs.addTitle({ dogId: dog.id, title: 'ch' })
      ).rejects.toThrow(/not your dog/i);
    });
  });

  describe('dogs.getSvProfile / upsertSvProfile', () => {
    it('a linked co-owner can view and upsert the SV profile', async () => {
      const { coOwner, dog } = await setUp();
      await expect(createTestCaller(coOwner).dogs.getSvProfile({ dogId: dog.id })).resolves.toBeNull();
      const profile = await createTestCaller(coOwner).dogs.upsertSvProfile({ dogId: dog.id, workingTitle: 'IGP1' });
      expect(profile.workingTitle).toBe('IGP1');
    });

    it('a stranger cannot view the SV profile', async () => {
      const { stranger, dog } = await setUp();
      await expect(createTestCaller(stranger).dogs.getSvProfile({ dogId: dog.id })).rejects.toThrow(/not your dog/i);
    });
  });

  describe('entries.create — entering a show', () => {
    async function rkcShow(breedId: string) {
      const org = await makeOrg();
      const show = await makeShow({
        organisationId: org.id,
        breedId,
        showScope: 'single_breed',
        showRuleset: 'rkc',
        status: 'entries_open',
        startDate: '2030-06-01',
        endDate: '2030-06-01',
      });
      const classDef = await makeClassDef({ name: 'Open' });
      const showClass = await makeShowClass({ showId: show.id, classDefinitionId: classDef.id, breedId, entryFee: 500 });
      return { show, showClass };
    }

    it('a linked co-owner can enter the co-owned dog into a show', async () => {
      const { coOwner, dog, breed } = await setUp();
      const { show, showClass } = await rkcShow(breed.id);

      const entry = await createTestCaller(coOwner).entries.create({
        dogId: dog.id,
        showId: show.id,
        classIds: [showClass.id],
        isNfc: false,
      });
      expect(entry).toBeDefined();
      const created = await testDb.query.entries.findMany({ where: eq(entries.showId, show.id) });
      expect(created).toHaveLength(1);
    });

    it('a stranger cannot enter the dog into a show', async () => {
      const { stranger, dog, breed } = await setUp();
      const { show, showClass } = await rkcShow(breed.id);

      await expect(
        createTestCaller(stranger).entries.create({
          dogId: dog.id,
          showId: show.id,
          classIds: [showClass.id],
          isNfc: false,
        })
      ).rejects.toThrow(/do not own this dog/);
    });
  });

  describe('orders.checkout — the real exhibitor checkout path', () => {
    it('a linked co-owner can check out an entry for the co-owned dog', async () => {
      const { coOwner, dog, breed } = await setUp();
      const org = await makeOrg();
      const show = await makeShow({
        organisationId: org.id,
        breedId: breed.id,
        showScope: 'single_breed',
        showRuleset: 'rkc',
        status: 'entries_open',
        startDate: '2030-06-01',
        endDate: '2030-06-01',
        firstEntryFee: 800,
        subsequentEntryFee: 500,
        nfcEntryFee: 300,
        juniorHandlerFee: 400,
      });
      const classDef = await makeClassDef();
      const showClass = await makeShowClass({ showId: show.id, classDefinitionId: classDef.id, breedId: breed.id, entryFee: 800 });

      const result = await createTestCaller(coOwner).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      });
      expect(result).toBeDefined();
      const created = await testDb.query.orders.findMany({ where: eq(orders.showId, show.id) });
      expect(created).toHaveLength(1);
    });

    it('a stranger cannot check out an entry for the dog', async () => {
      const { stranger, dog, breed } = await setUp();
      const org = await makeOrg();
      const show = await makeShow({
        organisationId: org.id,
        breedId: breed.id,
        showScope: 'single_breed',
        showRuleset: 'rkc',
        status: 'entries_open',
        startDate: '2030-06-01',
        endDate: '2030-06-01',
        firstEntryFee: 800,
        subsequentEntryFee: 500,
        nfcEntryFee: 300,
        juniorHandlerFee: 400,
      });
      const classDef = await makeClassDef();
      const showClass = await makeShowClass({ showId: show.id, classDefinitionId: classDef.id, breedId: breed.id, entryFee: 800 });

      await expect(
        createTestCaller(stranger).orders.checkout({
          showId: show.id,
          entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
        })
      ).rejects.toThrow(/not owned by you/);
      const created = await testDb.query.orders.findMany({ where: eq(orders.showId, show.id) });
      expect(created).toHaveLength(0);
    });
  });

  describe('dashboard.getSummary / onboarding.getStatus — dog counts', () => {
    it('surfaces a closing-soon deadline alert for the co-owned dog\'s breed', async () => {
      // deadlineAlerts is built from `userBreedIds`, which is derived from
      // the same dogAccessCondition query as userDogIds — a co-owner-only
      // dog must feed both, not just get counted then dropped.
      const { coOwner, breed } = await setUp();
      const org = await makeOrg();
      const show = await makeShow({
        organisationId: org.id,
        breedId: breed.id,
        showScope: 'single_breed',
        showRuleset: 'rkc',
        status: 'entries_open',
        startDate: '2030-06-01',
        endDate: '2030-06-01',
        entryCloseDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      });
      const classDef = await makeClassDef({ name: 'Open' });
      await makeShowClass({ showId: show.id, classDefinitionId: classDef.id, breedId: breed.id, entryFee: 500 });

      const summary = await createTestCaller(coOwner).dashboard.getSummary();
      expect(summary.deadlineAlerts.length).toBeGreaterThanOrEqual(1);
    });

    it('counts the co-owned dog toward the linked co-owner\'s onboarding hasDogs', async () => {
      const { coOwner } = await setUp();
      const status = await createTestCaller(coOwner).onboarding.getStatus();
      expect(status.hasDogs).toBe(true);
      expect(status.dogCount).toBeGreaterThanOrEqual(1);
    });

    it('a stranger with no dogs of their own sees hasDogs=false', async () => {
      const stranger = await makeUser({ role: 'exhibitor' });
      const status = await createTestCaller(stranger).onboarding.getStatus();
      expect(status.hasDogs).toBe(false);
    });
  });
});
