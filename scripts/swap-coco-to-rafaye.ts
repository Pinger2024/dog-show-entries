/**
 * Amanda 2026-05-22 ~20:25:
 *   "Rachel Craik entered Xibor Coco twice in post graduate. Change one
 *   of the entries to a different dog [Rafaye Kanto]. Owners: John
 *   McGough, Rachel Craik, Liam Henderson. No refund needed."
 *
 * Complications:
 *   • Two RAFAYE KANTO dog records exist (John created one at 13:58,
 *     Rachel another at 16:16). Same DOB, same name, same dog.
 *   • Picking John's record as canonical because it was created first.
 *   • Soft-delete Rachel's duplicate so Remi shows just one Rafaye.
 *
 * Steps:
 *   1. Replace dog_owners on John's Rafaye Kanto with the 3-owner list.
 *   2. Soft-delete Rachel's duplicate Rafaye Kanto record.
 *   3. Re-point the second XIBOR COCO entry at John's Rafaye Kanto.
 *
 * Run:
 *   npx tsx scripts/swap-coco-to-rafaye.ts          # dry-run
 *   npx tsx scripts/swap-coco-to-rafaye.ts --apply  # commit
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';

const CANONICAL_RAFAYE = 'b8bbadaf-3be5-4f83-a4ce-af1fcc453e8c'; // John's record
const DUPLICATE_RAFAYE = 'b5e37d64-38a2-4911-be98-5e730ca39e8b'; // Rachel's record
const DUPLICATE_COCO_ENTRY = '25c78221-4e65-4da0-84cf-ca51c176d0bb'; // second Coco entry

async function main() {
  const apply = process.argv.includes('--apply');
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  console.log(apply ? '🚀 APPLY mode' : '👀 DRY RUN');

  // --- 1. Set owners on canonical Rafaye Kanto -------------------------------
  const johnsUser = await db.query.users.findFirst({
    where: eq(schema.users.email, 'jackimann58@gmail.com'),
  });
  const rachelsUser = await db.query.users.findFirst({
    where: eq(schema.users.email, 'rachel_craik@yahoo.co.uk'),
  });

  const newOwners = [
    {
      dogId: CANONICAL_RAFAYE,
      ownerName: 'John McGough',
      ownerAddress: '',
      ownerEmail: johnsUser?.email ?? '',
      ownerPhone: null,
      userId: johnsUser?.id ?? null,
      sortOrder: 0,
      isPrimary: true,
    },
    {
      dogId: CANONICAL_RAFAYE,
      ownerName: 'Rachel Craik',
      ownerAddress: '',
      ownerEmail: rachelsUser?.email ?? '',
      ownerPhone: null,
      userId: rachelsUser?.id ?? null,
      sortOrder: 1,
      isPrimary: false,
    },
    {
      dogId: CANONICAL_RAFAYE,
      ownerName: 'Liam Henderson',
      ownerAddress: '',
      ownerEmail: '',
      ownerPhone: null,
      userId: null,
      sortOrder: 2,
      isPrimary: false,
    },
  ];

  console.log('\n=== Canonical Rafaye Kanto owners ===');
  for (const o of newOwners) {
    console.log(`  [${o.sortOrder}] ${o.ownerName}${o.isPrimary ? ' (primary)' : ''}  user_id=${o.userId ?? '—'}`);
  }

  // --- 2. Soft-delete the duplicate Rafaye record ----------------------------
  console.log(`\n=== Soft-deleting duplicate Rafaye Kanto (${DUPLICATE_RAFAYE}) ===`);

  // --- 3. Move the duplicate Coco entry to canonical Rafaye ------------------
  console.log(`\n=== Re-pointing entry ${DUPLICATE_COCO_ENTRY} → Rafaye Kanto (${CANONICAL_RAFAYE}) ===`);

  if (apply) {
    await db.transaction(async (tx) => {
      // Replace owners on canonical Rafaye
      await tx.delete(schema.dogOwners).where(eq(schema.dogOwners.dogId, CANONICAL_RAFAYE));
      await tx.insert(schema.dogOwners).values(newOwners);

      // Soft-delete the duplicate Rafaye record
      await tx
        .update(schema.dogs)
        .set({ deletedAt: new Date() })
        .where(eq(schema.dogs.id, DUPLICATE_RAFAYE));

      // Re-point the duplicate entry
      await tx
        .update(schema.entries)
        .set({ dogId: CANONICAL_RAFAYE, updatedAt: new Date() })
        .where(eq(schema.entries.id, DUPLICATE_COCO_ENTRY));
    });
    console.log('\n✅ Applied');
  } else {
    console.log('\n(dry run — re-run with --apply)');
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
