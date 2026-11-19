import { describe, it, expect } from 'vitest';
import { testDb } from '../helpers/db';
import { dogSvProfile } from '@/server/db/schema';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeUser,
} from '../helpers/factories';

/**
 * Michael 2026-09-11: "I think we go for a warning for now."
 *
 * A postal or phone entry is in the secretary's hand and often already paid
 * for, so refusing it strands her — but the blanks print in the catalogue, so
 * she has to be told. The exhibitor paths still REFUSE; the difference is one
 * decision at the call site, not a second copy of the rules
 * (lib/entry-requirements.ts).
 *
 * Provisional: Mandy may want it the other way once she has used it.
 */

async function regionalShowWithClass(className = 'Adult') {
  const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
  const show = await makeShow({
    organisationId: org.id,
    status: 'entries_open',
    showRuleset: 'wusv',
    firstEntryFee: 2000,
    subsequentEntryFee: 1000,
  });
  const def = await makeClassDef({ name: className });
  const showClass = await makeShowClass({
    showId: show.id,
    classDefinitionId: def.id,
    breedId: breed.id,
    entryFee: 2000,
  });
  return { caller: createTestCaller(secretary), show, showClass, breed };
}

describe('secretary.createManualEntry — incomplete dogs', () => {
  it('SAVES an entry whose dog is missing regional details, and says what is missing', async () => {
    const { caller, show, showClass, breed } = await regionalShowWithClass();
    const exhibitor = await makeUser({});
    const dog = await makeDog({
      ownerId: exhibitor.id,
      breedId: breed.id,
      // Pedigree present (the catalogue floor), regional details absent.
      microchipNumber: null,
      coatType: null,
      kcRegNumber: null,
    });

    const result = await caller.secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [showClass.id],
      exhibitorEmail: exhibitor.email,
      paymentMethod: 'postal',
    });

    // Saved — this is the whole point.
    expect(result.id).toBeTruthy();

    const warnings = result.requirementWarnings.join(' | ');
    expect(warnings).toMatch(/microchip/i);
    expect(warnings).toMatch(/coat/i);
    expect(warnings).toMatch(/registration number/i);
  });

  it('returns no warnings for a complete dog', async () => {
    const { caller, show, showClass, breed } = await regionalShowWithClass();
    const exhibitor = await makeUser({});
    const dog = await makeDog({
      ownerId: exhibitor.id,
      breedId: breed.id,
      kcRegNumber: 'AZ1234567',
      registrationBody: 'kc',
      microchipNumber: '953010461747088',
      coatType: 'stock',
      breederCity: 'Perth',
      breederPostcode: 'PH1 1AA',
      sireRegistrationNumber: 'AT00843504',
      damRegistrationNumber: 'AV02742901',
    });
    await testDb.insert(dogSvProfile).values({
      dogId: dog.id,
      hipGrade: 'bva',
      elbowGrade: 'bva',
      dna: 'recorded',
    });

    const result = await caller.secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [showClass.id],
      exhibitorEmail: exhibitor.email,
      paymentMethod: 'postal',
    });

    expect(result.requirementWarnings).toEqual([]);
  });

  // NFC dogs are not competing, so competition eligibility does not apply —
  // matching the exhibitor path, which skips the regional gate on zero
  // classes. The catalogue pedigree still counts: NFC dogs print too.
  it('does not warn about regional competition details for an NFC entry', async () => {
    const { caller, show, showClass, breed } = await regionalShowWithClass();
    const exhibitor = await makeUser({});
    const dog = await makeDog({
      ownerId: exhibitor.id,
      breedId: breed.id,
      microchipNumber: null,
      coatType: null,
      kcRegNumber: null,
    });

    const result = await caller.secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [showClass.id],
      exhibitorEmail: exhibitor.email,
      paymentMethod: 'postal',
      isNfc: true,
    });

    expect(result.requirementWarnings).toEqual([]);
  });

  it('warns about missing pedigree even on a standard show', async () => {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({
      organisationId: org.id,
      status: 'entries_open',
      firstEntryFee: 2000,
      subsequentEntryFee: 1000,
    });
    const def = await makeClassDef({ name: 'Open' });
    const showClass = await makeShowClass({
      showId: show.id,
      classDefinitionId: def.id,
      breedId: breed.id,
      entryFee: 2000,
    });
    const exhibitor = await makeUser({});
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, sireName: null });

    const result = await createTestCaller(secretary).secretary.createManualEntry({
      showId: show.id,
      dogId: dog.id,
      classIds: [showClass.id],
      exhibitorEmail: exhibitor.email,
      paymentMethod: 'postal',
    });

    expect(result.id).toBeTruthy();
    expect(result.requirementWarnings.join(' | ')).toMatch(/sire/i);
  });
});
