/**
 * A person, found by their email address. ONE owner for "which users row is
 * this email" — sign-in, password reset, register, invitations, the
 * secretary's Add Entry and Add Steward, and buying extras without signing in
 * (Mandy, 15 Oct 2026) all ask here.
 *
 * Until 16 Oct 2026 there were six copies: two used `ilike` (where `_` and `%`
 * in an address are wildcards, so one email could match another person's
 * row), the rest `eq` on a lower-cased input with or without a trim. Every
 * stored address is lower-case and trimmed, and this module keeps it so.
 * Guarded by src/__tests__/guards/people-by-email-one-owner.test.ts.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '@/server/db';
import { users } from '@/server/db/schema';

/** How an email address is stored and compared: trimmed and lower-case. */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The live (not closed) users row for this address, or null. */
export async function findPersonByEmail(db: Database, rawEmail: string) {
  const email = normaliseEmail(rawEmail);
  if (!email) return null;
  const [person] = await db
    .select()
    .from(users)
    .where(and(eq(sql`lower(${users.email})`, email), isNull(users.deletedAt)))
    .limit(1);
  return person ?? null;
}

/**
 * The person behind an order placed WITHOUT signing in. An address that is
 * already on Remi is used as it is: nothing about that account changes, so a
 * name typed at checkout can never rename someone. A new address gets a row
 * with the typed name and no password; it is never signed in by this. The
 * person can sign in later with an emailed link (the Resend provider), which
 * lands on My Entries rather than the welcome wizard — hence
 * onboardingCompletedAt — and the dog-entry profile gate asks for an address
 * if they ever enter a dog.
 */
export async function findOrCreatePersonByEmail(
  db: Database,
  details: { email: string; name: string },
): Promise<{ person: typeof users.$inferSelect; created: boolean }> {
  const email = normaliseEmail(details.email);
  if (!email) throw new Error('findOrCreatePersonByEmail: an email is required');

  const existing = await findPersonByEmail(db, email);
  if (existing) return { person: existing, created: false };

  const [inserted] = await db
    .insert(users)
    .values({
      email,
      name: details.name.trim(),
      onboardingCompletedAt: new Date(),
    })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (inserted) return { person: inserted, created: true };

  // Someone else created this address between our look and our insert.
  const raced = await findPersonByEmail(db, email);
  if (!raced) throw new Error('findOrCreatePersonByEmail: row vanished after a conflict');
  return { person: raced, created: false };
}
