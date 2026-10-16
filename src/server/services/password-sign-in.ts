/**
 * Checking an email + password at sign-in. Extracted from the NextAuth
 * Credentials `authorize` (which tests cannot reach: `@/lib/auth` is mocked)
 * so it can be tested. The person is found by people.ts — the one owner for
 * "which users row is this email".
 */
import type { Database } from '@/server/db';
import { findPersonByEmail } from './people';

export interface PasswordSignInUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
}

/** The signed-in user, or null: no such person, closed account, no password set, or wrong password. */
export async function verifyPasswordSignIn(
  db: Database,
  email: string,
  password: string,
): Promise<PasswordSignInUser | null> {
  const user = await findPersonByEmail(db, email);
  if (!user?.passwordHash) return null;

  const { compare } = await import('bcryptjs');
  const valid = await compare(password, user.passwordHash);
  if (!valid) return null;

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
