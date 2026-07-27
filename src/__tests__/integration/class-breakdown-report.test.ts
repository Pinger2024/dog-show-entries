import { describe, it, expect } from 'vitest';
import { entries } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeOrder,
  makeUser,
} from '../helpers/factories';
import { computeClassBreakdown } from '@/lib/class-breakdown';
import { classBreakdownFooter } from '@/components/reports/show-report-pdf';
import { classBreakdownFooterText } from '@/app/(secretary)/secretary/shows/[id]/_lib/show-utils';

// Mandy, BAGSD 2026-06-17: the Financial page's "Entries by Class" card must
// count the TRUE ring numbers — every confirmed catalogue entry regardless of
// how it was paid (incl. entries settled directly to the club, which have no
// Remi order), plus NFC entries — so the total ties to the catalogue. This is
// broader than getEntryReport, which is paid-via-Remi only.
describe('getClassBreakdownReport — full catalogue entry set (Mandy/BAGSD)', () => {
  async function fixture() {
    const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress' });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const exhibitor = await makeUser({ role: 'exhibitor' });
    return { secretary, exhibitor, show, showClass, breed };
  }

  it('counts paid-via-Remi + paid-directly + NFC entries; excludes cancelled', async () => {
    const { secretary, exhibitor, show, showClass, breed } = await fixture();

    // 1) Paid through Remi: a paid order + a confirmed competing entry.
    const paidOrder = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const dogA = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const entryA = await makeEntry({ showId: show.id, dogId: dogA.id, exhibitorId: exhibitor.id, orderId: paidOrder.id, status: 'confirmed' });
    await makeEntryClass({ entryId: entryA.id, showClassId: showClass.id });

    // 2) Paid DIRECTLY to the club (hand-added by the secretary): no order at
    //    all, but a real confirmed entry in a class (this is April's case).
    const dogB = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const entryB = await makeEntry({ showId: show.id, dogId: dogB.id, exhibitorId: exhibitor.id, status: 'confirmed' });
    await makeEntryClass({ entryId: entryB.id, showClassId: showClass.id });

    // 3) NFC: confirmed, in the catalogue, but no judged class (no entryClasses).
    const dogC = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    await testDb.insert(entries).values({
      showId: show.id, dogId: dogC.id, exhibitorId: exhibitor.id,
      status: 'confirmed', isNfc: true, totalFee: 0,
    });

    // 4) A cancelled entry — must NOT count toward the catalogue.
    const dogD = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const cancelled = await makeEntry({ showId: show.id, dogId: dogD.id, exhibitorId: exhibitor.id, status: 'cancelled' });
    await makeEntryClass({ entryId: cancelled.id, showClassId: showClass.id });

    const caller = createTestCaller(secretary);
    const report = await caller.secretary.getClassBreakdownReport({ showId: show.id });
    const breakdown = computeClassBreakdown(report.entries, report.classes);

    // The grand total ties to the catalogue: 2 competing + 1 NFC = 3.
    expect(breakdown.combinedTotals.entries).toBe(3);
    expect(breakdown.notForCompetitionTotals.entries).toBe(1);

    // The directly-paid entry (no Remi order) is counted — the whole point.
    const competing = breakdown.combinedTotals.entries - breakdown.notForCompetitionTotals.entries;
    expect(competing).toBe(2);

    // Contrast: getEntryReport (paid-via-Remi only) sees just the one paid order.
    const paidOnly = await caller.secretary.getEntryReport({ showId: show.id });
    expect(paidOnly).toHaveLength(1);
    expect(computeClassBreakdown(paidOnly).combinedTotals.entries).toBe(1);
  });
});

// Mandy, South Western GSD 2026-07-27: "on the main screen it's got 93 but on
// this report it's got 109 — I've physically counted and we have 109". Both
// figures were correct: 93 dogs entered, 109 class entries (82 breed + 24
// Special Award + 3 Junior Handling), because a dog in two classes appears in
// both. Neither screen said which unit it was counting.
describe('class breakdown PDF footer — says what it is counting', () => {
  it('names the unit and reconciles it against the dogs-entered figure', () => {
    const footer = classBreakdownFooter(109, 93);
    expect(footer.value).toBe('109 class entries');
    expect(footer.note).toContain('109 class entries from 93 dogs');
    expect(footer.note).toContain('counted in each of them');
  });

  it('reads naturally for a single dog and omits the note when no dog count is given', () => {
    expect(classBreakdownFooter(1, 1).note).toContain('from 1 dog —');
    expect(classBreakdownFooter(109).note).toBeUndefined();
  });
});

