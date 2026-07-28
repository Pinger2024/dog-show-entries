/**
 * Regression test — Amanda 2026-07-18 (North East Regional).
 *
 * Raubahaus Xaris, born 30 Apr 2026, is 4 months and 6 days old on show day
 * (5 Sept 2026) — squarely inside the Baby Puppy window ("four and less than
 * six calendar months of age on the first day of the show"). The client rightly
 * offered her the Baby Puppy class, but the server's blanket "must be at least
 * 6 months for competition" gate rejected her at checkout and shooed her to NFC.
 *
 * The age gate must be class-aware: an age-restricted class (Baby Puppy 4–6mo)
 * is judged on its own window, while ordinary competition classes keep the
 * six-month floor. These tests cover both entry paths — exhibitor checkout
 * (orders.checkout) and secretary manual entry (entries.create).
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeSecretaryWithOrg,
} from '../helpers/factories';

const SHOW_DAY = '2026-09-05'; // North East Regional

/** A wusv single-breed show with a real Baby Puppy (sv_age, 4–6mo) class. */
async function babyPuppyShow() {
  const { org, user: secretary } = await makeSecretaryWithOrg();
  const breed = await makeBreed({ name: 'German Shepherd Dog' });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'wusv',
    status: 'entries_open',
    juniorHandlerFee: 0,
    startDate: SHOW_DAY,
    endDate: SHOW_DAY,
    regionalFeeConfig: {
      tiers: [
        { standardPence: 2000, memberPence: 2000 },
        { standardPence: 2000, memberPence: 2000 },
        { standardPence: 1600, memberPence: 1600 },
        { standardPence: 0, memberPence: 0 },
      ],
      memberships: [],
      firstTimeEnabled: false,
      firstTimeFeePence: 0,
      donationsEnabled: false,
    },
  });
  const bpDef = await makeClassDef({
    name: 'Baby Puppy',
    type: 'sv_age',
    minAgeMonths: 4,
    maxAgeMonths: 6,
  });
  const bpClass = await makeShowClass({
    showId: show.id,
    classDefinitionId: bpDef.id,
    breedId: breed.id,
    entryFee: 1000,
  });
  return { org, secretary, breed, show, bpClass };
}

/** An RKC single-breed show with a real Baby Puppy (age, 4–6mo) class. Used
 *  for the entries.create path, which predates the regional (wusv) fee model. */
async function rkcBabyPuppyShow() {
  const { org } = await makeSecretaryWithOrg();
  const breed = await makeBreed({ name: 'German Shepherd Dog' });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: 'rkc',
    status: 'entries_open',
    startDate: SHOW_DAY,
    endDate: SHOW_DAY,
  });
  const bpDef = await makeClassDef({
    name: 'Baby Puppy',
    type: 'age',
    minAgeMonths: 4,
    maxAgeMonths: 6,
  });
  const bpClass = await makeShowClass({
    showId: show.id,
    classDefinitionId: bpDef.id,
    breedId: breed.id,
    entryFee: 500,
  });
  return { org, breed, show, bpClass };
}

/** An SV-compliant puppy of the show breed, born on `dob`. */
async function makePuppy(ownerId: string, breedId: string, dob: string) {
  return makeDog({
    ownerId,
    breedId,
    dateOfBirth: dob,
    kcRegNumber: 'SZ9999',
    microchipNumber: '981000000099',
    sireName: 'Test Sire',
    damName: 'Test Dam',
    breederName: 'Test Breeder',
    colour: 'Black and Gold',
  });
}

describe('Baby Puppy age eligibility — exhibitor checkout', () => {
  it('accepts a 4-month-old Baby Puppy into her own class (the Xaris case)', async () => {
    const { show, breed, bpClass } = await babyPuppyShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const pup = await makePuppy(exhibitor.id, breed.id, '2026-04-30'); // 4mo 6d

    const result = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [
        { entryType: 'standard', dogId: pup.id, classIds: [bpClass.id], isNfc: false },
      ],
    });

    expect(result.orderId).toBeDefined();
    const created = await testDb.query.entries.findMany({
      where: eq(entries.showId, show.id),
    });
    expect(created).toHaveLength(1);
    expect(created[0]!.dogId).toBe(pup.id);
  });

  it('rejects a dog under 4 months for Baby Puppy, pointing at NFC', async () => {
    const { show, breed, bpClass } = await babyPuppyShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const pup = await makePuppy(exhibitor.id, breed.id, '2026-06-01'); // 3mo 4d

    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [
          { entryType: 'standard', dogId: pup.id, classIds: [bpClass.id], isNfc: false },
        ],
      }),
    ).rejects.toThrow(/too young for "Baby Puppy".*Not For Competition/s);

    const created = await testDb.query.entries.findMany({
      where: eq(entries.showId, show.id),
    });
    expect(created).toHaveLength(0);
  });

  it('rejects a dog who has aged out of Baby Puppy as too old', async () => {
    const { show, breed, bpClass } = await babyPuppyShow();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const pup = await makePuppy(exhibitor.id, breed.id, '2025-12-01'); // 9mo

    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [
          { entryType: 'standard', dogId: pup.id, classIds: [bpClass.id], isNfc: false },
        ],
      }),
    ).rejects.toThrow(/too old for "Baby Puppy"/);
  });
});

describe('Baby Puppy age eligibility — entries.create (owner path)', () => {
  it('accepts a 4-month-old Baby Puppy via entries.create', async () => {
    const { show, breed, bpClass } = await rkcBabyPuppyShow();
    const owner = await makeUser({ role: 'exhibitor' });
    const pup = await makePuppy(owner.id, breed.id, '2026-04-30'); // 4mo 6d

    const entry = await createTestCaller(owner).entries.create({
      dogId: pup.id,
      showId: show.id,
      classIds: [bpClass.id],
      isNfc: false,
    });

    expect(entry).toBeDefined();
    const created = await testDb.query.entries.findMany({
      where: eq(entries.showId, show.id),
    });
    expect(created).toHaveLength(1);
  });

  it('still rejects an under-age Baby Puppy via entries.create', async () => {
    const { show, breed, bpClass } = await rkcBabyPuppyShow();
    const owner = await makeUser({ role: 'exhibitor' });
    const pup = await makePuppy(owner.id, breed.id, '2026-06-01'); // 3mo 4d

    await expect(
      createTestCaller(owner).entries.create({
        dogId: pup.id,
        showId: show.id,
        classIds: [bpClass.id],
        isNfc: false,
      }),
    ).rejects.toThrow(/too young for "Baby Puppy"/);
  });
});
