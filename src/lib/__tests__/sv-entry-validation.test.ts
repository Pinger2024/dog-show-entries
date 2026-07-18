import { describe, it, expect } from 'vitest';
import { svEntryMissingRequirements } from '../sv-entry-validation';

/**
 * SV regional entry requirements:
 *  - every dog: registration number + microchip
 *  - Yearling class and above: hip + elbow + DNA (Junior does NOT — Amanda
 *    2026-07-18; it's Yearling onwards)
 *  - Working class: also a working title
 */

const fullProfile = {
  hipGrade: 'normal',
  elbowGrade: 'normal',
  dna: 'recorded',
  workingTitle: 'IGP3',
};
const fullDog = { kcRegNumber: 'SV12345', microchipNumber: '956000100061' };

describe('svEntryMissingRequirements', () => {
  it('passes a fully-documented Adult dog', () => {
    expect(
      svEntryMissingRequirements({ dog: fullDog, svProfile: fullProfile, classNames: ['Adult'] }),
    ).toEqual([]);
  });

  it('requires registration number + microchip even for Baby Puppy', () => {
    const missing = svEntryMissingRequirements({
      dog: { kcRegNumber: null, microchipNumber: null },
      svProfile: fullProfile,
      classNames: ['Baby Puppy'],
    });
    expect(missing).toContain('registration number');
    expect(missing).toContain('microchip number');
    // Baby Puppy doesn't need health.
    expect(missing).not.toContain('hip score');
  });

  it('does NOT require health for Baby Puppy / Minor Puppy / Puppy / Junior', () => {
    // Amanda 2026-07-18: DNA/health is Yearling onwards — Junior is exempt.
    for (const cls of ['Baby Puppy', 'SV Minor Puppy', 'SV Puppy', 'SV Junior']) {
      const missing = svEntryMissingRequirements({
        dog: fullDog,
        svProfile: { hipGrade: null, elbowGrade: null, dna: null, workingTitle: null },
        classNames: [cls],
      });
      expect(missing, cls).toEqual([]);
    }
  });

  it('requires the health triad from Yearling upward (not Junior)', () => {
    for (const cls of ['SV Yearling', 'Adult', 'Working']) {
      const missing = svEntryMissingRequirements({
        dog: fullDog,
        svProfile: { hipGrade: null, elbowGrade: null, dna: null, workingTitle: 'IGP1' },
        classNames: [cls],
      });
      expect(missing, cls).toEqual(expect.arrayContaining(['hip score', 'elbow score', 'DNA recording']));
    }
    // Junior explicitly does NOT ask for DNA (the bug Paula Ingham hit).
    const junior = svEntryMissingRequirements({
      dog: fullDog,
      svProfile: { hipGrade: null, elbowGrade: null, dna: null, workingTitle: null },
      classNames: ['SV Junior'],
    });
    expect(junior).not.toContain('DNA recording');
    expect(junior).toEqual([]);
  });

  it("treats 'not_required' hip/elbow as missing (Yearling)", () => {
    const missing = svEntryMissingRequirements({
      dog: fullDog,
      svProfile: { hipGrade: 'not_required', elbowGrade: 'not_required', dna: 'recorded', workingTitle: null },
      classNames: ['SV Yearling'],
    });
    expect(missing).toContain('hip score');
    expect(missing).toContain('elbow score');
    expect(missing).not.toContain('DNA recording');
  });

  it('requires a working title for the Working class only', () => {
    const working = svEntryMissingRequirements({
      dog: fullDog,
      svProfile: { ...fullProfile, workingTitle: null },
      classNames: ['Working'],
    });
    expect(working).toContain('working title');

    const adult = svEntryMissingRequirements({
      dog: fullDog,
      svProfile: { ...fullProfile, workingTitle: null },
      classNames: ['Adult'],
    });
    expect(adult).not.toContain('working title');
  });
});