// Mandy, South Western GSD, 2026-07-27: the Financial page's "Entries by
// Class" card footer read "156 class entries across 160 dogs" — but
// combinedTotals.entries (160) is the total of the column above it (class
// entries + not-for-competition LINES), never a dog count. The corrected
// footer reads "160 lines = 156 class entries + 4 not for competition,
// from 84 dogs" (src/app/(secretary)/secretary/shows/[id]/financial/
// page.tsx, ~line 503) — built inline in JSX, so not independently
// callable like classBreakdownFooter above. This asserts the numbers that
// sentence depends on: combinedTotals.entries splits exactly into class
// entries + NFC lines, and — the whole point of the fix — that combined
// total must NEVER be read out loud as "how many dogs", because a dog
// entered in more than one class inflates it past the true dog/entry count.
describe('Entries by Class footer numbers — combinedTotals is lines, not dogs', () => {
  it('combinedTotals.entries = (class entries) + (NFC entries), and is NOT the dogs-entered figure', async () => {
    const { secretary, exhibitor, show, breed } = await (async () => {
      const { user: secretary, org, breed } = await makeSecretaryWithOrgAndBreed();
      const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'in_progress' });
      const exhibitor = await makeUser({ role: 'exhibitor' });
      return { secretary, exhibitor, show, breed };
    })();

    const classA = await makeShowClass({ showId: show.id, breedId: breed.id });
    const classB = await makeShowClass({ showId: show.id, breedId: breed.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });

    // Dog 1 — entered in TWO classes (one entry, two entry-class rows).
    const dog1 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const entry1 = await makeEntry({ showId: show.id, dogId: dog1.id, exhibitorId: exhibitor.id, orderId: order.id, status: 'confirmed' });
    await makeEntryClass({ entryId: entry1.id, showClassId: classA.id });
    await makeEntryClass({ entryId: entry1.id, showClassId: classB.id });

    // Dog 2 — entered in ONE class.
    const dog2 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const entry2 = await makeEntry({ showId: show.id, dogId: dog2.id, exhibitorId: exhibitor.id, orderId: order.id, status: 'confirmed' });
    await makeEntryClass({ entryId: entry2.id, showClassId: classA.id });

    // Dog 3 — Not For Competition: in the catalogue, no judged class.
    const dog3 = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    await testDb.insert(entries).values({
      showId: show.id, dogId: dog3.id, exhibitorId: exhibitor.id,
      status: 'confirmed', isNfc: true, totalFee: 0,
    });

    const caller = createTestCaller(secretary);
    const [report, stats] = await Promise.all([
      caller.secretary.getClassBreakdownReport({ showId: show.id }),
      caller.secretary.getShowStats({ showId: show.id }),
    ]);
    const breakdown = computeClassBreakdown(report.entries, report.classes);
    const totalClassEntries = breakdown.combinedTotals.entries - breakdown.notForCompetitionTotals.entries;

    // 3 class-entry rows (2 for dog1 + 1 for dog2) + 1 NFC line = 4 lines.
    expect(breakdown.combinedTotals.entries).toBe(4);
    expect(breakdown.notForCompetitionTotals.entries).toBe(1);
    expect(totalClassEntries).toBe(3);

    // The real "how many dogs/entries" figure — 3 (dog1 + dog2 + the NFC
    // dog) — must NOT equal combinedTotals.entries (4). This is exactly
    // the bug: reading the combined lines total out loud as a dog count
    // overstates it whenever any dog runs more than one class.
    expect(stats.dogsEntered).toBe(3);
    expect(stats.dogsEntered).not.toBe(breakdown.combinedTotals.entries);

    // And the corrected sentence's arithmetic actually holds: lines = class
    // entries + not-for-competition.
    expect(totalClassEntries + breakdown.notForCompetitionTotals.entries).toBe(breakdown.combinedTotals.entries);
  });
});

// Mandy 2026-07-27 read the Entries by Class footer as "156 class entries
// across 160 dogs" — nonsense, because it printed the column total (class
// entries PLUS not-for-competition) where a dog count belonged. The sentence
// was inline JSX, so nothing could assert it; it is now a pure function.
describe('Entries by Class footer — the sentence itself', () => {
  it('never labels the line total as a dog count', () => {
    // South Western's real shape: 160 lines = 156 class entries + 4 NFC, 84 dogs.
    const text = classBreakdownFooterText({
      totalLines: 160,
      classEntries: 156,
      notForCompetition: 4,
      dogsEntered: 84,
    });
    expect(text).toBe(
      '160 lines = 156 class entries + 4 not for competition, from 84 dogs. ' +
        'A dog entered in more than one class is counted in each of them.',
    );
    // The specific fault: the line total must never be presented as dogs.
    expect(text).not.toContain('160 dogs');
  });

  it('omits the not-for-competition part when there are none', () => {
    const text = classBreakdownFooterText({
      totalLines: 12, classEntries: 12, notForCompetition: 0, dogsEntered: 10,
    });
    expect(text).toContain('12 lines = 12 class entries, from 10 dogs');
    expect(text).not.toContain('not for competition');
  });

  it('reads naturally for a single entry and a single dog', () => {
    const text = classBreakdownFooterText({
      totalLines: 1, classEntries: 1, notForCompetition: 0, dogsEntered: 1,
    });
    expect(text).toContain('1 lines = 1 class entry, from 1 dog');
  });

  it('drops the "from N dogs" clause when the figure is unavailable', () => {
    const text = classBreakdownFooterText({
      totalLines: 5, classEntries: 5, notForCompetition: 0, dogsEntered: null,
    });
    expect(text).not.toMatch(/from \d+ dogs?/);
    // The closing explanation still mentions dogs, and should.
    expect(text).toContain('counted in each of them');
  });
});
