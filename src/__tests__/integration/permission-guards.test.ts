import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeSecretaryWithOrg, makeShow, makeJudge, makeJudgeAssignment } from '../helpers/factories';

/**
 * Sweep tests for the four tRPC procedure types' permission guards. These
 * exercise the middleware in `src/server/trpc/procedures.ts` once per role
 * combination — they're the safety net that catches "I forgot to use
 * secretaryProcedure" regressions.
 *
 * For each procedure type we pick ONE representative procedure as a canary
 * rather than testing every procedure in the codebase. The middleware is
 * the same code for all of them, so one canary per type is enough to prove
 * the middleware works; per-procedure tests live in the relevant feature
 * test files.
 */

describe('secretaryProcedure (canary: secretary.getDashboard)', () => {
  it('admits a secretary', async () => {
    const { user } = await makeSecretaryWithOrg();
    const caller = createTestCaller(user);
    await expect(caller.secretary.getDashboard()).resolves.toBeDefined();
  });

  it('admits an admin (admin can act as secretary)', async () => {
    const admin = await makeUser({ role: 'admin' });
    const caller = createTestCaller(admin);
    await expect(caller.secretary.getDashboard()).resolves.toBeDefined();
  });

  it('rejects an exhibitor', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const caller = createTestCaller(exhibitor);
    await expect(caller.secretary.getDashboard()).rejects.toThrow(/Secretary or admin/);
  });

  it('rejects a steward', async () => {
    const steward = await makeUser({ role: 'steward' });
    const caller = createTestCaller(steward);
    await expect(caller.secretary.getDashboard()).rejects.toThrow(/Secretary or admin/);
  });

  it('rejects an unauthenticated caller', async () => {
    const caller = createTestCaller(null);
    await expect(caller.secretary.getDashboard()).rejects.toThrow();
  });
});

describe('stewardProcedure (canary: steward.getMyShows)', () => {
  it('admits a steward', async () => {
    const steward = await makeUser({ role: 'steward' });
    const caller = createTestCaller(steward);
    await expect(caller.steward.getMyShows()).resolves.toEqual([]);
  });

  it('admits a secretary', async () => {
    const secretary = await makeUser({ role: 'secretary' });
    const caller = createTestCaller(secretary);
    await expect(caller.steward.getMyShows()).resolves.toEqual([]);
  });

  it('admits an admin', async () => {
    const admin = await makeUser({ role: 'admin' });
    const caller = createTestCaller(admin);
    await expect(caller.steward.getMyShows()).resolves.toEqual([]);
  });

  it('rejects an exhibitor', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const caller = createTestCaller(exhibitor);
    await expect(caller.steward.getMyShows()).rejects.toThrow(/Steward, secretary, or admin/);
  });

  it('rejects an unauthenticated caller', async () => {
    const caller = createTestCaller(null);
    await expect(caller.steward.getMyShows()).rejects.toThrow();
  });
});

describe('adminProcedure (canary: admin.getStats)', () => {
  it('admits an admin', async () => {
    const admin = await makeUser({ role: 'admin' });
    const caller = createTestCaller(admin);
    await expect(caller.admin.getStats()).resolves.toBeDefined();
  });

  it('rejects a secretary (no role escalation)', async () => {
    const secretary = await makeUser({ role: 'secretary' });
    const caller = createTestCaller(secretary);
    await expect(caller.admin.getStats()).rejects.toThrow(/Admin access required/);
  });

  it('rejects a steward', async () => {
    const steward = await makeUser({ role: 'steward' });
    const caller = createTestCaller(steward);
    await expect(caller.admin.getStats()).rejects.toThrow(/Admin access required/);
  });

  it('rejects an exhibitor', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const caller = createTestCaller(exhibitor);
    await expect(caller.admin.getStats()).rejects.toThrow(/Admin access required/);
  });

  it('rejects an unauthenticated caller', async () => {
    const caller = createTestCaller(null);
    await expect(caller.admin.getStats()).rejects.toThrow();
  });
});

