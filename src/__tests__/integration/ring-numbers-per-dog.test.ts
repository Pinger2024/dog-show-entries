/**
 * A dog entered in two classes gets two `entries` rows sharing ONE
 * catalogue number (one catalogue number PER DOG — see
 * project_dog_one_catalogue_number). generateRingNumbersPdf's number list
 * used to be built straight off `entries.catalogueNumber` with no dedupe,
 * so that dog's number was duplicated in the list: react-pdf warned
 * "Encountered two children with the same key" (the number used as the
 * React key) on real shows, and — the real content bug this test guards
 * against — the dog got TWO ring-number cards/pages printed instead of
 * one.
 */
import { describe, it, expect } from 'vitest';
import { generateRingNumbersPdf } from '@/server/services/pdf-generation';
import { extractDocumentGeometry } from '../golden/lib/pdf-inspect';
import { makeSecretaryWithOrgAndBreed, makeShow, makeShowClass, makeDog, makeEntry, makeEntryClass, makeUser } from '../helpers/factories';
import { testDb } from '../helpers/db';
import { entries } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

describe('generateRingNumbersPdf — one card per DOG, not per entry row', () => {
  it('single format: a dog entered in two classes gets exactly one page, not two', async () => {
    const { org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id });
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const classA = await makeShowClass({ showId: show.id, breedId: breed.id });
    const classB = await makeShowClass({ showId: show.id, breedId: breed.id });

    // Two entries rows for the SAME dog (one per class), same show — this is
    // the real shape a "second class" entry takes (render-documents.ts's
    // doc comment: "second class = second entries row").
    const entryA = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id });
    await makeEntryClass({ entryId: entryA.id, showClassId: classA.id });
    const entryB = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id });
    await makeEntryClass({ entryId: entryB.id, showClassId: classB.id });

    // Both entries share ONE catalogue number — assigned per dog, not per entry.
    await testDb.update(entries).set({ catalogueNumber: '7' }).where(eq(entries.id, entryA.id));
    await testDb.update(entries).set({ catalogueNumber: '7' }).where(eq(entries.id, entryB.id));

    const buf = await generateRingNumbersPdf(show.id, 'single');
    const geo = await extractDocumentGeometry(buf);

    expect(geo.pageCount).toBe(1);
  });

  it('multi-up format: the same dog only occupies one card slot', async () => {
    const { org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({ organisationId: org.id });
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const classA = await makeShowClass({ showId: show.id, breedId: breed.id });
    const classB = await makeShowClass({ showId: show.id, breedId: breed.id });

    const entryA = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id });
    await makeEntryClass({ entryId: entryA.id, showClassId: classA.id });
    const entryB = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id });
    await makeEntryClass({ entryId: entryB.id, showClassId: classB.id });

    await testDb.update(entries).set({ catalogueNumber: '12' }).where(eq(entries.id, entryA.id));
    await testDb.update(entries).set({ catalogueNumber: '12' }).where(eq(entries.id, entryB.id));

    const buf = await generateRingNumbersPdf(show.id, 'multi-up');
    const geo = await extractDocumentGeometry(buf);

    // 8 cards per A4 page; one dog, one number → one page, "12" appears once.
    expect(geo.pageCount).toBe(1);
    const occurrences = geo.pages[0].filter((line) => line.text.trim() === '12').length;
    expect(occurrences).toBe(1);
  });
});
