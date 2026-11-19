/**
 * Charging invariants — the fortress around `computeOrderFees`.
 *
 * The Special Award Class overcharge (Mandy 2026-07-19) shipped silently
 * because every existing test priced a SINGLE class type at a time — none
 * mixed a special class into a dog's entry, and the engine's interface
 * couldn't even express the distinction. See
 * research/HANDOVER-charging-hardening-2026-07-20.md.
 *
 * This file does what per-case tests can't: it drives a broad matrix of
 * (class type × member × multi-dog × ordering × count) combinations through
 * the engine and asserts a set of PROPERTIES that must hold for EVERY input.
 * A future change that breaks pricing for a combination nobody hand-wrote a
 * test for still trips one of these invariants.
 *
 * Money is sacred: if any of these fail, an exhibitor is being mischarged or
 * a club's revenue report won't reconcile. Do not weaken an assertion to make
 * a change pass — fix the engine.
 */
import { describe, it, expect } from 'vitest';
import {
  computeOrderFees,
  type FeeContext,
  type DogEntryInput,
  type OrderFeeResult,
} from '../fee-calc';

// ── Fee constants (pence) ──────────────────────────────────────────────────
const FIRST = 2000; // £20 first class
const SUBSEQUENT = 1000; // £10 same dog, extra class
const NFC_FEE = 500; // £5 not-for-competition
const JH_FEE = 300; // £3 junior handler
const SPECIAL = 300; // £3 Special Award Class own fee
const SPECIAL_B = 500; // a second special at a different own fee
const MEMBER_FIRST = 1700; // £17 member first class
const PACKAGE = 5600; // £56 multi-dog package (3+)
const MEMBER_PACKAGE = 4500; // £45 member package

// ── Context variants spanning every pricing mode ────────────────────────────
const BASE: FeeContext = {
  firstEntryFeePence: FIRST,
  subsequentEntryFeePence: SUBSEQUENT,
  nfcEntryFeePence: NFC_FEE,
  juniorHandlerFeePence: JH_FEE,
  multiDogThreshold: null,
  multiDogPackagePence: null,
  discountGroup: null,
};
const MEMBER_GROUP = { firstEntryFeePence: MEMBER_FIRST, multiDogPackagePence: MEMBER_PACKAGE };
const GROUP_NO_PACKAGE = { firstEntryFeePence: MEMBER_FIRST, multiDogPackagePence: null };

const CONTEXTS: { name: string; ctx: FeeContext }[] = [
  { name: 'plain (no multi, no group)', ctx: BASE },
  { name: 'multi-dog configured', ctx: { ...BASE, multiDogThreshold: 3, multiDogPackagePence: PACKAGE } },
  { name: 'member group, no multi', ctx: { ...BASE, discountGroup: MEMBER_GROUP } },
  { name: 'member group + multi', ctx: { ...BASE, multiDogThreshold: 3, multiDogPackagePence: PACKAGE, discountGroup: MEMBER_GROUP } },
  { name: 'member group without own package + multi', ctx: { ...BASE, multiDogThreshold: 3, multiDogPackagePence: PACKAGE, discountGroup: GROUP_NO_PACKAGE } },
  // Per-class fallback: no show-wide first fee configured.
  { name: 'first fee null (fallback to 0)', ctx: { ...BASE, firstEntryFeePence: null, subsequentEntryFeePence: null } },
];

// ── Entry-shape builders ────────────────────────────────────────────────────
const std = (key: string, classCount = 1, specialClassFees?: (number | null)[]): DogEntryInput =>
  ({ key, kind: 'standard', classCount, ...(specialClassFees ? { specialClassFees } : {}) });
const jh = (key: string): DogEntryInput => ({ key, kind: 'junior_handler', classCount: 1 });
const nfc = (key: string, classCount = 1): DogEntryInput => ({ key, kind: 'nfc', classCount });

/** A representative spread of order shapes — single/multi class, every type,
 *  specials in first / middle / last position, and multi-dog boundaries. */
