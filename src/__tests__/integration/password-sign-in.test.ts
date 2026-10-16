/**
 * verifyPasswordSignIn — what the NextAuth Credentials `authorize` calls.
 * The person is found through people.ts, so typing is forgiving (case,
 * spaces) and an `_` in an address is a letter, never a wildcard.
 */
import { describe, it, expect } from 'vitest';
import { hash } from 'bcryptjs';
import { verifyPasswordSignIn } from '@/server/services/password-sign-in';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';

describe('verifyPasswordSignIn', () => {
  it('signs in a lower-case stored address typed with capitals and spaces', async () => {
    const jane = await makeUser({ email: 'jane@test.local', passwordHash: await hash('correct-horse', 4) });
    const result = await verifyPasswordSignIn(testDb, '  Jane@Test.LOCAL ', 'correct-horse');
    expect(result).toMatchObject({ id: jane.id, email: 'jane@test.local', role: 'exhibitor' });
  });

  it('a wrong password is refused', async () => {
    await makeUser({ email: 'jane@test.local', passwordHash: await hash('correct-horse', 4) });
    expect(await verifyPasswordSignIn(testDb, 'jane@test.local', 'nope-nope')).toBeNull();
  });

  it('an account with no password cannot sign in with one', async () => {
    await makeUser({ email: 'nopass@test.local', passwordHash: null });
    expect(await verifyPasswordSignIn(testDb, 'nopass@test.local', 'anything')).toBeNull();
  });

  it('an unknown address is refused', async () => {
    expect(await verifyPasswordSignIn(testDb, 'nobody@test.local', 'x')).toBeNull();
  });

  it('a closed account cannot sign in', async () => {
    await makeUser({ email: 'gone@test.local', passwordHash: await hash('pw-pw-pw-1', 4), deletedAt: new Date() });
    expect(await verifyPasswordSignIn(testDb, 'gone@test.local', 'pw-pw-pw-1')).toBeNull();
  });

  it('an underscore typed in does not match another person\'s row', async () => {
    await makeUser({ email: 'axb@test.local', passwordHash: await hash('pw-pw-pw-1', 4) });
    expect(await verifyPasswordSignIn(testDb, 'a_b@test.local', 'pw-pw-pw-1')).toBeNull();
  });
});
