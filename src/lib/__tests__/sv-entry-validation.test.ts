import { describe, it, expect } from 'vitest';
import { entryRequirements } from '../entry-requirements';

/**
 * SV regional entry requirements, through the one owner (entryRequirements):
 *  - every dog: registration number + microchip
 *  - Yearling class and above: hip + elbow + DNA (Junior does NOT — Amanda
 *    2026-07-18; it's Yearling onwards)
 *  - Working class: also a working title
 * These used to be tested against svEntryMissingRequirements, the server's
 * separate copy of the rule, removed 29 Sept 2026 when every path moved onto
 * entryRequirements.
 */

const fullProfile = {
  hipGrade: 'normal',
  elbowGrade: 'normal',
  dna: 'recorded',
  workingTitle: 'IGP3',
};
const fullDog = {
  kcRegNumber: 'SV12345',
  microchipNumber: '956000100061',
  registrationBody: 'sv',
  coatType: 'stock',
  sireName: 'Sire',
  sireRegistrationNumber: 'SZ1',
  damName: 'Dam',
  damRegistrationNumber: 'SZ2',
  breederName: 'Breeder',
  breederCity: 'Perth',
  breederPostcode: 'PH1 1AA',
  colour: 'Black & Gold',
};

const svGaps = (
  dog: Partial<typeof fullDog> & Record<string, unknown>,
  svProfile: Record<string, unknown> | null,
  classNames: string[],
) =>
  entryRequirements({
    dog: { dateOfBirth: null, ...fullDog, ...dog },
    svProfile,
    classNames,
    showRuleset: 'wusv',
    entryType: 'standard',
    isNfc: false,
  }).sv;

describe('regional entry requirements (entryRequirements)', () => {
  it('passes a fully-documented Adult dog', () => {
    expect(svGaps({}, fullProfile, ['Adult'])).toEqual([]);
  });

  it('requires registration number + microchip even for Baby Puppy', () => {
    const missing = svGaps({ kcRegNumber: null as never, microchipNumber: null as never }, fullProfile, ['Baby Puppy']);
    expect(missing).toContain('Registration number');
    expect(missing).toContain('Microchip number');
    // Baby Puppy doesn't need health.
    expect(missing).not.toContain('Hip score');
  });

  it('does NOT require health for Baby Puppy / Minor Puppy / Puppy / Junior', () => {
    // Amanda 2026-07-18: DNA/health is Yearling onwards — Junior is exempt.
    for (const cls of ['Baby Puppy', 'SV Minor Puppy', 'SV Puppy', 'SV Junior']) {
      const missing = svGaps({}, { hipGrade: null, elbowGrade: null, dna: null, workingTitle: null }, [cls]);
      expect(missing, cls).toEqual([]);
    }
  });

  it('requires the health triad from Yearling upward (not Junior)', () => {
    for (const cls of ['SV Yearling', 'Adult', 'Working']) {
      const missing = svGaps({}, { hipGrade: null, elbowGrade: null, dna: null, workingTitle: 'IGP1' }, [cls]);
      expect(missing, cls).toEqual(expect.arrayContaining(['Hip score', 'Elbow score', 'DNA recording']));
    }
    // Junior explicitly does NOT ask for DNA (the bug Paula Ingham hit).
    const junior = svGaps({}, { hipGrade: null, elbowGrade: null, dna: null, workingTitle: null }, ['SV Junior']);
    expect(junior).not.toContain('DNA recording');
    expect(junior).toEqual([]);
  });

  it("treats 'not_required' hip/elbow as missing (Yearling)", () => {
    const missing = svGaps(
      {},
      { hipGrade: 'not_required', elbowGrade: 'not_required', dna: 'recorded', workingTitle: null },
      ['SV Yearling'],
    );
    expect(missing).toContain('Hip score');
    expect(missing).toContain('Elbow score');
    expect(missing).not.toContain('DNA recording');
  });

  it('requires a working title for the Working class only', () => {
    expect(svGaps({}, { ...fullProfile, workingTitle: null }, ['Working'])).toContain('Working title');
    expect(svGaps({}, { ...fullProfile, workingTitle: null }, ['Adult'])).not.toContain('Working title');
  });
});
