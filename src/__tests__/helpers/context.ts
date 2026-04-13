import { createCaller } from '@/server/trpc/router';
import { testDb } from './db';

export type TestRole = 'exhibitor' | 'secretary' | 'steward' | 'judge' | 'admin';

export interface TestSessionUser {
  id: string;
  email: string;
  name: string;
  role: TestRole;
}

/**
 * Build a tRPC caller with an injected session. Bypasses NextAuth entirely —
 * tests construct the user via factories first, then pass them in here.
 *
 * Usage:
 *   const user = await makeUser({ role: 'secretary' });
 *   const caller = createTestCaller(user);
 *   await caller.secretary.createShow({ ... });
 */
export function createTestCaller(
  user: TestSessionUser | null,
  opts: { impersonating?: TestSessionUser | null } = {},
) {
  return createCaller({
    db: testDb,
    session: user
      ? {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        }
      : null,
    impersonating: opts.impersonating
      ? {
          id: opts.impersonating.id,
          email: opts.impersonating.email,
          name: opts.impersonating.name,
          role: opts.impersonating.role,
        }
      : null,
    callerIsAdmin: user?.role === 'admin',
  });
}
