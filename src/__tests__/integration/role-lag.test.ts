import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeOrg, makeMembership } from '../helpers/factories';

/**
 * Regression guard for commit 3e9bc93. The fix:
 * `src/server/trpc/procedures.ts:resolveCurrentRole` falls back to a fresh DB
 * read when the JWT-cached role is below the procedure's required tier. Without
 * it, freshly-promoted secretaries hit FORBIDDEN until they re-login.
 *
 * We simulate the lag by promoting the user directly in the DB while passing
 * a stale 'exhibitor' session into the test caller.
 */
describe('JWT/DB role lag', () => {
  it('lets a freshly-promoted user reach a secretaryProcedure with a stale exhibitor JWT', async () => {
    // The user is already a secretary in the DB (post-promotion)…
    const user = await makeUser({ role: 'secretary' });
    const org = await makeOrg();
    await makeMembership({ userId: user.id, organisationId: org.id });

    // …but their browser session still says exhibitor (JWT not refreshed yet).
    const staleSession = {
      id: user.id,
      email: user.email,
      name: user.name ?? '',
      role: 'exhibitor' as const,
    };
    const caller = createTestCaller(staleSession);

    const dashboard = await caller.secretary.getDashboard();

    expect(dashboard.organisations).toHaveLength(1);
    expect(dashboard.organisations[0]?.id).toBe(org.id);
  });

  it('still blocks a true exhibitor (DB role and JWT both say exhibitor)', async () => {
    const user = await makeUser({ role: 'exhibitor' });
    const caller = createTestCaller(user);

    await expect(caller.secretary.getDashboard()).rejects.toThrow(
      /Secretary or admin/,
    );
  });

  it('handles the promotion mid-session: DB role updated after caller built', async () => {
    // User starts as exhibitor in BOTH places…
    const user = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    await makeMembership({ userId: user.id, organisationId: org.id });

    // …caller built with the exhibitor session (mirroring real session cache)…
    const caller = createTestCaller(user);

    // …then the user is promoted in the DB (e.g. via invitations.accept).
    await testDb.update(users).set({ role: 'secretary' }).where(eq(users.id, user.id));

    // The next call should succeed despite the caller's stale session.
    const dashboard = await caller.secretary.getDashboard();
    expect(dashboard.organisations[0]?.id).toBe(org.id);
  });
});
