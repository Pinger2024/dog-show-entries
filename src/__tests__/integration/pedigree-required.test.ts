/**
 * Mandy 2026-07-27, live: "it seems to still be letting people register their
 * dogs without adding the sire and dam name, there were 2 for south western
 * like that". KYMRIGKITA INDIANA was created 2026-03-12 and its only ever
 * modification was her filling those fields in by hand on 2026-07-26.
 *
 * The rule "sire, dam and breeder are required" existed in exactly ONE place —
 * dog-form.tsx, and only in create mode. The onboarding wizard is a separate
 * form that calls dogs.create directly with these fields optional, so a
 * brand-new exhibitor never met the rule at all. ZETAYS BATMAN (2026-07-20,
 * all three blank) was created a month AFTER the client rule shipped.
 *
 * These tests pin the guarantee at the server choke point every create path
 * shares, so a fourth form can't reintroduce the gap.
 */
import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeBreed, makeDog } from '../helpers/factories';

const owners = [
  { ownerName: 'Jane Owner', ownerAddress: '1 High St', ownerEmail: 'jane@test.local', isPrimary: true },
];

/** A dog that satisfies every rule — each test breaks exactly one field. */
function completeDog(breedId: string) {
  return {
    registeredName: 'Test Dog',
    breedId,
    sex: 'dog' as const,
    dateOfBirth: '2024-01-01',
    sireName: 'Test Sire',
    damName: 'Test Dam',
    breederName: 'Test Breeder',
    colour: 'Black and Gold',
    owners,
  };
}

describe('dogs.create — pedigree is required at the server choke point', () => {
  it('accepts a dog with the full pedigree', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);

    const dog = await caller.dogs.create(completeDog(breed.id));
    expect(dog.sireName).toBe('Test Sire');
    expect(dog.damName).toBe('Test Dam');
    expect(dog.breederName).toBe('Test Breeder');
  });

  // Each field named individually: a single "rejects incomplete dogs" test
  // would still pass if only one of the four were actually checked.
  it.each([
    ['sireName', /sire/i],
    ['damName', /dam/i],
    ['breederName', /breeder/i],
    ['colour', /colour/i],
  ] as const)('rejects a dog created with %s missing', async (field, expected) => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.dogs.create({ ...completeDog(breed.id), [field]: undefined })
    ).rejects.toThrow(expected);
  });

  // The RKC lookup sometimes doesn't respond and people type these by hand
  // (Mandy) — a space bar press must not count as filling the field in.
  it('treats a whitespace-only sire as missing', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.dogs.create({ ...completeDog(breed.id), sireName: '   ' })
    ).rejects.toThrow(/sire/i);
  });

  it('names every missing field at once, so the user fixes them in one pass', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.dogs.create({
        ...completeDog(breed.id),
        sireName: undefined,
        damName: undefined,
        breederName: undefined,
      })
    ).rejects.toThrow(/sire.*dam.*breeder/is);
  });

  it('still requires at least one owner', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const caller = createTestCaller(exhibitor);

    await expect(
      caller.dogs.create({ ...completeDog(breed.id), owners: [] })
    ).rejects.toThrow(/owner/i);
  });
});

describe('dogs.update — cannot clear pedigree once set, but a blank one stays repairable', () => {
  it.each([
    ['', 'empty string'],
    ['   ', 'whitespace-only'],
    [null, 'null'],
  ] as const)('rejects clearing a populated sireName to %s (%s)', async (clearValue) => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, sireName: 'Old Sire', damName: 'Old Dam', breederName: 'Old Breeder', colour: 'Sable' });
    const caller = createTestCaller(owner);

    await expect(
      caller.dogs.update({ id: dog.id, sireName: clearValue })
    ).rejects.toThrow(/sire/i);
  });

  it('rejects clearing a populated damName, breederName, or colour', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const caller = createTestCaller(owner);

    const dam = await makeDog({ ownerId: owner.id, sireName: 'S', damName: 'Old Dam', breederName: 'B', colour: 'C' });
    await expect(caller.dogs.update({ id: dam.id, damName: '' })).rejects.toThrow(/dam/i);

    const breeder = await makeDog({ ownerId: owner.id, sireName: 'S', damName: 'D', breederName: 'Old Breeder', colour: 'C' });
    await expect(caller.dogs.update({ id: breeder.id, breederName: '' })).rejects.toThrow(/breeder/i);

    const colour = await makeDog({ ownerId: owner.id, sireName: 'S', damName: 'D', breederName: 'B', colour: 'Old Colour' });
    await expect(caller.dogs.update({ id: colour.id, colour: '' })).rejects.toThrow(/colour/i);
  });

  it('allows updating a dog whose sireName is already blank, including filling it in — the repair case', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, sireName: null, damName: 'Old Dam', breederName: 'Old Breeder', colour: 'Sable' });
    const caller = createTestCaller(owner);

    const stillBlank = await caller.dogs.update({ id: dog.id, registeredName: 'Renamed' });
    expect(stillBlank.sireName).toBeNull();

    const repaired = await caller.dogs.update({ id: dog.id, sireName: 'New Sire' });
    expect(repaired.sireName).toBe('New Sire');
  });

  it('allows an unrelated partial edit (colour only) without resending pedigree fields', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, sireName: 'Old Sire', damName: 'Old Dam', breederName: 'Old Breeder', colour: 'Sable' });
    const caller = createTestCaller(owner);

    const updated = await caller.dogs.update({ id: dog.id, colour: 'Black & Tan' });
    expect(updated.colour).toBe('Black & Tan');
    expect(updated.sireName).toBe('Old Sire');
    expect(updated.damName).toBe('Old Dam');
    expect(updated.breederName).toBe('Old Breeder');
  });

  it('allows an unrelated partial edit (bio only) without resending pedigree fields', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, sireName: 'Old Sire', damName: 'Old Dam', breederName: 'Old Breeder', colour: 'Sable' });
    const caller = createTestCaller(owner);

    const updated = await caller.dogs.update({ id: dog.id, bio: 'A lovely dog.' });
    expect(updated.bio).toBe('A lovely dog.');
    expect(updated.sireName).toBe('Old Sire');
  });
});
