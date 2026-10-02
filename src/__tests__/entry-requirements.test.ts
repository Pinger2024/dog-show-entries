import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { entryRequirements } from '@/lib/entry-requirements';

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

/** Everything a competitive standard entry is missing (what the gates act on). */
const gaps = (opts: Omit<Parameters<typeof entryRequirements>[0], 'entryType' | 'isNfc'>) =>
  entryRequirements({ entryType: 'standard', isNfc: false, ...opts }).all;

describe('entryRequirementsMissing — standard RKC show', () => {
  it('wants only the pedigree the catalogue prints', () => {
    const missing = gaps({
      dog: { sireName: null, damName: 'Dam', breederName: 'Breeder', colour: 'Black' },
      classNames: ['Open'],
      showRuleset: 'rkc',
    });
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatch(/sire/i);
  });

  it('does NOT demand the regional fields on a standard show', () => {
    const missing = gaps({
      dog: { sireName: 'S', damName: 'D', breederName: 'B', colour: 'Black' },
      classNames: ['Open'],
      showRuleset: 'rkc',
    });
    expect(missing).toEqual([]);
  });
});

describe('entryRequirementsMissing — regional (wusv)', () => {
  it('passes a complete dog', () => {
    const missing = gaps({
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
    const missing = gaps({
      dog: { ...completeRegionalDog, [field]: null },
      svProfile: healthyProfile,
      classNames: ['Adult'],
      showRuleset: 'wusv',
    });
    expect(missing.join(' | ')).toMatch(pattern);
  });

  it('still catches the ones the server always caught', () => {
    const missing = gaps({
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
    const below = gaps({
      dog: completeRegionalDog,
      svProfile: {},
      classNames: ['Minor Puppy'],
      showRuleset: 'wusv',
    });
    expect(below).toEqual([]);

    const above = gaps({
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
    const working = gaps({
      dog: completeRegionalDog,
      svProfile: healthyProfile,
      classNames: ['Working'],
      showRuleset: 'wusv',
    });
    expect(working).toContain('Working title');

    const adult = gaps({
      dog: completeRegionalDog,
      svProfile: healthyProfile,
      classNames: ['Adult'],
      showRuleset: 'wusv',
    });
    expect(adult).not.toContain('Working title');
  });

  // BH/AD/WB are recorded qualifications, not working ones (Mandy 2026-08-19).
  it('does not accept BH as a working title', () => {
    const missing = gaps({
      dog: completeRegionalDog,
      svProfile: { ...healthyProfile, workingTitle: 'BH' },
      classNames: ['Working'],
      showRuleset: 'wusv',
    });
    expect(missing).toContain('Working title');
  });

  it('reports each missing field once, not twice', () => {
    const missing = gaps({
      dog: { ...completeRegionalDog, sireName: null, sireRegistrationNumber: null },
      svProfile: healthyProfile,
      classNames: ['Adult'],
      showRuleset: 'wusv',
    });
    expect(new Set(missing).size).toBe(missing.length);
    // The SV line covers the sire; the plain catalogue line would repeat it.
    expect(missing).toEqual(["Sire's name and registration number"]);
  });

  it('keeps the colour, which no SV line covers', () => {
    const r = entryRequirements({
      dog: { ...completeRegionalDog, colour: null },
      svProfile: healthyProfile,
      classNames: ['Adult'],
      showRuleset: 'wusv',
      entryType: 'standard',
      isNfc: false,
    });
    expect(r.sv).toEqual([]);
    expect(r.pedigree).toEqual(['the colour']);
    expect(r.all).toEqual(['the colour']);
  });
});

/**
 * Which rules apply to which entry is decided HERE and nowhere else. Until 29
 * Sept 2026 the wizard, checkout, entries.create, the manual entry and the
 * entries list each decided it for themselves (`showRuleset: isNfc ? null …`).
 */
describe('entryRequirements — what applies to which entry', () => {
  const base = { svProfile: {}, classNames: ['SV Yearling'], showRuleset: 'wusv' as const };

  it('an NFC dog on a regional needs only the catalogue pedigree', () => {
    const r = entryRequirements({ ...base, dog: { colour: 'Black' }, entryType: 'standard', isNfc: true });
    expect(r.sv).toEqual([]);
    expect(r.pedigree).toEqual(["the sire's name", "the dam's name", "the breeder's name"]);
    expect(r.all).toEqual(r.pedigree);
  });

  it('a Junior Handler entry needs nothing from a dog', () => {
    const r = entryRequirements({ ...base, dog: {}, entryType: 'junior_handler', isNfc: false });
    expect(r).toEqual({ pedigree: [], sv: [], pedigreeNotInSv: [], all: [] });
  });

  it('a standard RKC entry needs only the pedigree, whatever the class', () => {
    const r = entryRequirements({ ...base, showRuleset: 'rkc', dog: {}, entryType: 'standard', isNfc: false });
    expect(r.sv).toEqual([]);
    expect(r.all).toHaveLength(4);
  });
});

describe('entry requirements — one owner guard', () => {
  const SRC = join(__dirname, '..');
  const filesMentioning = (needle: string) =>
    execFileSync('git', ['grep', '-l', needle, '--', 'src', ':!src/__tests__', ':!src/**/__tests__/*'], {
      cwd: join(SRC, '..'),
    })
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean);

  it('only entryRequirements composes the SV summary and the health gate', () => {
    expect(filesMentioning('svMissingRequirements(')).toEqual(['src/lib/entry-requirements.ts', 'src/lib/sv-entry-readiness.ts']);
    expect(filesMentioning('SV_HEALTH_FROM_CLASSES')).toEqual(['src/lib/entry-requirements.ts', 'src/lib/sv-entry-validation.ts']);
  });

  it('the regional field messages are declared once — no page keeps its own list', () => {
    expect(filesMentioning('is required for regional shows')).toEqual(['src/lib/sv-entry-readiness.ts']);
  });

  it('nobody decides applicability by nulling the ruleset for NFC any more', () => {
    for (const f of ['server/trpc/routers/entries.ts', 'server/trpc/routers/secretary.ts']) {
      expect(readFileSync(join(SRC, f), 'utf8')).not.toMatch(/isNfc \? null/);
    }
  });
});
