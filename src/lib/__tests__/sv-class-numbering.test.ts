import { describe, it, expect } from 'vitest';
import { buildClassLabelMap, buildSvClassNumbering, canonicalSvClassOrder, SV_AGE_ORDER } from '../class-labels';

/**
 * SV/WUSV regional class numbering (Amanda 2026-05-28; coat-letter order
 * flipped by the regional groups 2026-08-11).
 *
 * One numbered class per (age × sex), bitch before dog, Baby Puppy first and
 * INCLUDED. Coat is an a/b sub-letter (a = Long Coat, b = Short/Stock Coat —
 * previously stock was 'a', flipped 2026-08-11). Numbering is derived from
 * the rows present, so deleting an age renumbers everything below it. The
 * schedule classification, catalogue classification, and catalogue entry
 * listing all consume this single source.
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
    const m = buildClassLabelMap(fullCard, 'wusv');
    expect(m.get('bp-b-l')).toBe('1a'); // Baby Puppy Bitch, Long
    expect(m.get('bp-b-s')).toBe('1b'); // Baby Puppy Bitch, Short/Stock
    expect(m.get('bp-d-l')).toBe('2a'); // Baby Puppy Dog, Long
    expect(m.get('bp-d-s')).toBe('2b'); // Baby Puppy Dog, Short/Stock
    expect(m.get('mp-b-l')).toBe('3a'); // Minor Puppy Bitch, Long
  });

  it('renumbers so Minor Puppy becomes class 1 when Baby Puppy is deleted', () => {
    const noBaby = fullCard.filter((c) => !c.id.startsWith('bp-'));
    const m = buildClassLabelMap(noBaby, 'wusv');
    expect(m.get('mp-b-l')).toBe('1a');
    expect(m.get('mp-b-s')).toBe('1b');
    expect(m.get('mp-d-l')).toBe('2a');
    expect(m.get('mp-d-s')).toBe('2b');
  });

  it('omits the coat letter when a club offers only one coat for an age/sex', () => {
    const stockOnly = [
      mk('j-b-s', 'SV Junior', 'bitch', 'stock'),
      mk('j-d-s', 'SV Junior', 'dog', 'stock'),
    ];
    const m = buildClassLabelMap(stockOnly, 'wusv');
    expect(m.get('j-b-s')).toBe('1');
    expect(m.get('j-d-s')).toBe('2');
  });

  it('leaves RKC (non-sv_age) classes on their stored classNumber', () => {
    const rkc = [
      { id: 'r1', classNumber: 1, sortOrder: 0, classDefinition: { type: 'age', name: 'Puppy' } },
      { id: 'r2', classNumber: 2, sortOrder: 1, classDefinition: { type: 'age', name: 'Junior' } },
    ];
    const m = buildClassLabelMap(rkc, 'wusv');
    expect(m.get('r1')).toBe('1');
    expect(m.get('r2')).toBe('2');
  });

  // Mandy, South Western GSD, 2026-07-27: there is exactly ONE sv_age-typed
  // "Baby Puppy" class definition in the DB, shared by both RKC and WUSV
  // shows. On an RKC show it must NOT be relabelled with the SV
  // bitch-before-dog convention — it must keep its stored classNumber, same
  // as any other RKC breed class. This is Mandy's exact bug: without the
  // showRuleset gate, Baby Puppy Dog (real classNumber 1) rendered as "2"
  // and Baby Puppy Bitch (real classNumber 12) rendered as "1", colliding
  // with the real class 2 (Minor Puppy Dog).
  it('an RKC show with an sv_age Baby Puppy pair keeps its stored classNumbers, not SV labels', () => {
    const rkcBabyPuppy = [
      {
        id: 'bp-dog',
        classNumber: 1,
        sortOrder: 0,
        sex: 'dog',
        svCoatType: null,
        classDefinition: { type: 'sv_age', name: 'Baby Puppy' },
      },
      {
        id: 'bp-bitch',
        classNumber: 12,
        sortOrder: 1,
        sex: 'bitch',
        svCoatType: null,
        classDefinition: { type: 'sv_age', name: 'Baby Puppy' },
      },
    ];
    const m = buildClassLabelMap(rkcBabyPuppy, 'rkc');
    expect(m.get('bp-dog')).toBe('1');
    expect(m.get('bp-bitch')).toBe('12');
  });

  it('the same Baby Puppy pair still gets SV bitch-before-dog labelling on a wusv show', () => {
    const wusvBabyPuppy = [
      {
        id: 'bp-dog',
        classNumber: 1,
        sortOrder: 0,
        sex: 'dog',
        svCoatType: null,
        classDefinition: { type: 'sv_age', name: 'Baby Puppy' },
      },
      {
        id: 'bp-bitch',
        classNumber: 12,
        sortOrder: 1,
        sex: 'bitch',
        svCoatType: null,
        classDefinition: { type: 'sv_age', name: 'Baby Puppy' },
      },
    ];
    const m = buildClassLabelMap(wusvBabyPuppy, 'wusv');
    // Bitch before dog (Amanda 2026-05-28) — bitch gets the lower number.
    expect(m.get('bp-bitch')).toBe('1');
    expect(m.get('bp-dog')).toBe('2');
  });

  it('undefined/null showRuleset behaves like RKC — stored numbers, no SV override', () => {
    const babyPuppy = [
      {
        id: 'bp-dog',
        classNumber: 1,
        sortOrder: 0,
        sex: 'dog',
        svCoatType: null,
        classDefinition: { type: 'sv_age', name: 'Baby Puppy' },
      },
      {
        id: 'bp-bitch',
        classNumber: 12,
        sortOrder: 1,
        sex: 'bitch',
        svCoatType: null,
        classDefinition: { type: 'sv_age', name: 'Baby Puppy' },
      },
    ];
    const mUndefined = buildClassLabelMap(babyPuppy);
    expect(mUndefined.get('bp-dog')).toBe('1');
    expect(mUndefined.get('bp-bitch')).toBe('12');

    const mNull = buildClassLabelMap(babyPuppy, null);
    expect(mNull.get('bp-dog')).toBe('1');
    expect(mNull.get('bp-bitch')).toBe('12');
  });

  it('Junior Handler and Special Award lettering is unaffected by ruleset', () => {
    const mixed = [
      { id: 'jh-1', classNumber: null, sortOrder: 0, classDefinition: { type: 'junior_handler', name: 'Junior Handling' } },
      { id: 'jh-2', classNumber: null, sortOrder: 1, classDefinition: { type: 'junior_handler', name: 'Junior Handling' } },
      { id: 'sac-1', classNumber: null, sortOrder: 0, classDefinition: { type: 'special', name: 'Special Award Class 1' } },
      { id: 'sac-2', classNumber: null, sortOrder: 1, classDefinition: { type: 'special', name: 'Special Award Class 2' } },
    ];
    for (const ruleset of [undefined, null, 'rkc', 'wusv']) {
      const m = buildClassLabelMap(mixed, ruleset);
      expect(m.get('jh-1')).toBe('JHA');
      expect(m.get('jh-2')).toBe('JHB');
      expect(m.get('sac-1')).toBe('A');
      expect(m.get('sac-2')).toBe('B');
    }
  });
});

describe('buildSvClassNumbering — structured output', () => {
  it('shares one number across both coats of an age/sex', () => {
    const m = buildSvClassNumbering(fullCard, 'wusv');
    expect(m.get('bp-b-s')?.number).toBe(1);
    expect(m.get('bp-b-l')?.number).toBe(1); // same number, different coat letter
    expect(m.get('bp-b-l')?.coatLetter).toBe('a'); // Long Coat is 'a'
    expect(m.get('bp-b-s')?.coatLetter).toBe('b'); // Short/Stock Coat is 'b'
  });

  it('orders bitch before dog within an age', () => {
    const m = buildSvClassNumbering(fullCard, 'wusv');
    expect(m.get('bp-b-s')?.number).toBeLessThan(m.get('bp-d-s')!.number);
  });

  it('returns an empty map when the show is not run under WUSV rules', () => {
    expect(buildSvClassNumbering(fullCard, 'rkc').size).toBe(0);
    expect(buildSvClassNumbering(fullCard, null).size).toBe(0);
    expect(buildSvClassNumbering(fullCard).size).toBe(0);
  });
});

describe('canonicalSvClassOrder — repair-tool ordering', () => {
  type OrderRow = {
    id: string;
    sex?: string | null;
    svCoatType?: 'stock' | 'long_stock' | null;
    classDefinition?: { type?: string | null; name?: string | null } | null;
  };

  const svAge = (
    id: string,
    age: string,
    sex: 'dog' | 'bitch',
    coat: 'stock' | 'long_stock',
  ): OrderRow => ({ id, sex, svCoatType: coat, classDefinition: { type: 'sv_age', name: age } });

  const jh = (id: string): OrderRow => ({
    id,
    sex: null,
    svCoatType: null,
    classDefinition: { type: 'junior_handler', name: 'Junior Handling' },
  });

  // The canonical sequence: bitch before dog, long coat before stock,
  // within SV_AGE_ORDER — this is what a freshly-created wusv show gets.
  const canonicalIds: string[] = [];
  for (const age of SV_AGE_ORDER) {
    canonicalIds.push(`b-${age}-long`, `b-${age}-stock`, `d-${age}-long`, `d-${age}-stock`);
  }
  canonicalIds.push('jh-1', 'jh-2');

  function buildRows(order: string[]): OrderRow[] {
    return order.map((id) => {
      if (id.startsWith('jh-')) return jh(id);
      const [sexLetter, age, coatTag] = id.split('-') as [string, string, 'long' | 'stock'];
      const coat: 'stock' | 'long_stock' = coatTag === 'long' ? 'long_stock' : 'stock';
      return svAge(id, age, sexLetter === 'b' ? 'bitch' : 'dog', coat);
    });
  }

  it('reorders the Midlands shape (all dog classes 1–14, then all bitch classes 15–28, then 2 JH) into canonical order', () => {
    // Midlands Region GSD Group's stored order, created 8 Aug 2026 — before
    // the 11 Aug cutover to the bitch-before-dog / long-before-stock
    // convention (Mandy 2026-09-04).
    const dogIds = SV_AGE_ORDER.flatMap((age) => [`d-${age}-long`, `d-${age}-stock`]);
    const bitchIds = SV_AGE_ORDER.flatMap((age) => [`b-${age}-long`, `b-${age}-stock`]);
    const midlandsOrder = [...dogIds, ...bitchIds, 'jh-1', 'jh-2'];
    expect(midlandsOrder).toHaveLength(30); // 7 ages × 2 coats × 2 sexes + 2 JH = 30

    const rows = buildRows(midlandsOrder);
    const sorted = canonicalSvClassOrder(rows);

    expect(sorted.map((r) => r.id)).toEqual(canonicalIds);
  });

  it('leaves an already-canonical order unchanged', () => {
    const rows = buildRows(canonicalIds);
    const sorted = canonicalSvClassOrder(rows);
    expect(sorted.map((r) => r.id)).toEqual(canonicalIds);
    // Not just equal by value — genuinely a no-op (same row objects, same order).
    expect(sorted).toEqual(rows);
  });

  it('keeps JH/other classes in their original relative order, appended after the sexed breed classes', () => {
    const rows: OrderRow[] = [
      jh('jh-b'),
      svAge('d-Adult-stock', 'Adult', 'dog', 'stock'),
      jh('jh-a'),
      svAge('b-Adult-long', 'Adult', 'bitch', 'long_stock'),
    ];
    const sorted = canonicalSvClassOrder(rows);
    expect(sorted.map((r) => r.id)).toEqual(['b-Adult-long', 'd-Adult-stock', 'jh-b', 'jh-a']);
  });
});
