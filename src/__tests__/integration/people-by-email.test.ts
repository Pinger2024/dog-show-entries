/**
 * ONE owner for "which users row is this email" — src/server/services/people.ts.
 * Buying extras without signing in (Mandy, 15 Oct 2026) files the order under
 * the person found or created here, so it must never rename an account, never
 * match the wrong one, and never make a second row for one address.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@/server/db/schema';
import { normaliseEmail, findPersonByEmail, findOrCreatePersonByEmail } from '@/server/services/people';
import { testDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';

describe('people by email', () => {
  it('normalises an address: trimmed, lower-case', () => {
    expect(normaliseEmail('  Jane.Smith@Example.COM ')).toBe('jane.smith@example.com');
  });

  it('finds the account whatever case the address is typed in', async () => {
    const jane = await makeUser({ email: 'jane@test.local' });
    expect((await findPersonByEmail(testDb, ' JANE@Test.Local '))?.id).toBe(jane.id);
  });

  it('an underscore typed in is a letter, not a wildcard — one address never matches another person', async () => {
    await makeUser({ email: 'axb@test.local' });
    expect(await findPersonByEmail(testDb, 'a_b@test.local')).toBeNull();
    expect(await findPersonByEmail(testDb, 'a%@test.local')).toBeNull();
  });

  it('a closed account is not found', async () => {
    await makeUser({ email: 'gone@test.local', deletedAt: new Date() });
    expect(await findPersonByEmail(testDb, 'gone@test.local')).toBeNull();
  });

  it('a new address gets one row: lower-case, the typed name, no password, onboarded', async () => {
    const { person, created } = await findOrCreatePersonByEmail(testDb, {
      email: ' New.Buyer@Test.Local',
      name: '  Pat Buyer ',
    });
    expect(created).toBe(true);
    expect(person.email).toBe('new.buyer@test.local');
    expect(person.name).toBe('Pat Buyer');
    expect(person.passwordHash).toBeNull();
    expect(person.emailVerified).toBeNull();
    expect(person.onboardingCompletedAt).not.toBeNull();
    expect(person.role).toBe('exhibitor');
  });

  it('an address already on Remi is used as it is — the typed name never renames the account', async () => {
    const jane = await makeUser({ email: 'jane@test.local', name: 'Jane Smith' });
    const { person, created } = await findOrCreatePersonByEmail(testDb, { email: 'Jane@test.local', name: 'Someone Else' });
    expect(created).toBe(false);
    expect(person.id).toBe(jane.id);
    const [row] = await testDb.select().from(users).where(eq(users.id, jane.id));
    expect(row.name).toBe('Jane Smith');
  });

  it('two checkouts with the same new address at once make ONE row', async () => {
    const [a, b] = await Promise.all([
      findOrCreatePersonByEmail(testDb, { email: 'twice@test.local', name: 'A' }),
      findOrCreatePersonByEmail(testDb, { email: 'twice@test.local', name: 'B' }),
    ]);
    expect(a.person.id).toBe(b.person.id);
    const rows = await testDb.select().from(users).where(eq(users.email, 'twice@test.local'));
    expect(rows).toHaveLength(1);
  });
});
