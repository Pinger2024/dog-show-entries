/**
 * Mandy, 30 Sept 2026 (bug-hunt question 6): "yes add member now" — a member
 * choice on the secretary's Add Entry dialog.
 *
 * Until now a hand-keyed entry was always priced as a non-member (the
 * dialog had no member control — Mandy's 16 Sept decision, now reversed).
 * North Eastern 2026: Ann Robinson's extra dog was keyed by the club and
 * charged the non-member rate although she is a member.
 *
 * One owner for what a declared membership means — `resolveEntryMembership`
 * (RKC discount group, or a regional membership label) — shared by online
 * checkout and the manual entry, and one list of a regional show's membership
 * options, `regionalMembershipOptions`, shared by the enter page, checkout and
 * the Add Entry dialog.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrg, makeBreed, makeShow, makeShowClass, makeDog, makeUser } from '../helpers/factories';
import * as schema from '@/server/db/schema';

async function setup(kind: 'rkc' | 'wusv') {
  const { user: secretary, org } = await makeSecretaryWithOrg();
  const breed = await makeBreed({ name: 'German Shepherd Dog' });
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    showScope: 'single_breed',
    showRuleset: kind,
    status: 'entries_open',
    firstEntryFee: 1800,
    subsequentEntryFee: 1800,
    ...(kind === 'wusv'
      ? {
          regionalFeeConfig: {
            tiers: [{ standardPence: 2000, memberPence: 1700 }],
            firstTimeEnabled: false,
            firstTimeFeePence: 0,
            donationsEnabled: false,
          },
        }
      : {}),
  });
  const showClass = await makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 1800 });
  const exhibitor = await makeUser({ role: 'exhibitor', email: `member-${show.id.slice(0, 8)}@example.com` });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
  const [members] = await testDb
    .insert(schema.showDiscountGroups)
    .values({ showId: show.id, label: 'Members', firstEntryFeePence: 1600 })
    .returning();
  const caller = createTestCaller(secretary);
  const base = { showId: show.id, classIds: [showClass.id], exhibitorEmail: exhibitor.email, isNfc: false };
  return { show, dog, members: members!, caller, base };
}

describe('Add Entry — the member choice prices exactly as online checkout does', () => {
  it('RKC: choosing the Members group charges the member rate, in the preview and the saved entry', async () => {
    const { dog, members, caller, base } = await setup('rkc');
    expect((await caller.secretary.previewManualEntryFee(base)).entryFee).toBe(1800);
    expect((await caller.secretary.previewManualEntryFee({ ...base, discountGroupId: members.id })).entryFee).toBe(1600);

    const saved = await caller.secretary.createManualEntry({ ...base, dogId: dog.id, discountGroupId: members.id });
    const entry = await testDb.query.entries.findFirst({ where: eq(schema.entries.id, saved.id) });
    expect(entry!.totalFee).toBe(1600);
  });

  it('regional: choosing the membership charges the member column, and the order records it', async () => {
    const { dog, caller, base } = await setup('wusv');
    expect((await caller.secretary.previewManualEntryFee(base)).entryFee).toBe(2000);
    expect(
      (await caller.secretary.previewManualEntryFee({ ...base, regionalMembership: 'BRG/League member' })).entryFee,
    ).toBe(1700);

    const saved = await caller.secretary.createManualEntry({ ...base, dogId: dog.id, regionalMembership: 'BRG/League member' });
    const entry = await testDb.query.entries.findFirst({ where: eq(schema.entries.id, saved.id) });
    expect(entry!.totalFee).toBe(1700);
    const order = await testDb.query.orders.findFirst({ where: eq(schema.orders.id, entry!.orderId!) });
    expect(order!.regionalMembership).toBe('BRG/League member');
  });

  it('refuses a membership the show does not offer', async () => {
    const rkc = await setup('rkc');
    const other = await setup('rkc');
    await expect(
      rkc.caller.secretary.previewManualEntryFee({ ...rkc.base, discountGroupId: other.members.id }),
    ).rejects.toThrow(/discount group not valid/i);
    const wusv = await setup('wusv');
    await expect(
      wusv.caller.secretary.previewManualEntryFee({ ...wusv.base, regionalMembership: 'Made-up Club' }),
    ).rejects.toThrow(/unknown membership/i);
  });

  it('checkout and the manual entry share one membership owner; the default option list lives once', () => {
    const read = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');
    expect(read('server', 'trpc', 'routers', 'orders.ts')).toMatch(/resolveEntryMembership\(/);
    expect(read('server', 'services', 'manual-entry-pricing.ts')).toMatch(/membership/);
    expect(read('server', 'trpc', 'routers', 'secretary.ts')).toMatch(/resolveEntryMembership\(/);
    for (const p of [
      ['server', 'trpc', 'routers', 'orders.ts'],
      ['app', '(shows)', 'shows', '[id]', 'enter', 'page.tsx'],
    ]) {
      expect(read(...p), p.join('/')).not.toMatch(/label: 'BRG\/League member'/);
    }
  });
});
