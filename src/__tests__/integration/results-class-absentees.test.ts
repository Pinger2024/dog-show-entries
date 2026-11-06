/**
 * Mandy (Telegram 8076, 21 Oct 2026): "can we include absentees" on the live
 * results. Each class card already said "5 presented / 8 entered" but never
 * WHICH dogs were absent, so anyone marking a catalogue at the ringside (or
 * wondering why their dog's rival wasn't placed) had to ask.
 *
 * `getLiveResults` now carries each class's absentees — catalogue number and
 * name, in catalogue-number order — on the class card. The list rides the
 * card's existing visibility rule and nothing else: a public caller sees a
 * class's absentees only once that class has a published result (or, for an
 * all-absent class, once the show has started). Absence has no publishedAt of
 * its own, so a second gate would be a second rule; these tests pin that the
 * one rule holds.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { entries, juniorHandlerDetails, results } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeClassDef,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
  makeStewardAssignment,
} from '../helpers/factories';

const PAST = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

async function baseShow(status: 'entries_closed' | 'in_progress' = 'in_progress') {
  const [steward, org, breed] = await Promise.all([
    makeUser({ role: 'steward' }),
    makeOrg(),
    makeBreed(),
  ]);
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showRuleset: 'rkc',
    status,
    startDate: PAST,
    endDate: PAST,
  });
  await makeStewardAssignment({ userId: steward.id, showId: show.id });
  const classDef = await makeClassDef({ name: 'Open' });
  const showClass = await makeShowClass({
    showId: show.id, breedId: breed.id, classDefinitionId: classDef.id, sex: 'bitch', classNumber: 21,
  });
  return { steward, breed, show, showClass };
}

async function entryIn(
  showId: string,
  breedId: string,
  showClassId: string,
  opts: {
    catalogueNumber: string;
    name: string;
    absent?: boolean;
    status?: 'confirmed' | 'withdrawn';
  },
) {
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId, sex: 'bitch', registeredName: opts.name });
  const entry = await makeEntry({
    showId, dogId: dog.id, exhibitorId: exhibitor.id, status: opts.status ?? 'confirmed',
  });
  await testDb.update(entries).set({ catalogueNumber: opts.catalogueNumber }).where(eq(entries.id, entry.id));
  const ec = await makeEntryClass({ entryId: entry.id, showClassId, absent: opts.absent ?? false });
  return { entry, ec };
}

async function publishedPlacing(entryClassId: string, placement: number) {
  const r = await makeResult({ entryClassId, placement });
  await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, r.id));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findCard(live: any, classId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return live.breedGroups.flatMap((g: any) => g.classes).find((c: any) => c.classId === classId);
}

describe('live results — a judged class lists its absentees (Mandy 8076, 21 Oct 2026)', () => {
  it('lists every absent dog by catalogue number and name, in catalogue-number order, and nobody else', async () => {
    const { breed, show, showClass } = await baseShow();
    // NE Champ 2026, class 21 Open Bitch, cut down: placed, present-unplaced
    // and absent dogs in one class. "9" vs "10" vs "76" proves the order is
    // numeric — a string sort would put "10" before "9".
    const { ec: first } = await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '75', name: "SADIRA'S XENNA" });
    await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '80', name: 'NEERLAWS VESSPA' });
    await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '76', name: 'Qwily Vom Team Huhnegrab', absent: true });
    await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '10', name: 'LANGFAULDS CHIC', absent: true });
    await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '9', name: 'MAGIC VOM HERBRAMER WALD', absent: true });
    await publishedPlacing(first.id, 1);

    const card = findCard(await createTestCaller(null).steward.getLiveResults({ showId: show.id }), showClass.id);

    expect(card).toBeDefined();
    expect(card!.absentees.map((a: { catalogueNumber: string }) => a.catalogueNumber)).toEqual(['9', '10', '76']);
    expect(card!.absentees.map((a: { dogName: string }) => a.dogName)).toEqual([
      'MAGIC VOM HERBRAMER WALD',
      'LANGFAULDS CHIC',
      'Qwily Vom Team Huhnegrab',
    ]);
    // The count line and the list must agree — they are the same attendance.
    expect(card!.entriesCount - card!.dogsForward).toBe(card!.absentees.length);
  });

  it('a withdrawn entry marked absent is not an absentee — it is not in the class at all', async () => {
    const { breed, show, showClass } = await baseShow();
    const { ec: first } = await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '1', name: 'PLACED DOG' });
    await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '2', name: 'WITHDRAWN DOG', absent: true, status: 'withdrawn' });
    await publishedPlacing(first.id, 1);

    const card = findCard(await createTestCaller(null).steward.getLiveResults({ showId: show.id }), showClass.id);

    expect(card!.absentees).toEqual([]);
  });

  it('an absent junior handler is listed under the handler\'s name, as the placings are', async () => {
    const { breed, show, showClass } = await baseShow();
    const { ec: first } = await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '82', name: 'HANDLED DOG A' });
    const { entry: jh } = await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '85', name: 'HANDLED DOG B', absent: true });
    await testDb.update(entries).set({ entryType: 'junior_handler' }).where(eq(entries.id, jh.id));
    await testDb.insert(juniorHandlerDetails).values({ entryId: jh.id, handlerName: 'Casey Lee', dateOfBirth: '2012-01-01' });
    await publishedPlacing(first.id, 1);

    const card = findCard(await createTestCaller(null).steward.getLiveResults({ showId: show.id }), showClass.id);

    expect(card!.absentees).toEqual([
      expect.objectContaining({ catalogueNumber: '85', dogName: 'Casey Lee' }),
    ]);
  });

  it('an all-absent class lists all of them once the show has started', async () => {
    const { breed, show, showClass } = await baseShow('in_progress');
    await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '6', name: 'ABSENT PUPPY', absent: true });

    const card = findCard(await createTestCaller(null).steward.getLiveResults({ showId: show.id }), showClass.id);

    expect(card!.allAbsent).toBe(true);
    expect(card!.absentees).toEqual([expect.objectContaining({ catalogueNumber: '6', dogName: 'ABSENT PUPPY' })]);
  });
});

describe('live results — absentees never show before the class is published', () => {
  it('a class whose results are recorded but NOT published shows no absentees to the public; the steward sees them', async () => {
    const { steward, breed, show, showClass } = await baseShow();
    const { ec: first } = await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '41', name: 'UNPUBLISHED WINNER' });
    await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '38', name: 'SECRET ABSENTEE', absent: true });
    await makeResult({ entryClassId: first.id, placement: 1 }); // recorded, not published

    const publicLive = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    expect(findCard(publicLive, showClass.id)).toBeUndefined();
    // Nowhere in the public payload, not just off this card.
    expect(JSON.stringify(publicLive)).not.toContain('SECRET ABSENTEE');

    const stewardCard = findCard(await createTestCaller(steward).steward.getLiveResults({ showId: show.id }), showClass.id);
    expect(stewardCard!.absentees).toEqual([
      expect.objectContaining({ catalogueNumber: '38', dogName: 'SECRET ABSENTEE' }),
    ]);
  });

  it('a class with absences marked but nothing judged yet shows no absentees to anyone', async () => {
    const { steward, breed, show, showClass } = await baseShow();
    await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '52', name: 'NOT YET JUDGED' });
    await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '58', name: 'EARLY ABSENTEE', absent: true });

    const publicLive = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    expect(JSON.stringify(publicLive)).not.toContain('EARLY ABSENTEE');
    const stewardLive = await createTestCaller(steward).steward.getLiveResults({ showId: show.id });
    expect(findCard(stewardLive, showClass.id)).toBeUndefined();
  });

  it('an all-absent class on a show that has not started reveals no absentee to the public', async () => {
    const { breed, show, showClass } = await baseShow('entries_closed');
    await entryIn(show.id, breed.id, showClass.id, { catalogueNumber: '7', name: 'PRE-SHOW ABSENTEE', absent: true });

    const publicLive = await createTestCaller(null).steward.getLiveResults({ showId: show.id });
    expect(JSON.stringify(publicLive)).not.toContain('PRE-SHOW ABSENTEE');
  });
});
