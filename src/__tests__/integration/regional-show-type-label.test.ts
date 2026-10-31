import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { results } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { displayShowType, displayShowTypeLabel } from '@/lib/show-types';
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
 * Mandy, 25 Oct 2026: a dog's public page called the SV/WUSV regionals
 * "Championship". Regionals are stored as showType 'championship' with
 * showRuleset 'wusv'; `displayShowTypeLabel` (lib/show-types.ts) is the ONE
 * owner of what a show's type is called. The dog page's "Show record" badge
 * and "By show type" analytics tile must both come from it.
 */

describe('show type display — the owner', () => {
  it('a wusv show is a Regional, whatever its stored type', () => {
    expect(displayShowType('championship', 'wusv')).toBe('regional');
    expect(displayShowTypeLabel('championship', 'wusv')).toBe('Regional');
  });
  it('RKC types keep their labels', () => {
    expect(displayShowType('premier_open', 'rkc')).toBe('premier_open');
    expect(displayShowTypeLabel('premier_open', 'rkc')).toBe('Premier Open');
    expect(displayShowTypeLabel('championship', null)).toBe('Championship');
    expect(displayShowTypeLabel('championship')).toBe('Championship');
  });
  it('an unknown type falls back to the raw string', () => {
    expect(displayShowTypeLabel('mystery_show', 'rkc')).toBe('mystery_show');
  });
});

describe('a dog shown at an RKC championship show and a regional', () => {
  async function seed() {
    const owner = await makeUser({ role: 'exhibitor' });
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });
    const org = await makeOrg();
    const placed = async (opts: { name: string; showRuleset: 'rkc' | 'wusv'; daysAgo: number }) => {
      const show = await makeShow({
        organisationId: org.id,
        name: opts.name,
        status: 'completed',
        showType: 'championship',
        showRuleset: opts.showRuleset,
        startDate: dateStr(-opts.daysAgo),
        endDate: dateStr(-opts.daysAgo),
      });
      const cls = await makeShowClass({ showId: show.id, breedId: breed.id });
      const entry = await makeEntry({ showId: show.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed' });
      const ec = await makeEntryClass({ entryId: entry.id, showClassId: cls.id });
      const result = await makeResult({ entryClassId: ec.id, placement: 1 });
      await testDb.update(results).set({ publishedAt: new Date() }).where(eq(results.id, result.id));
    };
    await placed({ name: 'Label Test Championship Show', showRuleset: 'rkc', daysAgo: 40 });
    await placed({ name: 'Label Test Regional', showRuleset: 'wusv', daysAgo: 20 });
    return dog;
  }

  it('the Show record badge says Regional for the wusv show', async () => {
    const dog = await seed();
    const view = await createTestCaller(null).dogs.getPublicProfile({ id: dog.id });
    expect(view.showHistory).toHaveLength(2);
    const regional = view.showHistory.find((s) => s.showName === 'Label Test Regional')!;
    const rkc = view.showHistory.find((s) => s.showName === 'Label Test Championship Show')!;
    expect(regional.showRuleset).toBe('wusv');
    expect(displayShowTypeLabel(regional.showType, regional.showRuleset)).toBe('Regional');
    expect(displayShowTypeLabel(rkc.showType, rkc.showRuleset)).toBe('Championship');
  });

  it('By show type has a Regional tile and a Championship tile', async () => {
    const dog = await seed();
    const view = await createTestCaller(null).pro.getChampionshipProgress({ dogId: dog.id });
    const tiles = [...view.analytics.showTypeBreakdown].sort((a, b) => a.showType.localeCompare(b.showType));
    expect(tiles).toEqual([
      { showType: 'championship', label: 'Championship', count: 1, firsts: 1 },
      { showType: 'regional', label: 'Regional', count: 1, firsts: 1 },
    ]);
  });
});
