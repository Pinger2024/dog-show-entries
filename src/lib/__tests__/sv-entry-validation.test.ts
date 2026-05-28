import { describe, it, expect } from 'vitest';
import { svEntryMissingRequirements } from '../sv-entry-validation';

/**
 * SV regional entry requirements (Amanda 2026-05-28):
 *  - every dog: registration number + microchip
 *  - Junior class and above: hip + elbow + DNA
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

  it('does NOT require health for Baby Puppy / Minor Puppy / Puppy', () => {
    for (const cls of ['Baby Puppy', 'SV Minor Puppy', 'SV Puppy']) {
      const missing = svEntryMissingRequirements({
        dog: fullDog,
        svProfile: { hipGrade: null, elbowGrade: null, dna: null, workingTitle: null },
        classNames: [cls],
      });
      expect(missing, cls).toEqual([]);
    }
  });

  it('requires the health triad from Junior upward', () => {
    for (const cls of ['SV Junior', 'SV Yearling', 'Adult', 'Working']) {
      const missing = svEntryMissingRequirements({
        dog: fullDog,
        svProfile: { hipGrade: null, elbowGrade: null, dna: null, workingTitle: 'IGP1' },
        classNames: [cls],
      });
      expect(missing, cls).toEqual(expect.arrayContaining(['hip score', 'elbow score', 'DNA recording']));
    }
  });

  it("treats 'not_required' hip/elbow as missing", () => {
    const missing = svEntryMissingRequirements({
      dog: fullDog,
      svProfile: { hipGrade: 'not_required', elbowGrade: 'not_required', dna: 'recorded', workingTitle: null },
      classNames: ['SV Junior'],
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