const SHAPES: { name: string; entries: DogEntryInput[] }[] = [
  { name: '1 std, 1 class', entries: [std('a')] },
  { name: '1 std, 3 classes', entries: [std('a', 3)] },
  { name: '2 std (below multi threshold)', entries: [std('a'), std('b')] },
  { name: '3 std (at multi threshold)', entries: [std('a'), std('b'), std('c')] },
  { name: '5 std (above threshold)', entries: [std('a'), std('b'), std('c'), std('d'), std('e')] },
  { name: '3 std, one in 3 classes', entries: [std('a', 3), std('b'), std('c')] },
  { name: 'special only', entries: [std('a', 1, [SPECIAL])] },
  { name: 'special first, normal second', entries: [std('a', 2, [SPECIAL, null])] },
  { name: 'normal first, special second', entries: [std('a', 2, [null, SPECIAL])] },
  { name: 'normal, normal, special', entries: [std('a', 3, [null, null, SPECIAL])] },
  { name: 'two specials on one dog', entries: [std('a', 2, [SPECIAL, SPECIAL_B])] },
  { name: '3 std + special-only 4th', entries: [std('a'), std('b'), std('c'), std('a2', 1, [SPECIAL])] },
  { name: '3 std + JH + NFC', entries: [std('a'), std('b'), std('c'), jh('d'), nfc('e')] },
  { name: 'JH + NFC only', entries: [jh('a'), nfc('b')] },
  { name: 'NFC in 2 classes', entries: [nfc('a', 2)] },
  { name: 'mixed everything', entries: [std('a', 2, [null, SPECIAL]), std('b'), std('c'), jh('d'), nfc('e', 2), std('f', 1, [SPECIAL_B])] },
];

// ── The invariants every result must satisfy ────────────────────────────────
function assertInvariants(entries: DogEntryInput[], ctx: FeeContext, r: OrderFeeResult) {
  // (1) Order total is exactly the sum of per-entry fees — no money invented or lost.
  expect(r.total).toBe(r.perEntry.reduce((s, e) => s + e.fee, 0));

  for (const e of r.perEntry) {
    const src = entries.find((x) => x.key === e.key)!;

    // (2) Each entry's fee is exactly the sum of its per-class breakdown, so
    //     reports built from entry_classes.fee reconcile with entries.total_fee.
    //     (NFC with 0 classes is the one documented exception — no rows.)
    const nfcZero = src.kind === 'nfc' && src.classCount === 0;
    if (!nfcZero) {
      expect(e.fee).toBe(e.perClassFees.reduce((s, f) => s + f, 0));
    }

    // (3) No negative money, ever.
    expect(e.fee).toBeGreaterThanOrEqual(0);
    for (const f of e.perClassFees) expect(f).toBeGreaterThanOrEqual(0);

    // (4) A Special Award Class slot is ALWAYS charged its own fee — never the
    //     first/subsequent tier, never the package. This is THE regression guard.
    if (src.kind === 'standard' && src.specialClassFees) {
      for (let i = 0; i < src.classCount; i++) {
        const own = src.specialClassFees[i];
        if (own != null) expect(e.perClassFees[i]).toBe(own);
      }
    }
  }

  // (5) payingDogCount counts ONLY standard dogs that have at least one normal
  //     (non-special) class. JH, NFC and special-only dogs never count.
  const expectedPaying = entries.filter(
    (e) => e.kind === 'standard' && countRegular(e) > 0,
  ).length;
  expect(r.payingDogCount).toBe(expectedPaying);

  // (6) The multi-dog package never charges MORE than the individual firsts it
  //     replaces — savings can't be negative.
  expect(r.multiDogSavings).toBeGreaterThanOrEqual(0);
}

function countRegular(e: DogEntryInput): number {
  if (e.kind !== 'standard') return 0;
  if (!e.specialClassFees) return e.classCount;
  let n = 0;
  for (let i = 0; i < e.classCount; i++) if (e.specialClassFees[i] == null) n++;
  return n;
}

describe('charging invariants — full matrix (every shape × every context)', () => {
  for (const { name: cname, ctx } of CONTEXTS) {
    for (const { name: sname, entries } of SHAPES) {
      it(`${sname} @ ${cname}`, () => {
        const r = computeOrderFees(entries, ctx);
        assertInvariants(entries, ctx, r);
      });
    }
  }
});

