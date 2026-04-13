import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeSecretaryWithOrg } from '../helpers/factories';

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