describe('admin impersonation invariants', () => {
  it('admin impersonating a secretary keeps admin powers (isAdmin uses the real session)', async () => {
    // Security-critical: impersonation must never let a non-admin reach admin
    // procedures, AND must not strip admin powers from the real admin.
    const admin = await makeUser({ role: 'admin' });
    const { user: secretary } = await makeSecretaryWithOrg();
    const caller = createTestCaller(admin, { impersonating: secretary });

    await expect(caller.admin.getStats()).resolves.toBeDefined();
  });

  it('admin impersonating a secretary calls secretaryProcedure AS the secretary', async () => {
    // Proves the effective-session swap works for non-admin procedures —
    // the dashboard query returns the SECRETARY's orgs, not the admin's.
    const admin = await makeUser({ role: 'admin' });
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const caller = createTestCaller(admin, { impersonating: secretary });

    const dashboard = await caller.secretary.getDashboard();
    expect(dashboard.organisations).toHaveLength(1);
    expect(dashboard.organisations[0]?.id).toBe(org.id);
  });
});

describe('cross-club isolation (2026-06-12 review)', () => {
  it("a secretary cannot read another club's show entry stats", async () => {
    const { org: orgA } = await makeSecretaryWithOrg();
    const showA = await makeShow({ organisationId: orgA.id, status: 'entries_open' });

    const { user: rivalSecretary } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(rivalSecretary).secretary.getShowEntryStats({ showId: showA.id }),
    ).rejects.toThrow();
  });

  it("a secretary cannot read another club's show phase context", async () => {
    const { org: orgA } = await makeSecretaryWithOrg();
    const showA = await makeShow({ organisationId: orgA.id, status: 'entries_open' });

    const { user: rivalSecretary } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(rivalSecretary).secretary.getShowPhaseContext({ showId: showA.id }),
    ).rejects.toThrow();
  });

  it("a secretary cannot edit a judge engaged by another club", async () => {
    // Club A engages the judge
    const { org: orgA } = await makeSecretaryWithOrg();
    const showA = await makeShow({ organisationId: orgA.id });
    const judge = await makeJudge({ contactEmail: 'judge@example.com' });
    await makeJudgeAssignment({ showId: showA.id, judgeId: judge.id });

    // Club B's secretary tries to redirect the judge's email
    const { user: rivalSecretary } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(rivalSecretary).secretary.updateJudge({
        judgeId: judge.id,
        contactEmail: 'intercepted@evil.example.com',
      }),
    ).rejects.toThrow(/another club/i);
  });

  it("addAndAssignJudge cannot overwrite a rival club's judge contact email", async () => {
    // Club A engages a judge with a KC number (semi-public information).
    const { org: orgA } = await makeSecretaryWithOrg();
    const showA = await makeShow({ organisationId: orgA.id });
    const judge = await makeJudge({
      contactEmail: 'judge@example.com',
      kcNumber: 'KC-GUARD-1',
    });
    await makeJudgeAssignment({ showId: showA.id, judgeId: judge.id });

    // Club B's secretary "adds" the same judge by KC number with a
    // different email — the assignment may proceed, but the shared
    // judge's contact email must not change.
    const { user: rivalSecretary, org: orgB } = await makeSecretaryWithOrg();
    const breed = await (await import('../helpers/factories')).makeBreed();
    const showB = await makeShow({ organisationId: orgB.id, breedId: breed.id });
    await createTestCaller(rivalSecretary).secretary.addAndAssignJudge({
      showId: showB.id,
      name: judge.name,
      kcNumber: 'KC-GUARD-1',
      contactEmail: 'intercepted@evil.example.com',
      assignments: [{ breedId: breed.id, sex: null }],
    });

    const { judges } = await import('@/server/db/schema');
    const { eq } = await import('drizzle-orm');
    const { testDb } = await import('../helpers/db');
    const refreshed = await testDb.query.judges.findFirst({ where: eq(judges.id, judge.id) });
    expect(refreshed?.contactEmail).toBe('judge@example.com');
  });
});
