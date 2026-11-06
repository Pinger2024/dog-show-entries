/**
 * Mandy, 30 Sept 2026 (bug-hunt rules question 10): "is a dog absent from all
 * her breed classes but shown in a Special Award class an absentee [on SH01]?"
 * — "no I don't believe she is".
 *
 * Already true: SH01 counts the entry's whole-show absent roll-up, which the
 * steward's per-class Mark Absent only sets once EVERY class is absent. This
 * pins Mandy's answer so the roll-up or SH01 can't drift from it.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrgAndBreed, makeShow, makeClassDef, makeDog, makeUser, makeStewardAssignment } from '../helpers/factories';
import * as schema from '@/server/db/schema';
import { computeSh01Stats, type Sh01EntryInput } from '@/lib/sh01-absentee';

describe('SH01 — a dog shown in a Special Award class is not an absentee', () => {
  it('absent from her breed class, shown in a Special Award class → counted, not absent', async () => {
    const { org, breed } = await makeSecretaryWithOrgAndBreed();
    const [steward, exhibitor] = await Promise.all([makeUser({ role: 'steward' }), makeUser({ role: 'exhibitor' })]);
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, showType: 'championship', status: 'in_progress' });
    await makeStewardAssignment({ userId: steward.id, showId: show.id });
    const openDef = await makeClassDef({ name: 'Open', type: 'achievement' });
    const sacDef = await makeClassDef({ name: 'Special Award Class - Open', type: 'special' });
    const [open] = await testDb.insert(schema.showClasses).values({ showId: show.id, classDefinitionId: openDef.id, sex: 'bitch', entryFee: 1800, sortOrder: 1 }).returning();
    const [sac] = await testDb.insert(schema.showClasses).values({ showId: show.id, classDefinitionId: sacDef.id, sex: null, entryFee: 500, sortOrder: 2 }).returning();
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, sex: 'bitch' });
    const [entry] = await testDb.insert(schema.entries).values({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed', catalogueNumber: '1', totalFee: 2300 }).returning();
    const [ecOpen] = await testDb.insert(schema.entryClasses).values({ entryId: entry!.id, showClassId: open!.id, fee: 1800 }).returning();
    await testDb.insert(schema.entryClasses).values({ entryId: entry!.id, showClassId: sac!.id, fee: 500 });

    await createTestCaller(steward).steward.markAbsent({ entryClassId: ecOpen!.id, absent: true });

    const saved = await testDb.query.entries.findFirst({
      where: eq(schema.entries.id, entry!.id),
      with: { dog: { with: { breed: true } } },
    });
    const { breeds } = computeSh01Stats([saved as unknown as Sh01EntryInput], [{ sex: 'bitch', breed: { name: breed.name } }]);
    expect(breeds[0]!.bitches).toBe(1);
    expect(breeds[0]!.absentBitches).toBe(0);
  });
});
