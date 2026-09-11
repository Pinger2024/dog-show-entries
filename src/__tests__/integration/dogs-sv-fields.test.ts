import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { dogs, dogSvProfile } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeDog } from '../helpers/factories';

/**
 * Regression: Amanda 2026-05-19 — SV dog model expansion.
 * Locks the new fields in (breeder location, hip/elbow BVA+ANKC,
 * breed survey year+surveyor, hip/elbow "other" free text).
 */

describe('dogs.update — SV / breeder location fields', () => {
  it('persists breeder country / city / postcode', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    const caller = createTestCaller(exhibitor);

    await caller.dogs.update({
      id: dog.id,
      breederName: 'Hans Schmidt',
      breederCountry: 'Germany',
      breederCity: 'Augsburg',
      breederPostcode: '86150',
    });

    const reloaded = await testDb.query.dogs.findFirst({ where: eq(dogs.id, dog.id) });
    expect(reloaded?.breederName).toBe('Hans Schmidt');
    expect((reloaded as { breederCountry?: string | null })?.breederCountry).toBe('Germany');
    expect((reloaded as { breederCity?: string | null })?.breederCity).toBe('Augsburg');
    expect((reloaded as { breederPostcode?: string | null })?.breederPostcode).toBe('86150');
  });
});

describe('dogs.upsertSvProfile — extended grading + breed survey', () => {
  it('saves BVA hip + elbow grades with numeric scores', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    const caller = createTestCaller(exhibitor);

    await caller.dogs.upsertSvProfile({
      dogId: dog.id,
      hipGrade: 'bva',
      hipScore: '4:4',
      elbowGrade: 'bva',
      elbowScore: '0',
    });

    const profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.hipGrade).toBe('bva');
    expect(profile?.hipScore).toBe('4:4');
    expect(profile?.elbowGrade).toBe('bva');
    expect(profile?.elbowScore).toBe('0');
  });

  it('saves ANKC hip + elbow grades', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    const caller = createTestCaller(exhibitor);

    await caller.dogs.upsertSvProfile({
      dogId: dog.id,
      hipGrade: 'ankc',
      hipScore: '0:0',
      elbowGrade: 'ankc',
      elbowScore: '0:0',
    });

    const profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.hipGrade).toBe('ankc');
    expect(profile?.elbowGrade).toBe('ankc');
  });

  it('saves hipScoreOther / elbowScoreOther when grade=other', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    const caller = createTestCaller(exhibitor);

    await caller.dogs.upsertSvProfile({
      dogId: dog.id,
      hipGrade: 'other',
      hipScoreOther: 'FCI A1',
      elbowGrade: 'other',
      elbowScoreOther: 'OFA Normal',
    });

    const profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.hipGrade).toBe('other');
    expect((profile as { hipScoreOther?: string | null })?.hipScoreOther).toBe('FCI A1');
    expect(profile?.elbowGrade).toBe('other');
    expect((profile as { elbowScoreOther?: string | null })?.elbowScoreOther).toBe('OFA Normal');
  });

  it('saves breed survey year + surveyor', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    const caller = createTestCaller(exhibitor);

    await caller.dogs.upsertSvProfile({
      dogId: dog.id,
      koerung: 'current_year',
      breedSurveyClass: 'KK1',
      breedSurveyYear: 2024,
      breedSurveyor: 'Peter Schorling',
    });

    const profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.koerung).toBe('current_year');
    expect(profile?.breedSurveyClass).toBe('KK1');
    expect((profile as { breedSurveyYear?: number | null })?.breedSurveyYear).toBe(2024);
    expect((profile as { breedSurveyor?: string | null })?.breedSurveyor).toBe('Peter Schorling');
  });

  it('saves working title as text (preset code OR free-text "Other")', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    const caller = createTestCaller(exhibitor);

    // Preset
    await caller.dogs.upsertSvProfile({ dogId: dog.id, workingTitle: 'IGP2' });
    let profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.workingTitle).toBe('IGP2');

    // Custom (Other)
    await caller.dogs.upsertSvProfile({ dogId: dog.id, workingTitle: 'SVV2' });
    profile = await testDb.query.dogSvProfile.findFirst({
      where: eq(dogSvProfile.dogId, dog.id),
    });
    expect(profile?.workingTitle).toBe('SVV2');
  });
});

/**
 * Other Qualifications — BH / AD / WB (Mandy 2026-08-19). Recorded on the dog,
 * never required, and never a working title.
 */
describe('other qualifications round-trip', () => {
  it('saves and reads back the ticks and the free-text Other', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    const caller = createTestCaller(exhibitor);

    await caller.dogs.upsertSvProfile({
      dogId: dog.id,
      bh: true,
      ad: true,
      wb: true,
      otherQualifications: 'BRG GM',
    });

    const profile = await caller.dogs.getSvProfile({ dogId: dog.id });
    expect(profile?.bh).toBe(true);
    expect(profile?.ad).toBe(true);
    expect(profile?.wb).toBe(true);
    expect(profile?.otherQualifications).toBe('BRG GM');
  });

  it('defaults to not-held for a dog whose profile never mentions them', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    const caller = createTestCaller(exhibitor);

    await caller.dogs.upsertSvProfile({ dogId: dog.id, hipGrade: 'normal' });

    const profile = await caller.dogs.getSvProfile({ dogId: dog.id });
    expect(profile?.bh).toBe(false);
    expect(profile?.ad).toBe(false);
    expect(profile?.wb).toBe(false);
    expect(profile?.otherQualifications).toBeNull();
  });

  it('records them without granting the dog a working title', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: exhibitor.id });
    const caller = createTestCaller(exhibitor);

    await caller.dogs.upsertSvProfile({ dogId: dog.id, bh: true, ad: true, wb: true });

    const profile = await caller.dogs.getSvProfile({ dogId: dog.id });
    // The qualifications are held; the working-title field stays empty, so
    // the dog is still routed to Adult rather than Working.
    expect(profile?.wb).toBe(true);
    expect(profile?.workingTitle ?? null).toBeNull();
  });
});
