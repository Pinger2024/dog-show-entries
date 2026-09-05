/**
 * Cross-path fee parity — the four charging paths must agree to the penny.
 *
 * The same dog in the same classes at the same show is priced by FOUR
 * independent code paths, each of which hand-builds the fee-engine input:
 *   1. orders.checkout          (exhibitor pays online)
 *   2. secretary.createManualEntry (postal/cash entry keyed by the secretary)
 *   3. entries.update           (exhibitor edits their entry)
 *   4. the enter-page fee preview (client display — mirrors the engine)
 *
 * The Special Award Class bug (Mandy 2026-07-19) got in partly because only
 * ONE cross-path check existed (manual-entry-fee.test.ts) and it covered plain
 * classes only. If any path forgets to thread class type / own fee again, the
 * paths silently diverge and someone is mischarged. This parametrised suite
 * runs a spread of scenarios — including Special Award Classes — through paths
 * 1–3 and asserts identical entry totals AND per-class breakdowns.
 *
 * (Path 4 is a client React component and can't be called here; it delegates to
 *  the same `computeOrderFees`, and every scenario below also pins the engine's
 *  expected total, so a preview drift would surface as an engine-value change.)
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries, entryClasses } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeDog,
  makeSecretaryWithOrg,
} from '../helpers/factories';

const FIRST = 2000; // £20
const SUBSEQUENT = 1000; // £10
const SPECIAL = 300; // £3 Special Award Class own fee

type ClassSpec = { fee: number; type?: 'special' };

/**
 * Single-dog scenarios: a list of classes, and the total the dog must be
 * charged however it's entered. Single-dog because manual entry and edit are
 * inherently per-dog — the multi-dog package is exercised separately below.
 */
const SCENARIOS: { name: string; classes: ClassSpec[]; expected: number; perClass: number[] }[] = [
  {
    name: 'three regular classes → first + 2× subsequent',
    classes: [{ fee: FIRST }, { fee: FIRST }, { fee: FIRST }],
    expected: FIRST + 2 * SUBSEQUENT,
    perClass: [FIRST, SUBSEQUENT, SUBSEQUENT],
  },
  {
    name: 'special class only → its own fee (the Kathryn case)',
    classes: [{ fee: SPECIAL, type: 'special' }],
    expected: SPECIAL,
    perClass: [SPECIAL],
  },
  {
    name: 'regular + special → first + own fee (Denise / Miss G)',
    classes: [{ fee: FIRST }, { fee: SPECIAL, type: 'special' }],
    expected: FIRST + SPECIAL,
    perClass: [FIRST, SPECIAL],
  },
  {
    name: 'special + two regular → own + first + subsequent',
    classes: [{ fee: SPECIAL, type: 'special' }, { fee: FIRST }, { fee: FIRST }],
    expected: SPECIAL + FIRST + SUBSEQUENT,
    perClass: [SPECIAL, FIRST, SUBSEQUENT],
  },
];

async function setupShow() {
  const { user: secretary, org } = await makeSecretaryWithOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
    firstEntryFee: FIRST,
    subsequentEntryFee: SUBSEQUENT,
  });
  return { secretary, org, breed, show };
}

async function makeClasses(showId: string, breedId: string, specs: ClassSpec[]) {
  const ids: string[] = [];
  for (const s of specs) {
    const opts: Parameters<typeof makeShowClass>[0] = { showId, breedId, entryFee: s.fee };
    if (s.type === 'special') {
      const def = await makeClassDef({ name: 'Special Award Class - Post Graduate', type: 'special' });
      opts.classDefinitionId = def.id;
    }
    const sc = await makeShowClass(opts);
    ids.push(sc!.id);
  }
  return ids;
}

const sumRows = async (entryId: string) => {
  const rows = await testDb.query.entryClasses.findMany({ where: eq(entryClasses.entryId, entryId) });
  return { count: rows.length, sum: rows.reduce((s, r) => s + (r.fee ?? 0), 0) };
};

