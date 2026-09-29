import { describe, it, expect } from 'vitest';
import { entryRequirementsMissing } from '@/lib/entry-requirements';

/**
 * The one declaration of what an entry needs, replacing three that disagreed
 * (see lib/entry-requirements.ts). These tests pin the composition — that the
 * six fields which used to be enforced only by the exhibitor wizard's Next
 * button are now in the same list the server can act on.
 */

const completeRegionalDog = {
  registeredName: 'Test Dog',
  kcRegNumber: 'AZ1234567',
  registrationBody: 'kc',
  microchipNumber: '953010461747088',
  coatType: 'stock',
  sireName: 'Test Sire',
  damName: 'Test Dam',
  breederName: 'Test Breeder',
  colour: 'Black & Tan',
  breederCity: 'Perth',
  breederPostcode: 'PH1 1AA',
  sireRegistrationNumber: 'AT00843504',
  damRegistrationNumber: 'AV02742901',
};

const healthyProfile = { hipGrade: 'bva', elbowGrade: 'bva', dna: 'recorded' };

describe('entryRequirementsMissing — standard RKC show', () => {
  it('wants only the pedigree the catalogue prints', () => {
    const missing = entryRequirementsMissing({
      dog: { sireName: null, damName: 'Dam', breederName: 'Breeder', colour: 'Black' },
      classNames: ['Open'],
      showRuleset: 'rkc',
    });
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatch(/sire/i);
  });

  it('does NOT demand the regional fields on a standard show', () => {
    const missing = entryRequirementsMissing({
      dog: { sireName: 'S', damName: 'D', breederName: 'B', colour: 'Black' },
      classNames: ['Open'],
      showRuleset: 'rkc',
    });
    expect(missing).toEqual([]);
  });
});

describe('entryRequirementsMissing — regional (wusv)', () => {
  it('passes a complete dog', () => {
    const missing = entryRequirementsMissing({
      dog: completeRegionalDog,
      svProfile: healthyProfile,
      classNames: ['Adult'],
      showRuleset: 'wusv',
    });
    expect(missing).toEqual([]);
  });

  // The six that used to be required by the wizard's Next button and by
  // nothing else — the whole point of this module.
  it.each([
    ['coatType', /coat/i],
    ['registrationBody', /registration body/i],
    ['breederCity', /breeder/i],
    ['breederPostcode', /breeder/i],
    ['sireRegistrationNumber', /sire/i],
    ['damRegistrationNumber', /dam/i],
  ])('catches a missing %s, which the server gate used to ignore', (field, pattern) => {
    const missing = entryRequirementsMissing({
      dog: { ...completeRegionalDog, [field]: null },
      svProfile: healthyProfile,
      classNames: ['Adult'],
      showRuleset: 'wusv',
    });
    expect(missing.join(' | ')).toMatch(pattern);
  });

  it('still catches the ones the server always caught', () => {
    const missing = entryRequirementsMissing({
      dog: { ...completeRegionalDog, kcRegNumber: null, microchipNumber: null },
      svProfile: healthyProfile,
      classNames: ['Adult'],
      showRuleset: 'wusv',
    });
    expect(missing.join(' | ')).toMatch(/registration number/i);
    expect(missing.join(' | ')).toMatch(/microchip/i);
  });

  // The class is named 'SV Yearling' in SV_HEALTH_FROM_CLASSES — 'Yearling'
  // alone matches nothing and silently skips the health triad.
  it('demands the health triad from SV Yearling up, not below it', () => {
    const below = entryRequirementsMissing({
      dog: completeRegionalDog,
      svProfile: {},
      classNames: ['Minor Puppy'],
      showRuleset: 'wusv',
    });
    expect(below).toEqual([]);

    const above = entryRequirementsMissing({
      dog: completeRegionalDog,
      svProfile: {},
      classNames: ['SV Yearling'],
      showRuleset: 'wusv',
    });
    expect(above.join(' | ')).toMatch(/hip/i);
    expect(above.join(' | ')).toMatch(/elbow/i);
    expect(above.join(' | ')).toMatch(/dna/i);
  });

  it('demands a working title for the Working class only', () => {
    const working = entryRequirementsMissing({
      dog: completeRegionalDog,
      svProfile: healthyProfile,
      classNames: ['Working'],
      showRuleset: 'wusv',
    });
    expect(working).toContain('Working title');

    const adult = entryRequirementsMissing({
      dog: completeRegionalDog,
      svProfile: healthyProfile,
      classNames: ['Adult'],
      showRuleset: 'wusv',
    });
    expect(adult).not.toContain('Working title');
  });

  // BH/AD/WB are recorded qualifications, not working ones (Mandy 2026-08-19).
  it('does not accept BH as a working title', () => {
    const missing = entryRequirementsMissing({
      dog: completeRegionalDog,
      svProfile: { ...healthyProfile, workingTitle: 'BH' },
      classNames: ['Working'],
      showRuleset: 'wusv',
    });
    expect(missing).toContain('Working title');
  });

  it('reports each missing field once, not twice', () => {
    const missing = entryRequirementsMissing({
      dog: { ...completeRegionalDog, sireName: null, sireRegistrationNumber: null },
      svProfile: healthyProfile,
      classNames: ['Adult'],
      showRuleset: 'wusv',
    });
    expect(new Set(missing).size).toBe(missing.length);
  });
});
