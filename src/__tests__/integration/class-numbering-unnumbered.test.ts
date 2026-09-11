/**
 * Bug-hunt #5: Junior Handler and Special Award Classes sit outside the RKC
 * licensed breed-class count and must carry classNumber = null (they render as
 * JHA/JHB and A/B/C). reorderClasses / resortShowClasses / bulkCreateClasses
 * all blindly set classNumber = i + 1, giving JH/SAC real RKC numbers and
 * shifting the breed-class sequence. All three now share isUnnumberedClassDef.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { showClasses } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeShow,
  makeShowClass,
  makeClassDef,
  makeBreed,
} from '../helpers/factories';

describe('class numbering — JH + Special Award stay unnumbered (bug-hunt #5)', () => {
  it('reorderClasses numbers only breed classes; JH and SAC get classNumber null', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open' });

    const ageDef = await makeClassDef({ type: 'age', name: 'Puppy Dog' });
    const ageDef2 = await makeClassDef({ type: 'age', name: 'Junior Dog' });
    const jhDef = await makeClassDef({ type: 'junior_handler', name: 'Junior Handling' });
    const sacDef = await makeClassDef({ type: 'special', name: 'Special Award Class 1' });

    const breed1 = await makeShowClass({ showId: show.id, breedId: breed.id, classDefinitionId: ageDef.id });
    const breed2 = await makeShowClass({ showId: show.id, breedId: breed.id, classDefinitionId: ageDef2.id });
    const jh = await makeShowClass({ showId: show.id, classDefinitionId: jhDef.id });
    const sac = await makeShowClass({ showId: show.id, classDefinitionId: sacDef.id });

    await createTestCaller(secretary).secretary.reorderClasses({
      showId: show.id,
      classIds: [breed1!.id, breed2!.id, jh!.id, sac!.id],
    });

    const rows = await testDb.query.showClasses.findMany({ where: eq(showClasses.showId, show.id) });
    const byId = new Map(rows.map((r) => [r.id, r]));

    // Breed classes get the running RKC numbers...
    expect(byId.get(breed1!.id)?.classNumber).toBe(1);
    expect(byId.get(breed2!.id)?.classNumber).toBe(2);
    // ...JH and Special Award Classes stay unnumbered.
    expect(byId.get(jh!.id)?.classNumber).toBeNull();
    expect(byId.get(sac!.id)?.classNumber).toBeNull();
  });
});
