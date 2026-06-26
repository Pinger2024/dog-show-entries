import { describe, it, expect } from 'vitest';
import {
  svWorkingClassAllowed,
  svMissingRequirements,
  hasWorkingTitle,
} from '@/lib/sv-entry-readiness';

describe('svWorkingClassAllowed', () => {
  it('hides the Working class for a dog with no working title', () => {
    expect(svWorkingClassAllowed('Working', false)).toBe(false);
  });
  it('shows the Working class for a dog that has a working title', () => {
    expect(svWorkingClassAllowed('Working', true)).toBe(true);
  });
  it('never restricts non-Working classes', () => {
    expect(svWorkingClassAllowed('Adult', false)).toBe(true);
    expect(svWorkingClassAllowed('SV Yearling', false)).toBe(true);
    expect(svWorkingClassAllowed('Baby Puppy', false)).toBe(true);
  });
  it('is case/space-insensitive on the class name', () => {
    expect(svWorkingClassAllowed('  working ', false)).toBe(false);
  });
});

describe('hasWorkingTitle', () => {
  it('treats blank / null / whitespace as no title', () => {
    expect(hasWorkingTitle(null)).toBe(false);
    expect(hasWorkingTitle(undefined)).toBe(false);
    expect(hasWorkingTitle('')).toBe(false);
    expect(hasWorkingTitle('   ')).toBe(false);
  });
  it('treats a real title as present', () => {
    expect(hasWorkingTitle('IGP1')).toBe(true);
  });
});

describe('svMissingRequirements', () => {
  const full = { hipGrade: 'a1', elbowGrade: '0', dna: 'recorded' };

  it('requires coat type even when health is not yet required', () => {
    expect(svMissingRequirements({ coatType: null, healthRequired: false, profile: full }))
      .toEqual(['Coat type (Standard or Long Coat)']);
  });

  it('lists every missing health item for a health-gated class', () => {
    expect(svMissingRequirements({ coatType: 'stock', healthRequired: true, profile: null }))
      .toEqual(['Hip score', 'Elbow score', 'DNA recording']);
  });

  it('counts "not_required" hip/elbow as still missing', () => {
    expect(svMissingRequirements({
      coatType: 'stock', healthRequired: true,
      profile: { hipGrade: 'not_required', elbowGrade: '0', dna: 'recorded' },
    })).toEqual(['Hip score']);
  });

  it('is empty when coat type is set and (no health required)', () => {
    expect(svMissingRequirements({ coatType: 'long_stock', healthRequired: false, profile: null }))
      .toEqual([]);
  });

  it('is empty when coat type is set and all health data is on file', () => {
    expect(svMissingRequirements({ coatType: 'stock', healthRequired: true, profile: full }))
      .toEqual([]);
  });

  it('combines coat + health when both are outstanding', () => {
    expect(svMissingRequirements({ coatType: null, healthRequired: true, profile: { dna: 'recorded' } }))
      .toEqual(['Coat type (Standard or Long Coat)', 'Hip score', 'Elbow score']);
  });
});

describe('svMissingRequirements — pedigree (Mandy 2026-06-26)', () => {
  const completePedigree = {
    sireName: 'Quartz vom Haus', sireRegistrationNumber: 'SZ1234',
    damName: 'Bella vom Hof', damRegistrationNumber: 'SZ5678',
    breederName: 'A. Smith', breederCity: 'Lowestoft', breederPostcode: 'NR32 3AL',
  };

  it('flags sire, dam and breeder when nothing is filled in', () => {
    expect(svMissingRequirements({
      coatType: 'stock', healthRequired: false, profile: null, pedigree: {},
    })).toEqual([
      "Sire's name and registration number",
      "Dam's name and registration number",
      'Breeder details (name, town and postcode)',
    ]);
  });

  it('requires the registration number, not just the name', () => {
    expect(svMissingRequirements({
      coatType: 'stock', healthRequired: false,
      profile: null,
      pedigree: { ...completePedigree, sireRegistrationNumber: '  ' },
    })).toEqual(["Sire's name and registration number"]);
  });

  it('requires the full breeder line (town + postcode, not just name)', () => {
    expect(svMissingRequirements({
      coatType: 'stock', healthRequired: false,
      profile: null,
      pedigree: { ...completePedigree, breederPostcode: null },
    })).toEqual(['Breeder details (name, town and postcode)']);
  });

  it('passes when the whole pedigree is complete', () => {
    expect(svMissingRequirements({
      coatType: 'stock', healthRequired: false, profile: null, pedigree: completePedigree,
    })).toEqual([]);
  });

  it('does not check pedigree when none is supplied (back-compat)', () => {
    expect(svMissingRequirements({ coatType: 'stock', healthRequired: false, profile: null }))
      .toEqual([]);
  });

  it('orders the one warning: coat → sire → dam → breeder → health', () => {
    expect(svMissingRequirements({
      coatType: null, healthRequired: true, profile: null, pedigree: {},
    })).toEqual([
      'Coat type (Standard or Long Coat)',
      "Sire's name and registration number",
      "Dam's name and registration number",
      'Breeder details (name, town and postcode)',
      'Hip score', 'Elbow score', 'DNA recording',
    ]);
  });
});
