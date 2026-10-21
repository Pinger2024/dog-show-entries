/**
 * Regional (SV/WUSV) charging invariants — the property fortress around
 * `computeRegionalOrderFees`, mirroring fee-calc-invariants.test.ts for the RKC
 * engine. Existing regional-fee-calc.test.ts covers hand-picked examples; this
 * asserts properties that must hold for EVERY input, across a matrix of order
 * shapes × pricing contexts, so a future change can't silently misprice a
 * combination nobody wrote a bespoke test for.
 *
 * Money is sacred: don't weaken an assertion to make a change pass — fix the
 * engine (or the regional edit path in entries.ts that now shares it).
 */
import { describe, it, expect } from 'vitest';
import {
  computeRegionalOrderFees,
  type RegionalFeeContext,
  type RegionalDogEntryInput,
  type RegionalOrderFeeResult,
} from '../regional-fee-calc';

// BRG-style scale with a distinct member column (pence).
const TIERS = [
  { standardPence: 2000, memberPence: 1700 }, // 1st
  { standardPence: 2000, memberPence: 1700 }, // 2nd
  { standardPence: 1600, memberPence: 1100 }, // 3rd
  { standardPence: 0, memberPence: 0 }, // 4th+
];
const JH_FEE = 300; // £3
const BABY = 1000; // £10 flat Baby Puppy (priced away from the £20 1st tier)

const NON_MEMBER: RegionalFeeContext = {
  tiers: TIERS, isMember: false, firstTimeExhibitor: false, firstTimeFeePence: 0, juniorHandlerFeePence: JH_FEE,
};
const MEMBER: RegionalFeeContext = { ...NON_MEMBER, isMember: true };
const FIRST_TIME: RegionalFeeContext = { ...NON_MEMBER, firstTimeExhibitor: true, firstTimeFeePence: 0 };
const FIRST_TIME_PAID: RegionalFeeContext = { ...NON_MEMBER, firstTimeExhibitor: true, firstTimeFeePence: 500 };
const EMPTY_TIERS: RegionalFeeContext = { ...NON_MEMBER, tiers: [] };

const CONTEXTS: { name: string; ctx: RegionalFeeContext }[] = [
  { name: 'non-member', ctx: NON_MEMBER },
  { name: 'member', ctx: MEMBER },
  { name: 'first-time (free first dog)', ctx: FIRST_TIME },
  { name: 'first-time (paid first dog)', ctx: FIRST_TIME_PAID },
  { name: 'empty tier schedule', ctx: EMPTY_TIERS },
];

const std = (key: string): RegionalDogEntryInput => ({ key, kind: 'standard' });
const jh = (key: string): RegionalDogEntryInput => ({ key, kind: 'junior_handler' });
const baby = (key: string, fee = BABY): RegionalDogEntryInput => ({ key, kind: 'standard', flatFeePence: fee });

const SHAPES: { name: string; entries: RegionalDogEntryInput[] }[] = [
  { name: '1 std', entries: [std('a')] },
  { name: '2 std', entries: [std('a'), std('b')] },
  { name: '3 std', entries: [std('a'), std('b'), std('c')] },
  { name: '4 std (4th free)', entries: [std('a'), std('b'), std('c'), std('d')] },
  { name: '6 std (last tier repeats)', entries: [std('a'), std('b'), std('c'), std('d'), std('e'), std('f')] },
  { name: '3 std + JH', entries: [std('a'), std('b'), std('c'), jh('j')] },
  { name: 'JH only', entries: [jh('j')] },
  { name: 'baby puppy only', entries: [baby('bp')] },
  { name: '3 std + baby puppy', entries: [std('a'), std('b'), std('c'), baby('bp')] },
  { name: 'baby puppy among dogs (order-independent)', entries: [std('a'), baby('bp'), std('b'), std('c')] },
  { name: 'two baby puppies', entries: [std('a'), baby('b1'), baby('b2')] },
  { name: 'mixed: std, baby, JH, std', entries: [std('a'), baby('bp'), jh('j'), std('b')] },
];

function countPaying(entries: RegionalDogEntryInput[]): number {
  return entries.filter((e) => e.kind === 'standard' && e.flatFeePence == null).length;
}

function assertInvariants(entries: RegionalDogEntryInput[], ctx: RegionalFeeContext, r: RegionalOrderFeeResult) {
  // (1) Order total is exactly the sum of per-entry fees.
  expect(r.entriesTotal).toBe(r.perEntry.reduce((s, e) => s + e.fee, 0));

  for (const e of r.perEntry) {
    const src = entries.find((x) => x.key === e.key)!;
    // (2) Each entry's single per-class fee equals its fee (regional = one class).
    expect(e.perClassFees.reduce((s, f) => s + f, 0)).toBe(e.fee);
    // (3) No negative money.
    expect(e.fee).toBeGreaterThanOrEqual(0);
    // (4) JH and flat (Baby Puppy) entries NEVER consume a tier position.
    if (src.kind === 'junior_handler') {
      expect(e.position).toBe(0);
      expect(e.fee).toBe(ctx.juniorHandlerFeePence ?? 0);
    }
    if (src.kind === 'standard' && src.flatFeePence != null) {
      expect(e.position).toBe(0);
      // (5) A flat class pays the cheaper of its flat fee or its notional slot.
      expect(e.fee).toBeLessThanOrEqual(src.flatFeePence);
    }
  }

  // (6) payingDogCount = distinct standard, non-flat dogs.
  expect(r.payingDogCount).toBe(countPaying(entries));
}