// ── Differential properties: adding a "free-riding" entry must not disturb the
//    tier/package pricing of the dogs already in the order. This is exactly the
//    class of bug that hit us — a special class silently shifting the ladder. ──
describe('charging invariants — a special/JH/NFC entry never shifts tier pricing', () => {
  const multiCtx: FeeContext = { ...BASE, multiDogThreshold: 3, multiDogPackagePence: PACKAGE };

  const bases: { name: string; entries: DogEntryInput[] }[] = [
    { name: '2 std', entries: [std('a'), std('b')] }, // straddles threshold when a 3rd paying dog is added
    { name: '3 std', entries: [std('a'), std('b'), std('c')] }, // package already active
    { name: '1 std 3 classes', entries: [std('a', 3)] },
  ];

  for (const ctx of [BASE, multiCtx, { ...multiCtx, discountGroup: MEMBER_GROUP }]) {
    for (const base of bases) {
      const label = ctx.discountGroup ? 'member+multi' : ctx.multiDogThreshold ? 'multi' : 'plain';

      it(`special-only dog adds exactly its own fee, nothing else (${base.name} @ ${label})`, () => {
        const before = computeOrderFees(base.entries, ctx);
        const after = computeOrderFees([...base.entries, std('rider', 1, [SPECIAL])], ctx);

        expect(after.payingDogCount).toBe(before.payingDogCount); // didn't join the count
        expect(after.multiDogApplied).toBe(before.multiDogApplied); // didn't trip the package
        expect(after.total).toBe(before.total + SPECIAL); // added precisely £3
        // every pre-existing dog charged the same as before
        for (const e of before.perEntry) {
          expect(after.perEntry.find((x) => x.key === e.key)!.fee).toBe(e.fee);
        }
      });

      it(`a JH entry adds exactly the JH fee, nothing else (${base.name} @ ${label})`, () => {
        const before = computeOrderFees(base.entries, ctx);
        const after = computeOrderFees([...base.entries, jh('jhrider')], ctx);
        expect(after.payingDogCount).toBe(before.payingDogCount);
        expect(after.multiDogApplied).toBe(before.multiDogApplied);
        expect(after.total).toBe(before.total + JH_FEE);
      });

      it(`an NFC entry adds exactly the NFC fee, nothing else (${base.name} @ ${label})`, () => {
        const before = computeOrderFees(base.entries, ctx);
        const after = computeOrderFees([...base.entries, nfc('nfcrider')], ctx);
        expect(after.payingDogCount).toBe(before.payingDogCount);
        expect(after.multiDogApplied).toBe(before.multiDogApplied);
        expect(after.total).toBe(before.total + NFC_FEE);
      });
    }
  }
});

// ── Monotonicity: a member is never charged MORE than a non-member for the same
//    order (a broken discount config that inverts the rate would trip this). ──
describe('charging invariants — member rate never exceeds non-member rate', () => {
  const nonMember: FeeContext = { ...BASE, multiDogThreshold: 3, multiDogPackagePence: PACKAGE };
  const member: FeeContext = { ...nonMember, discountGroup: MEMBER_GROUP };
  for (const { name, entries } of SHAPES) {
    it(`${name}`, () => {
      const std = computeOrderFees(entries, nonMember).total;
      const mem = computeOrderFees(entries, member).total;
      expect(mem).toBeLessThanOrEqual(std);
    });
  }
});

// ── Golden values: pin the exact arithmetic for the real-world cases, so the
//    invariants above can't be satisfied by some other (wrong) number. ────────
describe('charging — golden totals (exact pence)', () => {
  const multi: FeeContext = { ...BASE, multiDogThreshold: 3, multiDogPackagePence: PACKAGE };
  const member: FeeContext = { ...multi, discountGroup: MEMBER_GROUP };

  const cases: [string, DogEntryInput[], FeeContext, number][] = [
    ['1 dog 1 class', [std('a')], BASE, FIRST],
    ['1 dog 3 classes', [std('a', 3)], BASE, FIRST + 2 * SUBSEQUENT],
    ['member 1 class', [std('a')], member, MEMBER_FIRST],
    ['3 dogs → package', [std('a'), std('b'), std('c')], multi, PACKAGE],
    ['3 member dogs → member package', [std('a'), std('b'), std('c')], member, MEMBER_PACKAGE],
    ['special only', [std('a', 1, [SPECIAL])], multi, SPECIAL],
    ['member, special only (the Kathryn case = £3 not £18)', [std('a', 1, [SPECIAL])], member, SPECIAL],
    ['normal + special', [std('a', 2, [null, SPECIAL])], BASE, FIRST + SPECIAL],
    ['3 dogs package + special-only 4th', [std('a'), std('b'), std('c'), std('x', 1, [SPECIAL])], multi, PACKAGE + SPECIAL],
    ['two specials on one dog', [std('a', 2, [SPECIAL, SPECIAL_B])], BASE, SPECIAL + SPECIAL_B],
    ['everything: (first+special) + package(via 3 payers) + JH + 2×NFC + special-only', [std('a', 2, [null, SPECIAL]), std('b'), std('c'), jh('d'), nfc('e', 2), std('f', 1, [SPECIAL_B])], multi,
      // a,b,c are the 3 paying dogs → package £56; a also has a £3 special;
      // JH £3; NFC 2 classes £10; special-only f £5.
      PACKAGE + SPECIAL + JH_FEE + 2 * NFC_FEE + SPECIAL_B],
  ];

  for (const [name, entries, ctx, expected] of cases) {
    it(`${name} = ${expected}p`, () => {
      expect(computeOrderFees(entries, ctx).total).toBe(expected);
    });
  }
});

// ── The one documented edge the invariants deliberately skip. ───────────────
describe('charging — NFC with zero classes (documented quirk)', () => {
  it('charges one NFC fee but emits no per-class rows', () => {
    const r = computeOrderFees([nfc('a', 0)], BASE);
    expect(r.total).toBe(NFC_FEE);
    expect(r.perEntry[0].perClassFees).toEqual([]); // caller skips the entry_classes insert
  });
});
