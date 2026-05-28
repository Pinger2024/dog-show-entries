import { describe, it, expect } from 'vitest';
import { buildClassLabelMap, buildSvClassNumbering } from '../class-labels';

/**
 * SV/WUSV regional class numbering (Amanda 2026-05-28).
 *
 * One numbered class per (age × sex), bitch before dog, Baby Puppy first and
 * INCLUDED. Coat is an a/b sub-letter (a = Standard/Stock, b = Long Stock).
 * Numbering is derived from the rows present, so deleting an age renumbers
 * everything below it. The schedule classification, catalogue classification,
 * and catalogue entry listing all consume this single source.
 */

type Row = {
  id: string;
  classNumber: number | null;
  sortOrder: number;
  sex: string;
  svCoatType: 'stock' | 'long_stock';
  classDefinition: { type: string; name: string };
};

const mk = (id: string, name: string, sex: string, coat: 'stock' | 'long_stock'): Row => ({
  id,
  classNumber: null,
  sortOrder: 0,
  sex,
  svCoatType: coat,
  classDefinition: { type: 'sv_age', name },
});

const fullCard: Row[] = [
  mk('bp-b-s', 'Baby Puppy', 'bitch', 'stock'),
  mk('bp-b-l', 'Baby Puppy', 'bitch', 'long_stock'),
  mk('bp-d-s', 'Baby Puppy', 'dog', 'stock'),
  mk('bp-d-l', 'Baby Puppy', 'dog', 'long_stock'),
  mk('mp-b-s', 'SV Minor Puppy', 'bitch', 'stock'),
  mk('mp-b-l', 'SV Minor Puppy', 'bitch', 'long_stock'),
  mk('mp-d-s', 'SV Minor Puppy', 'dog', 'stock'),
  mk('mp-d-l', 'SV Minor Puppy', 'dog', 'long_stock'),
];

describe('buildClassLabelMap — SV regional numbering', () => {
  it('numbers Baby Puppy as class 1 (bitch) and 2 (dog) with a/b coat letters', () => {
    const m = buildClassLabelMap(fullCard);
    expect(m.get('bp-b-s')).toBe('1a'); // Baby Puppy Bitch, Standard
    expect(m.get('bp-b-l')).toBe('1b'); // Baby Puppy Bitch, Long
    expect(m.get('bp-d-s')).toBe('2a'); // Baby Puppy Dog, Standard
    expect(m.get('bp-d-l')).toBe('2b'); // Baby Puppy Dog, Long
    expect(m.get('mp-b-s')).toBe('3a'); // Minor Puppy Bitch, Standard
  });

  it('renumbers so Minor Puppy becomes class 1 when Baby Puppy is deleted', () => {
    const noBaby = fullCard.filter((c) => !c.id.startsWith('bp-'));
    const m = buildClassLabelMap(noBaby);
    expect(m.get('mp-b-s')).toBe('1a');
    expect(m.get('mp-b-l')).toBe('1b');
    expect(m.get('mp-d-s')).toBe('2a');
    expect(m.get('mp-d-l')).toBe('2b');
  });

  it('omits the coat letter when a club offers only one coat for an age/sex', () => {
    const stockOnly = [
      mk('j-b-s', 'SV Junior', 'bitch', 'stock'),
      mk('j-d-s', 'SV Junior', 'dog', 'stock'),
    ];
    const m = buildClassLabelMap(stockOnly);
    expect(m.get('j-b-s')).toBe('1');
    expect(m.get('j-d-s')).toBe('2');
  });

  it('leaves RKC (non-sv_age) classes on their stored classNumber', () => {
    const rkc = [
      { id: 'r1', classNumber: 1, sortOrder: 0, classDefinition: { type: 'age', name: 'Puppy' } },
      { id: 'r2', classNumber: 2, sortOrder: 1, classDefinition: { type: 'age', name: 'Junior' } },
    ];
    const m = buildClassLabelMap(rkc);
    expect(m.get('r1')).toBe('1');
    expect(m.get('r2')).toBe('2');
  });
});

describe('buildSvClassNumbering — structured output', () => {
  it('shares one number across both coats of an age/sex', () => {
    const m = buildSvClassNumbering(fullCard);
    expect(m.get('bp-b-s')?.number).toBe(1);
    expect(m.get('bp-b-l')?.number).toBe(1); // same number, different coat letter
    expect(m.get('bp-b-s')?.coatLetter).toBe('a');
    expect(m.get('bp-b-l')?.coatLetter).toBe('b');
  });

  it('orders bitch before dog within an age', () => {
    const m = buildSvClassNumbering(fullCard);
    expect(m.get('bp-b-s')?.number).toBeLessThan(m.get('bp-d-s')!.number);
  });
});
