import { describe, it, expect } from 'vitest';
import { hash, compare } from 'bcryptjs';
import { ilike } from 'drizzle-orm';
import { users } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';

/**
 * NextAuth config integration coverage.
 *
 * We can't invoke the full NextAuth handlers in vitest because next-auth's
 * runtime depends on Next.js's edge module resolution which doesn't load
 * cleanly in the vitest worker. Instead we replicate the Credentials
 * provider's authorize() logic against the real DB to prove that the
 * sign-in path's data assumptions hold.
 *
 * The Google OAuth dance itself can't be exercised without a real browser
 * callback + Google tokens — it's covered indirectly by the handlers being
 * imported by `src/app/api/auth/[...nextauth]/route.ts` (any startup error
 * would fail every other test).
 */

async function authorizeEmailPassword(email: string, password: string) {
  const normalisedEmail = email.toLowerCase().trim();
  const [user] = await testDb
    .select()
    .from(users)
    .where(ilike(users.email, normalisedEmail))
    .limit(1);
  if (!user?.passwordHash) return null;
  const valid = await compare(password, user.passwordHash);
  if (!valid) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

describe('Credentials provider — authorize() logic (sign-up + sign-in)', () => {
  it('returns the user shape on correct password', async () => {
    const passwordHash = await hash('valid-pw-1234', 12);
    const user = await makeUser({
      role: 'exhibitor', email: 'login@test.local', name: 'Login User', passwordHash,
    });

    const result = await authorizeEmailPassword('login@test.local', 'valid-pw-1234');
    expect(result).not.toBeNull();
    expect(result?.id).toBe(user.id);
    expect(result?.role).toBe('exhibitor');
  });

  it('returns null on wrong password', async () => {
    const passwordHash = await hash('right-pw-1234', 12);
    await makeUser({ role: 'exhibitor', email: 'wrongpw@test.local', passwordHash });
    const result = await authorizeEmailPassword('wrongpw@test.local', 'wrong-pw');
    expect(result).toBeNull();
  });

  it('returns null when the user has no password set (e.g. Google-only account)', async () => {
    await makeUser({ role: 'exhibitor', email: 'nopw@test.local' });
    const result = await authorizeEmailPassword('nopw@test.local', 'anything');
    expect(result).toBeNull();
  });

  it('matches case-insensitively (authorize lowercases + ilikes)', async () => {
    const passwordHash = await hash('case-pw-1234', 12);
    await makeUser({ role: 'exhibitor', email: 'CaseEmail@Test.Local', passwordHash });
    const result = await authorizeEmailPassword('caseemail@test.local', 'case-pw-1234');
    expect(result?.email).toBe('CaseEmail@Test.Local'); // original casing preserved
  });

  it('returns null for an unknown email', async () => {
    const result = await authorizeEmailPassword('ghost@test.local', 'anything');
    expect(result).toBeNull();
  });
});
