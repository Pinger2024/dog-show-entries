/**
 * Mandy, 28 Oct 2026: a draft show with the secretary's name and email set
 * showed a green tick on the setup wizard's Details step AND a red "Secretary
 * contact details incomplete" in the lifecycle banner. Two procedures in
 * secretary.ts each decided "are the secretary details complete" by hand
 * (name + email vs all four fields). They must agree.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { shows } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeSecretaryWithOrg, makeShow } from '../helpers/factories';

async function both(caller: ReturnType<typeof createTestCaller>, showId: string) {
  const [autoDetect, blockers] = await Promise.all([
    caller.secretary.getChecklistAutoDetect({ showId }),
    caller.secretary.getPhaseBlockers({ showId }),
  ]);
  const all = JSON.stringify(blockers);
  return {
    ticked: autoDetect.secretary_details_set,
    flagged: all.includes('"no_secretary_details"'),
  };
}

describe('secretary details: wizard tick and lifecycle banner agree', () => {
  it('name + email only: neither ticked nor silent - tick is false AND blocker present', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({
      organisationId: org.id,
      showType: 'open',
      status: 'draft',
      secretaryName: 'Jane Smith',
      secretaryEmail: 'jane@example.com',
      secretaryAddress: null,
      secretaryPhone: null,
    });
    const caller = createTestCaller(user);

    const r = await both(caller, show.id);
    expect(r.flagged, 'banner should flag incomplete details').toBe(true);
    expect(r.ticked, 'wizard must not tick Details when the banner says incomplete').toBe(false);
  });

  it('all four set: ticked and no blocker', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({
      organisationId: org.id,
      showType: 'open',
      status: 'draft',
      secretaryName: 'Jane Smith',
      secretaryEmail: 'jane@example.com',
      secretaryAddress: null,
      secretaryPhone: null,
    });
    await testDb
      .update(shows)
      .set({ secretaryAddress: '1 High Street, Leeds', secretaryPhone: '07700 900123' })
      .where(eq(shows.id, show.id));

    const r = await both(createTestCaller(user), show.id);
    expect(r.ticked).toBe(true);
    expect(r.flagged).toBe(false);
  });
});
