/**
 * Amanda 2026-05-22: "where dogs are owned in partnership, the dogs should
 * show in all users registered on Remi". The backend query for the dogs.list
 * tRPC procedure now matches any user with a `dog_owners.user_id` row
 * pointing at the dog. This backfill links Remi user accounts to the
 * joint-owner rows I created earlier today where the user_id was left
 * NULL because I didn't have an email hint at the time.
 *
 * Run from project root:
 *   npx tsx scripts/backfill-joint-owner-user-ids.ts         # dry-run
 *   npx tsx scripts/backfill-joint-owner-user-ids.ts --apply # commit
 *
 * Currently only John McGough has a Remi account amongst the joint-owners
 * I added — the others (Liam, Derek, Neil, Ben) don't have accounts. They
 * can be linked later when they sign up.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';

interface Pair {
  /** Lookup the dog by registered name. */
  dogName: string;
  /** Owner name in the dog_owners row (verbatim — we just trim+lower for match). */
  ownerName: string;
  /** Email of the Remi user account to link. */
  userEmail: string;
}

const PAIRS: Pair[] = [
  // John McGough is now a joint-owner on three dogs but his user_id was
  // only set on Rafaye Kanto. Link Amira + Xibor B'Yanka too.
  { dogName: 'AMIRA VOM FICHTENSCHLAG (IMP DEU)', ownerName: 'John McGough', userEmail: 'jackimann58@gmail.com' },
  { dogName: "XIBOR B'YANKA",                    ownerName: 'John McGough', userEmail: 'jackimann58@gmail.com' },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  console.log(apply ? '🚀 APPLY mode' : '👀 DRY RUN');

  for (const pair of PAIRS) {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, pair.userEmail),
    });
    if (!user) {
      console.warn(`⚠️  No user with email ${pair.userEmail} — skipping`);
      continue;
    }
    const dog = await db.query.dogs.findFirst({
      where: eq(schema.dogs.registeredName, pair.dogName),
    });
    if (!dog) {
      console.warn(`⚠️  No dog named "${pair.dogName}" — skipping`);
      continue;
    }

    const targetRow = await db.query.dogOwners.findFirst({
      where: and(
        eq(schema.dogOwners.dogId, dog.id),
        eq(schema.dogOwners.ownerName, pair.ownerName),
        isNull(schema.dogOwners.userId),
      ),
    });

    if (!targetRow) {
      console.log(`(skip) ${pair.dogName} · ${pair.ownerName}: no NULL-user_id row matched`);
      continue;
    }

    console.log(
      `${pair.dogName} · ${pair.ownerName}: link → user ${user.email} (${user.id})`,
    );

    if (apply) {
      await db
        .update(schema.dogOwners)
        .set({ userId: user.id, ownerEmail: user.email, updatedAt: new Date() })
        .where(eq(schema.dogOwners.id, targetRow.id));
      console.log('✅ Applied');
    }
  }

  await client.end();
  if (!apply) console.log('\n(dry run — re-run with --apply)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
