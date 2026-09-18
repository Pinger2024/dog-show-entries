/**
 * Same bug as sv-results-coat-type.test.ts (Mandy, NE GSD Regional,
 * 5 Sept 2026), covering the two notification/share surfaces that build
 * their own className+sexLabel by hand: the exhibitor results email
 * (`sendExhibitorResultsEmails`) and the results-milestone social caption
 * (`createResultsMilestonePosts`), both in
 * src/server/services/results-notifications.ts.
 *
 * setup.ts globally mocks this module for every other test (so
 * publish-results.test.ts etc. can assert it was CALLED without actually
 * sending email) — this file unmocks it to exercise the real HTML/caption
 * building logic.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.unmock('@/server/services/results-notifications');

import { eq, and } from 'drizzle-orm';
import { dogOwners, dogTimelinePosts } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { resendMocks } from '../helpers/resend-mocks';
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
} from '../helpers/factories';
import {
  sendExhibitorResultsEmails,
  createResultsMilestonePosts,
} from '@/server/services/results-notifications';

const PAST = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 14);
  return d.toISOString().slice(0, 10);
})();

async function showWithOnePlacedEntry(showRuleset: 'rkc' | 'wusv', svCoatType?: 'stock' | 'long_stock') {
  const [org, breed] = await Promise.all([makeOrg(), makeBreed()]);
  const show = await makeShow({
    organisationId: org.id, breedId: breed.id, showRuleset,
    status: 'completed', startDate: PAST, endDate: PAST,
  });
  // "SV Yearling" carries the disambiguation prefix some sv_age defs have —
  // the RKC branch uses a plain name to prove svDisplayAge is a no-op there.
  const ageDef = svCoatType
    ? await makeClassDef({ type: 'sv_age', name: 'SV Yearling' })
    : await makeClassDef({ name: 'Post Graduate' });
  const showClass = await makeShowClass({
    showId: show.id, breedId: breed.id, classDefinitionId: ageDef.id,
    sex: 'bitch', svCoatType: svCoatType ?? null,
  });
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id, sex: 'bitch' });
  const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: exhibitor.id, status: 'confirmed' });
  const ec = await makeEntryClass({ entryId: entry.id, showClassId: showClass.id });
  await makeResult({ entryClassId: ec.id, placement: 1 });

  // sendExhibitorResultsEmails needs the exhibitor's email — set explicitly
  // (factory default may already fill one, but be certain here).
  return { show, showClass, exhibitor, dog };
}

describe('sendExhibitorResultsEmails — coat wording (2026-09-05)', () => {
  beforeEach(() => {
    resendMocks.send.mockClear();
  });

  it('a wusv show carries the coat in the class row', async () => {
    const { show } = await showWithOnePlacedEntry('wusv', 'long_stock');
    await sendExhibitorResultsEmails(show.id);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const html = (resendMocks.send.mock.calls[0] as unknown as [{ html: string }])[0].html;
    expect(html).toContain('Long Coat');
    expect(html).toContain('Yearling');
    expect(html).not.toContain('SV Yearling');
  });

  it('an RKC show is unchanged — no coat wording, no prefix stripping needed', async () => {
    const { show } = await showWithOnePlacedEntry('rkc');
    await sendExhibitorResultsEmails(show.id);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const html = (resendMocks.send.mock.calls[0] as unknown as [{ html: string }])[0].html;
    expect(html).not.toContain('Long Coat');
    expect(html).not.toContain('Short Coat');
    expect(html).toContain('Post Graduate');
  });
});

describe('createResultsMilestonePosts — coat wording in the share caption (2026-09-05)', () => {
  it('a wusv show caption carries the coat', async () => {
    const { show, dog, exhibitor } = await showWithOnePlacedEntry('wusv', 'stock');
    await testDb.insert(dogOwners).values({
      dogId: dog.id,
      userId: exhibitor.id,
      ownerName: 'Test Owner',
      ownerAddress: '1 Test Street',
      ownerEmail: 'owner@test.local',
      isPrimary: true,
    });

    await createResultsMilestonePosts(show.id);

    const post = await testDb.query.dogTimelinePosts.findFirst({
      where: and(eq(dogTimelinePosts.dogId, dog.id), eq(dogTimelinePosts.sourceShowId, show.id)),
    });
    expect(post).toBeDefined();
    expect(post!.caption).toContain('Short Coat');
    expect(post!.caption).toContain('Yearling');
    expect(post!.caption).not.toContain('SV Yearling');
  });

  it('an RKC show caption is unchanged — no coat wording, no prefix stripping needed', async () => {
    const { show, dog, exhibitor } = await showWithOnePlacedEntry('rkc');
    await testDb.insert(dogOwners).values({
      dogId: dog.id,
      userId: exhibitor.id,
      ownerName: 'Test Owner',
      ownerAddress: '1 Test Street',
      ownerEmail: 'owner@test.local',
      isPrimary: true,
    });

    await createResultsMilestonePosts(show.id);

    const post = await testDb.query.dogTimelinePosts.findFirst({
      where: and(eq(dogTimelinePosts.dogId, dog.id), eq(dogTimelinePosts.sourceShowId, show.id)),
    });
    expect(post).toBeDefined();
    expect(post!.caption).not.toContain('Long Coat');
    expect(post!.caption).not.toContain('Short Coat');
    expect(post!.caption).toContain('Post Graduate');
  });
});
