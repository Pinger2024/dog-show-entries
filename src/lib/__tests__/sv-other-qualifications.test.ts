import { describe, it, expect } from 'vitest';
import { hasWorkingTitle, svAgeClassAllowed } from '../sv-entry-readiness';
import { svEntryMissingRequirements } from '../sv-entry-validation';

/**
 * BH / AD / WB are recorded qualifications, not working ones — Mandy
 * 2026-08-19: "add the WB, AD etc but guard the routing rules as these should
 * NOT drive the entry into the working class".
 *
 * Before this guard existed, `hasWorkingTitle` returned true for any non-empty
 * string. Because the GSDL-BRG form asks for BH/AD/WB and Remi had nowhere to
 * record them, the working-title "Other" box was the only place an exhibitor
 * could put one — and doing so offered the dog the Working class and HID the
 * Adult class it actually belongs in.
 */

const fullDog = { kcRegNumber: 'SV12345', microchipNumber: '956000100061' };
const health = { hipGrade: 'normal', elbowGrade: 'normal', dna: 'recorded' };

describe('BH / AD / WB are not working qualifications', () => {
  it.each(['BH', 'AD', 'WB', 'bh', 'ad', 'wb', 'BH/VT', 'VT'])(
    'does not treat %s as a working title',
    (mark) => {
      expect(hasWorkingTitle(mark)).toBe(false);
    },
  );

  it('does not treat a comma-separated list of them as a working title', () => {
    expect(hasWorkingTitle('WB, BH, AD')).toBe(false);
    expect(hasWorkingTitle('BH, AD')).toBe(false);
  });

  it('still recognises a genuine working title', () => {
    for (const title of ['IGP1', 'IGP2', 'IGP3', 'ZAP', 'HGH', 'SchH1', 'IPO2']) {
      expect(hasWorkingTitle(title)).toBe(true);
    }
  });

  it('recognises a working title even when a mark is typed alongside it', () => {
    // The catalogue convention is "IGP1 Current Year Kkl WB, BH, AD" — an
    // exhibitor may well paste the whole string in. The IGP1 still counts.
    expect(hasWorkingTitle('IGP1 BH')).toBe(true);
    expect(hasWorkingTitle('IGP1 WB, BH, AD')).toBe(true);
  });

  it('treats blank and whitespace as no working title', () => {
    expect(hasWorkingTitle('')).toBe(false);
    expect(hasWorkingTitle('   ')).toBe(false);
    expect(hasWorkingTitle(null)).toBe(false);
    expect(hasWorkingTitle(undefined)).toBe(false);
  });
});

describe('class routing for a dog holding only BH / AD / WB', () => {
  it('offers Adult and withholds Working', () => {
    const dogHasWorkingTitle = hasWorkingTitle('WB, BH, AD');
    expect(svAgeClassAllowed('Adult', dogHasWorkingTitle)).toBe(true);
    expect(svAgeClassAllowed('Working', dogHasWorkingTitle)).toBe(false);
  });

  it('still routes a titled dog to Working and withholds Adult', () => {
    const dogHasWorkingTitle = hasWorkingTitle('IGP2');
    expect(svAgeClassAllowed('Working', dogHasWorkingTitle)).toBe(true);
    expect(svAgeClassAllowed('Adult', dogHasWorkingTitle)).toBe(false);
  });
});

describe('the server entry gate agrees with the client', () => {
  it('blocks a Working-class entry when the dog holds only a BH', () => {
    expect(
      svEntryMissingRequirements({
        dog: fullDog,
        svProfile: { ...health, workingTitle: 'BH' },
        classNames: ['Working'],
      }),
    ).toContain('working title');
  });

  it('admits the same dog to Adult', () => {
    expect(
      svEntryMissingRequirements({
        dog: fullDog,
        svProfile: { ...health, workingTitle: 'BH' },
        classNames: ['Adult'],
      }),
    ).toEqual([]);
  });

  it('admits a genuinely titled dog to Working', () => {
    expect(
      svEntryMissingRequirements({
        dog: fullDog,
        svProfile: { ...health, workingTitle: 'IGP1' },
        classNames: ['Working'],
      }),
    ).toEqual([]);
  });
});
