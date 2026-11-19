import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CATALOGUE_NUMBER_RULE,
  catalogueNumberRule,
  describeCatalogueNumberRule,
  expectedCatalogueNumbers,
  nextCatalogueNumber,
  parseCatalogueNumberRule,
} from '@/lib/catalogue-number-rule';

// Mandy, 20 Oct 2026: "can we start the catalogue numbering for the current
// live regional at 141 and can we miss out 197, 212 and 216 as those are
// missing" — the club's bibs run from 141 and three of them are lost.
const BIBS = { start: 141, skip: [197, 212, 216] };

describe('catalogue number rule', () => {
  it('a show with nothing set numbers 1, 2, 3 …', () => {
    expect(catalogueNumberRule({})).toEqual(DEFAULT_CATALOGUE_NUMBER_RULE);
    expect(catalogueNumberRule({ catalogueNumberStart: null, catalogueNumberSkip: null })).toEqual({ start: 1, skip: [] });
    expect(expectedCatalogueNumbers(DEFAULT_CATALOGUE_NUMBER_RULE, 4)).toEqual([1, 2, 3, 4]);
  });

  it('starts at the first number and steps over the ones left out', () => {
    const numbers = expectedCatalogueNumbers(BIBS, 78);
    expect(numbers[0]).toBe(141);
    expect(numbers).not.toContain(197);
    expect(numbers).not.toContain(212);
    expect(numbers).not.toContain(216);
    expect(numbers.slice(55, 58)).toEqual([196, 198, 199]);
    // 141–218 holds 75 usable bibs; the 76th dog carries on at 219.
    expect(numbers[74]).toBe(218);
    expect(numbers[75]).toBe(219);
    expect(new Set(numbers).size).toBe(78);
  });

  it('the next number after a given one skips too (a late entry on a locked show)', () => {
    expect(nextCatalogueNumber(BIBS, 196)).toBe(198);
    expect(nextCatalogueNumber(BIBS, 211)).toBe(213);
    expect(nextCatalogueNumber(BIBS, 215)).toBe(217);
    // Nothing numbered yet, or numbers below the start: begin at the start.
    expect(nextCatalogueNumber(BIBS, 0)).toBe(141);
    expect(nextCatalogueNumber(BIBS, 17)).toBe(141);
    expect(nextCatalogueNumber(DEFAULT_CATALOGUE_NUMBER_RULE, 0)).toBe(1);
    expect(nextCatalogueNumber(DEFAULT_CATALOGUE_NUMBER_RULE, 9)).toBe(10);
  });

  it('reads what a secretary types: commas, spaces, repeats, and numbers below the start', () => {
    expect(parseCatalogueNumberRule({ start: '141', skip: '197, 212 216' })).toEqual({ ok: true, rule: BIBS });
    expect(parseCatalogueNumberRule({ start: ' 141 ', skip: '216,197,,212, 197' })).toEqual({ ok: true, rule: BIBS });
    expect(parseCatalogueNumberRule({ start: '141', skip: '' })).toEqual({ ok: true, rule: { start: 141, skip: [] } });
    // A number below the start can never be issued, so it is simply dropped.
    expect(parseCatalogueNumberRule({ start: '141', skip: '5, 197' })).toEqual({ ok: true, rule: { start: 141, skip: [197] } });
  });

  it('refuses what it cannot number with', () => {
    for (const start of ['', '0', '-3', '1.5', 'abc', '100000']) {
      expect(parseCatalogueNumberRule({ start, skip: '' }).ok, `start "${start}"`).toBe(false);
    }
    expect(parseCatalogueNumberRule({ start: '141', skip: '197, twelve' })).toMatchObject({ ok: false });
    expect(parseCatalogueNumberRule({ start: '141', skip: '197.5' })).toMatchObject({ ok: false });
    const tooMany = Array.from({ length: 201 }, (_, i) => 200 + i).join(',');
    expect(parseCatalogueNumberRule({ start: '141', skip: tooMany })).toMatchObject({ ok: false });
  });

  it('says it in plain words', () => {
    expect(describeCatalogueNumberRule(DEFAULT_CATALOGUE_NUMBER_RULE)).toBe('Numbers start at 1.');
    expect(describeCatalogueNumberRule({ start: 141, skip: [] })).toBe('Numbers start at 141.');
    expect(describeCatalogueNumberRule({ start: 141, skip: [197] })).toBe('Numbers start at 141, leaving out 197.');
    expect(describeCatalogueNumberRule(BIBS)).toBe('Numbers start at 141, leaving out 197, 212 and 216.');
  });
});
