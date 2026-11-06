/**
 * Backlog item: secretaries cannot add a Junior Handler entry by hand.
 *
 * Mandy asked for this on 2026-07-27 after I had to create one by script
 * (scripts/add-jh-entry-alexxa-cowan.ts) because the UI structurally cannot.
 *
 *   npx tsx scripts/add-jh-manual-entry-backlog.ts           # dry run
 *   npx tsx scripts/add-jh-manual-entry-backlog.ts --commit  # write
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { desc, ilike } from 'drizzle-orm';
import { backlog } from '../src/server/db/schema/backlog';

const COMMIT = process.argv.includes('--commit');

const TITLE = 'Entries — let a secretary add a Junior Handler by hand';

const DESCRIPTION = [
  'A secretary cannot add a Junior Handler entry at all. Mandy hit this on',
  'South Western (2026-07-27) and had to ask for it to be done by script.',
  '',
  'Why it is structural rather than an oversight:',
  '- secretary.createManualEntry requires dogId (z.string().uuid(), not optional)',
  '- a Junior Handler entry has NO dog — dog_id IS NULL on every JH entry',
  '- the Add Entry dialog is dog-first: the dog drives sex filtering, age',
  '  eligibility and GSD-only class filtering',
  '- so JH classes are deliberately excluded from the class picker',
  "  (entries/page.tsx: if classDefinition?.type === 'junior_handler' return false).",
  '  That exclusion is CORRECT today — without it you could create a malformed',
  '  JH entry with a dog attached and no handler name or date of birth, which',
  '  would then print in the catalogue and judges book with a blank handler.',
  '',
  'Manual entries themselves work fine: the dialog offers Bank Transfer /',
  'Postal (cheque) / Cash / Online, creating an order with no Stripe',
  'PaymentIntent, i.e. "paid direct to the club".',
  '',
  'What to build: a branch at the top of the wizard — "Adding a dog, or a',
  'Junior Handler?" — with a JH path capturing handler name, date of birth',
  '(NOT NULL in junior_handler_details) and optional KC number instead of a',
  'dog, then offering only the JH classes. The backend is most of the way',
  "there: orders.createOrder already handles entryType 'junior_handler' with",
  'handlerName/handlerDob; createManualEntry needs widening to accept a',
  'dogless JH shape.',
  '',
  'Same family as the open JH judge-assignment gap — Junior Handling keeps',
  'turning out to be second-class in the secretary tooling.',
].join('\n');

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client);

  console.log(`DB: ${process.env.DATABASE_URL!.replace(/:\/\/[^:]+:[^@]+@/, '://***@')}`);
  console.log(COMMIT ? '*** COMMIT MODE ***\n' : 'DRY RUN (pass --commit to write)\n');

  const clash = await db.select().from(backlog).where(ilike(backlog.title, '%Junior Handler by hand%'));
  if (clash.length > 0) {
    console.log(`ALREADY PRESENT — feature #${clash[0]!.featureNumber}: ${clash[0]!.title}`);
    await client.end();
    return;
  }

  const [highest] = await db
    .select({ featureNumber: backlog.featureNumber })
    .from(backlog)
    .orderBy(desc(backlog.featureNumber))
    .limit(1);
  const featureNumber = (highest?.featureNumber ?? 0) + 1;

  console.log(`feature #${featureNumber}: ${TITLE}`);
  console.log(`priority: medium · status: awaiting_feedback\n`);
  console.log(DESCRIPTION);

  if (!COMMIT) {
    console.log('\nDry run — nothing written.');
    await client.end();
    return;
  }

  await db.insert(backlog).values({
    featureNumber,
    title: TITLE,
    description: DESCRIPTION,
    priority: 'medium',
    status: 'awaiting_feedback',
    latestResponse: 'Mandy 2026-07-27: "yes add to the list please".',
  });
  console.log(`\nCREATED backlog #${featureNumber}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