describe('regional charging invariants — full matrix (shape × context)', () => {
  for (const { name: cname, ctx } of CONTEXTS) {
    for (const { name: sname, entries } of SHAPES) {
      it(`${sname} @ ${cname}`, () => {
        const r = computeRegionalOrderFees(entries, ctx);
        assertInvariants(entries, ctx, r);
      });
    }
  }
});

describe('regional invariants — a JH or Baby Puppy never shifts a paying dog', () => {
  const bases = [
    { name: '2 std', entries: [std('a'), std('b')] },
    { name: '3 std', entries: [std('a'), std('b'), std('c')] },
  ];
  for (const ctx of [NON_MEMBER, MEMBER]) {
    const label = ctx.isMember ? 'member' : 'non-member';
    for (const base of bases) {
      it(`adding a JH leaves every paying dog's fee + the count unchanged (${base.name} @ ${label})`, () => {
        const before = computeRegionalOrderFees(base.entries, ctx);
        const after = computeRegionalOrderFees([...base.entries, jh('jrider')], ctx);
        expect(after.payingDogCount).toBe(before.payingDogCount);
        for (const e of before.perEntry) {
          expect(after.perEntry.find((x) => x.key === e.key)!.fee).toBe(e.fee);
        }
        expect(after.entriesTotal).toBe(before.entriesTotal + (ctx.juniorHandlerFeePence ?? 0));
      });

      it(`adding a Baby Puppy leaves every paying dog's fee + the count unchanged (${base.name} @ ${label})`, () => {
        const before = computeRegionalOrderFees(base.entries, ctx);
        const after = computeRegionalOrderFees([...base.entries, baby('bprider')], ctx);
        expect(after.payingDogCount).toBe(before.payingDogCount);
        for (const e of before.perEntry) {
          expect(after.perEntry.find((x) => x.key === e.key)!.fee).toBe(e.fee);
        }
      });
    }
  }
});

describe('regional invariants — member never dearer than non-member', () => {
  for (const { name, entries } of SHAPES) {
    it(`${name}`, () => {
      const nonMem = computeRegionalOrderFees(entries, NON_MEMBER).entriesTotal;
      const mem = computeRegionalOrderFees(entries, MEMBER).entriesTotal;
      expect(mem).toBeLessThanOrEqual(nonMem);
    });
  }
});

describe('regional invariants — first-time frees only the first standard dog', () => {
  it('a first-timer with 3 dogs pays free + 2nd + 3rd, not all free', () => {
    const r = computeRegionalOrderFees([std('a'), std('b'), std('c')], FIRST_TIME);
    const byPos = r.perEntry.filter((e) => e.position > 0).sort((a, b) => a.position - b.position);
    expect(byPos[0].fee).toBe(0); // 1st free
    expect(byPos[1].fee).toBe(2000); // 2nd normal
    expect(byPos[2].fee).toBe(1600); // 3rd normal
    expect(r.entriesTotal).toBe(0 + 2000 + 1600);
  });

  it('the first-time rate applies to the first dog even at a non-zero fee', () => {
    const r = computeRegionalOrderFees([std('a'), std('b')], FIRST_TIME_PAID);
    const byPos = r.perEntry.sort((a, b) => a.position - b.position);
    expect(byPos[0].fee).toBe(500); // configurable first-time fee
    expect(byPos[1].fee).toBe(2000); // 2nd normal
  });
});

describe('regional charging — golden totals (exact pence)', () => {
  const cases: [string, RegionalDogEntryInput[], RegionalFeeContext, number][] = [
    ['1 dog', [std('a')], NON_MEMBER, 2000],
    ['3 dogs (BRG package)', [std('a'), std('b'), std('c')], NON_MEMBER, 5600],
    ['3 member dogs', [std('a'), std('b'), std('c')], MEMBER, 1700 + 1700 + 1100],
    ['4 dogs — 4th free', [std('a'), std('b'), std('c'), std('d')], NON_MEMBER, 5600],
    ['3 dogs + baby puppy free-rides the 4th slot', [std('a'), std('b'), std('c'), baby('bp')], NON_MEMBER, 5600 + 0],
    ['baby puppy alone pays its flat fee', [baby('bp')], NON_MEMBER, BABY],
    ['baby puppy before 3 dogs still £56 + £10 (2 paid slots left over the baby)', [baby('bp'), std('a'), std('b')], NON_MEMBER, 2000 + 2000 + Math.min(BABY, 1600)],
    ['3 dogs + JH', [std('a'), std('b'), std('c'), jh('j')], NON_MEMBER, 5600 + JH_FEE],
  ];
  for (const [name, entries, ctx, expected] of cases) {
    it(`${name} = ${expected}p`, () => {
      expect(computeRegionalOrderFees(entries, ctx).entriesTotal).toBe(expected);
    });
  }
});
