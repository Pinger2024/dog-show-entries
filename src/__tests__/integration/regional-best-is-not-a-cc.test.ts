/**
 * A Best Dog / Best Bitch at an SV regional is NOT a Challenge Certificate.
 *
 * Support request, Arnis Meijers, 3 Nov 2026: Primestein Astra's page said
 * "2 CC" — one real Bitch CC (North Eastern Championship Show, 11 Oct) and a
 * Best Bitch at the North East GSD Regional Group (5 Sep). Regionals are held
 * under GSDL/WUSV rules, not the RKC's, so no CCs are awarded there (Mandy
 * agreed, 8181–8183). But every regional is stored with show_type
 * 'championship', and the rule that turns a single-breed championship's Best
 * Dog/Bitch into the CC (Mandy 2026-07-09 — right for RKC shows) never looked
 * at the ruleset.
 *
 * The false CC went further than the badge: it fed the entry page's class
 * recommendations (getWinSummary.hasCC), Limited-show eligibility (a CC bars
 * a dog from Limited shows), Champion title tracking and the dashboard. One
 * rule, effectiveCcType (lib/effective-achievement-type.ts), now takes the
 * show — ruleset included — and every caller passes it.
 */
import { describe, it, expect } from 'vitest';
import { makeUser, makeOrg, makeBreed, makeShow, makeDog, makeAchievement } from '../helpers/factories';
import { createTestCaller } from '../helpers/context';
import { testDb } from '../helpers/db';
import { loadTitleAwards } from '@/server/services/title-awards';
import { getLimitedShowEligibility } from '@/server/services/limited-show-eligibility';

async function astra() {
  const owner = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg();
  const breed = await makeBreed({ name: 'German Shepherd Dog' });
  const regional = await makeShow({
    organisationId: org.id, breedId: breed.id, showType: 'championship', showScope: 'single_breed',
    showRuleset: 'wusv', status: 'completed', startDate: '2026-09-05', endDate: '2026-09-05',
  });
  const champ = await makeShow({
    organisationId: org.id, breedId: breed.id, showType: 'championship', showScope: 'single_breed',
    showRuleset: 'rkc', status: 'completed', startDate: '2026-10-11', endDate: '2026-10-11',
  });
  const dog = await makeDog({ ownerId: owner.id, breedId: breed.id, sex: 'bitch', dateOfBirth: '2024-01-01' });
  return { owner, breed, org, regional, champ, dog };
}

describe('a regional Best Bitch is not a CC', () => {
  it("Astra's record: one CC, and the regional win stays Best Bitch", async () => {
    const { owner, regional, champ, dog } = await astra();
    await makeAchievement({ dogId: dog.id, showId: regional.id, type: 'best_bitch', date: '2026-09-05' });
    await makeAchievement({ dogId: dog.id, showId: champ.id, type: 'bitch_cc', date: '2026-10-11' });

    const profile = await createTestCaller(owner).dogs.getPublicProfile({ id: dog.id });
    const types = profile.achievements.map((a) => [a.date, a.effectiveType]).sort();
    expect(types).toEqual([['2026-09-05', 'best_bitch'], ['2026-10-11', 'bitch_cc']]);

    const { awards } = await loadTitleAwards(testDb, dog.id, true);
    expect(awards.filter((a) => a.kind === 'cc')).toHaveLength(1);
  });

  it('a dog whose only "CC" is a regional Best Bitch has no CC: Limited shows and class choices stay open', async () => {
    const { owner, regional, dog } = await astra();
    await makeAchievement({ dogId: dog.id, showId: regional.id, type: 'best_bitch', date: '2026-09-05' });

    const eligibility = await getLimitedShowEligibility(testDb, dog.id);
    expect(eligibility.ineligible).toBe(false);

    const summary = await createTestCaller(owner).dogs.getWinSummary({ dogId: dog.id });
    expect(summary.hasCC).toBe(false);
  });

  it('a Best Bitch at an RKC single-breed championship still IS the CC (Mandy 2026-07-09)', async () => {
    const { owner, champ, dog } = await astra();
    await makeAchievement({ dogId: dog.id, showId: champ.id, type: 'best_bitch', date: '2026-10-11' });

    const profile = await createTestCaller(owner).dogs.getPublicProfile({ id: dog.id });
    expect(profile.achievements.map((a) => a.effectiveType)).toEqual(['bitch_cc']);
    expect((await getLimitedShowEligibility(testDb, dog.id)).ineligible).toBe(true);
  });
});