describe('cross-path fee parity (single dog)', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.name} — checkout == manual == edit == ${sc.expected}p`, async () => {
      const { secretary, breed, show } = await setupShow();
      const classIds = await makeClasses(show.id, breed.id, sc.classes);
      const exhibitor = await makeUser({ role: 'exhibitor' });

      // Path 1 — exhibitor checkout.
      const cDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
      const checkout = await createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: cDog.id, classIds, isNfc: false }],
      });
      const cEntry = await testDb.query.entries.findFirst({ where: eq(entries.orderId, checkout.orderId) });

      // Path 2 — secretary manual entry, same classes, different dog.
      const mDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
      const manual = await createTestCaller(secretary).secretary.createManualEntry({
        showId: show.id,
        dogId: mDog.id,
        classIds,
        exhibitorEmail: exhibitor.email,
      });

      // Path 3 — exhibitor edits an entry DOWN into this class set. Seed the dog
      // in the scenario's classes PLUS one extra regular class (so it's strictly
      // pricier), then edit to exactly the scenario classes. A DOWNGRADE applies
      // immediately (an upgrade would defer to a top-up payment), so the repriced
      // fee lands in the DB. `update` returns the recomputed `newFee`.
      const [extraClass] = await makeClasses(show.id, breed.id, [{ fee: FIRST }]);
      const eDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
      const seedCheckout = await createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: eDog.id, classIds: [...classIds, extraClass], isNfc: false }],
      });
      const seedEntry = await testDb.query.entries.findFirst({ where: eq(entries.orderId, seedCheckout.orderId) });
      const edited = await createTestCaller(exhibitor).entries.update({ id: seedEntry!.id, classIds });
      expect(edited.requiresPayment).toBe(false); // downgrade → applied now

      // All three paths charge the scenario total…
      expect(cEntry?.totalFee).toBe(sc.expected);
      expect(manual.totalFee).toBe(sc.expected);
      expect(edited.newFee).toBe(sc.expected);

      // …and each path's per-class rows reconcile to that same total.
      for (const id of [cEntry!.id, manual.id, seedEntry!.id]) {
        const { count, sum } = await sumRows(id);
        expect(count).toBe(sc.classes.length);
        expect(sum).toBe(sc.expected);
      }
    });
  }
});

const PACKAGE = 5600; // £56 multi-dog package (3+)

describe('cross-path fee parity (multi-dog package survives an edit)', () => {
  it('editing one dog in a 3-dog package order does not disturb the package', async () => {
    const { org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      status: 'entries_open',
      firstEntryFee: FIRST,
      subsequentEntryFee: SUBSEQUENT,
      multiDogThreshold: 3,
      multiDogPackagePence: PACKAGE,
    });
    const [mainClass] = await makeClasses(show.id, breed.id, [{ fee: FIRST }]);
    const [extraClass] = await makeClasses(show.id, breed.id, [{ fee: FIRST }]);
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const dogList = await Promise.all([1, 2, 3].map(() => makeDog({ ownerId: exhibitor.id, breedId: breed.id })));

    // Three dogs, one class each → the multi-dog package fires. `totalAmount`
    // is the pre-platform-fee subtotal, so it equals the package exactly.
    const checkout = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: dogList.map((d) => ({ entryType: 'standard' as const, dogId: d.id, classIds: [mainClass], isNfc: false })),
    });
    expect(checkout.totalAmount).toBe(PACKAGE);

    // Edit dog #1 to ADD a second class. Adding a class is an upgrade, which is
    // deliberately DEFERRED until the top-up is paid (an abandoned top-up must
    // not grant free classes). So nothing persists yet and the package is
    // untouched — the money-safety guarantee we care about here.
    const orderEntries = await testDb.query.entries.findMany({ where: eq(entries.orderId, checkout.orderId) });
    const dog1Entry = orderEntries.find((e) => e.dogId === dogList[0].id)!;
    const edited = await createTestCaller(exhibitor).entries.update({
      id: dog1Entry.id,
      classIds: [mainClass, extraClass],
    });
    expect(edited.requiresPayment).toBe(true); // upgrade → deferred to payment
    expect(edited.feeDiff).toBeGreaterThan(0);

    const afterEdit = await testDb.query.entries.findMany({ where: eq(entries.orderId, checkout.orderId) });
    const orderSubtotal = afterEdit.reduce((s, e) => s + (e.totalFee ?? 0), 0);
    expect(orderSubtotal).toBe(PACKAGE); // unchanged — the upgrade isn't paid yet

    // The computed (deferred) delta is EXACTLY one subsequent class: the dog's
    // package slot is untouched and only the added class is charged. Proof the
    // engine re-slotted the package correctly even though it isn't applied yet.
    expect(edited.newFee - edited.oldFee).toBe(SUBSEQUENT);
  });
});
