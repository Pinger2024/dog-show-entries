import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { results } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { dogNameMatches, dogNameQueryTokens } from '@/server/services/public-dog-summary';
import {
  makeUser,
  makeOrg,
  makeShow,
  makeBreed,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeShowClass,
  makeResult,
  dateStr,
} from '../helpers/factories';

/**
 * Find a Dog (Mandy, 1 Oct 2026): "a search area where they can insert a dog's
 * name and pull up the critiques" — on the condition that it never shows a dog
 * and what its upcoming shows are. Only dogs already judged at a Remi show,
 * with the result published, ever come up.
 */

const anon = () => createTestCaller(null);
const pastDate = (daysAgo: number) => dateStr(-daysAgo);
const futureDate = (daysAhead: number) => dateStr(daysAhead);

describe('Find a Dog — how a typed name matches', () => {
  it('any part of the name, any order, any case', () => {
    expect(dogNameMatches('Rosebud Edie of Hundark', dogNameQueryTokens('edie'))).toBe(true);
    expect(dogNameMatches('Rosebud Edie of Hundark', dogNameQueryTokens('HUNDARK rosebud'))).toBe(true);
    expect(dogNameMatches('Rosebud Edie of Hundark', dogNameQueryTokens('zeus'))).toBe(false);
  });

  it("apostrophes, v / von / vom, a bracketed tag and a leading title don't matter", () => {
    expect(dogNameMatches("Wakematt's Luco", dogNameQueryTokens('wakematts luco'))).toBe(true);
    expect(dogNameMatches('BILLIE VON HUHNEGRAB', dogNameQueryTokens('billie v huhnegrab'))).toBe(true);
    expect(dogNameMatches('ROSEBUD EDIE OF HUNDARK (IKC)', dogNameQueryTokens('rosebud edie'))).toBe(true);
    expect(dogNameMatches('Rosebud Edie of Hundark', dogNameQueryTokens('Ch Rosebud'))).toBe(true);
  });

  it('a single letter on its own is not a search', () => {
    expect(dogNameQueryTokens('e')).toEqual([]);
  });
});

describe('Find a Dog — only dogs already judged on Remi come up', () => {
  async function dogAt(opts: { name: string; daysFromToday: number; placement?: number; published?: boolean; critique?: string }) {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id, registeredName: opts.name });
    const org = await makeOrg();
    const date = opts.daysFromToday < 0 ? pastDate(-opts.daysFromToday) : futureDate(opts.daysFromToday);
    const show = await makeShow({
      organisationId: org.id,
      status: opts.daysFromToday < 0 ? 'completed' : 'entries_closed',
      startDate: date,
      endDate: date,
    });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
    const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
    if (opts.placement) {
      const result = await makeResult({ entryClassId: ec.id, placement: opts.placement, critiqueText: opts.critique ?? null });
      if (opts.published) {
        await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, result.id));
      }
    }
    return { owner, dog };
  }

  it('finds a dog judged at a past show, with its show and critique counts', async () => {
    const { dog } = await dogAt({
      name: 'Rosebud Edie of Hundark',
      daysFromToday: -50,
      placement: 1,
      published: true,
      critique: 'Feminine bitch of good size, firm back, moved well.',
    });
    const found = await anon().dogs.searchPublic({ query: 'hundark' });
    expect(found.map((d) => d.id)).toEqual([dog.id]);
    expect(found[0]).toMatchObject({ registeredName: 'Rosebud Edie of Hundark', sex: 'dog', shows: 1, critiques: 1 });
  });

  it('never finds a dog that is only entered in upcoming shows', async () => {
    await dogAt({ name: 'Upcoming Ursa of Hundark', daysFromToday: 5 });
    expect(await anon().dogs.searchPublic({ query: 'ursa' })).toEqual([]);
  });

  it("never finds a dog whose only result hasn't been published yet", async () => {
    await dogAt({ name: 'Waiting Willow of Hundark', daysFromToday: -1, placement: 1, published: false });
    expect(await anon().dogs.searchPublic({ query: 'willow' })).toEqual([]);
  });

  it("matches the way people type it — apostrophes don't matter", async () => {
    const { dog } = await dogAt({ name: "Wakematt's Luco", daysFromToday: -20, placement: 2, published: true });
    const found = await anon().dogs.searchPublic({ query: 'wakematts' });
    expect(found.map((d) => d.id)).toEqual([dog.id]);
  });

  it('a signed-in owner gets the same public list — not their own upcoming entries', async () => {
    const { owner } = await dogAt({ name: 'Private Pippa of Hundark', daysFromToday: 5 });
    expect(await createTestCaller(owner).dogs.searchPublic({ query: 'pippa' })).toEqual([]);
  });

  it('names that start with what was typed come first', async () => {
    const later = await dogAt({ name: 'Aldo Edie', daysFromToday: -30, placement: 1, published: true });
    const first = await dogAt({ name: 'Edie of Zanzibar', daysFromToday: -30, placement: 1, published: true });
    const found = await anon().dogs.searchPublic({ query: 'edie' });
    expect(found.map((d) => d.id)).toEqual([first.dog.id, later.dog.id]);
  });
});
