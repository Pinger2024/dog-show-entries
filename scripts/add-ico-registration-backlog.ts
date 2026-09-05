/**
 * Surfaced 2026-04-28 by Paul Reynolds (paulatzarr@gmail.com) feedback —
 * he had no way to see who Remi is or what regulations apply to us before
 * trusting us with entry money. As part of the trust-and-credentials pass
 * we shipped Remi's identity, founder bios and a payments-handling story
 * on the public site, plus added the partnership trader-disclosure block
 * to the footer + Terms + Privacy.
 *
 * The remaining gap is ICO Data Protection registration. UK GDPR requires
 * any organisation processing personal data for non-domestic purposes to
 * be registered with the Information Commissioner's Office and pay the
 * annual data protection fee (Tier 1: ~£40 for small partnerships).
 *
 * Remi processes a lot of personal data — exhibitor accounts, dog
 * pedigrees, addresses, phone numbers, payment records. We are absolutely
 * in scope and should be registered. Currently we are not.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { backlog } from '../src/server/db/schema/backlog';
import { desc } from 'drizzle-orm';

const title = 'Register the Remi partnership with the ICO (Data Protection fee)';

const description = `UK GDPR requires any organisation processing personal
data for business purposes to be registered with the Information
Commissioner's Office and to pay the annual data protection fee. Remi
clearly is in scope: we process exhibitor names, addresses, phone
numbers, dog records, payment metadata, and act as data processor for
show societies as well.

Action: Michael to register the partnership "Michael James and Amanda
McAteer T/A Remi" at https://ico.org.uk/for-organisations/data-protection-fee/
Tier 1 fee (small business / sole trader / partnership) is £40-52/yr
depending on direct-debit choice. Once registered we get an ICO
registration number, which should be added to the public Privacy page
and the site footer.

Why this matters now:
1. Compliance — operating without registration when required is a
   civil offence (up to £4,350 fine), even though enforcement is rare
   for small businesses acting in good faith.
2. Trust — a public registration number is the strongest single signal
   that we take data protection seriously. Several of our prospects
   (Paul Reynolds 2026-04-28, etc.) flag the trust gap; this closes it.
3. Cheap and fast — 10 minutes online and £40 a year. Lowest-effort
   regulatory win available.

Once Michael has the registration number, update:
  src/app/(shows)/privacy/page.tsx  — add to Section 1 (Who we are)
  src/components/layout/footer.tsx  — add to legal-disclosure block`;

const priority = 'high' as const;
const questions = `- Does the partnership need a single ICO registration, or do Michael and Amanda each need one as joint controllers?
- Should we display the ICO number publicly (best practice yes, not legally required)?`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client);

  const [latest] = await db
    .select({ featureNumber: backlog.featureNumber })
    .from(backlog)
    .orderBy(desc(backlog.featureNumber))
    .limit(1);
  const nextNumber = (latest?.featureNumber ?? 0) + 1;

  const [inserted] = await db
    .insert(backlog)
    .values({
      featureNumber: nextNumber,
      title,
      description,
      questions,
      priority,
      status: 'awaiting_feedback',
    })
    .returning({ featureNumber: backlog.featureNumber, id: backlog.id });

  console.log(`Added backlog #${inserted.featureNumber}: ${title}`);
  await client.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
