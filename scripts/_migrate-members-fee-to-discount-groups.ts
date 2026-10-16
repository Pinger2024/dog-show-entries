/**
 * One-shot pre-migration for the discount-groups schema push.
 *
 * Any show that has a non-null members_entry_fee_pence is converted into
 * a "Members" row in the new show_discount_groups table BEFORE drizzle-kit
 * drops the column. Idempotent: skips if the show already has a discount
 * group with the label "Members".
 *
 * Run BEFORE `drizzle-kit push`. Safe to run against demo and prod (prod
 * column doesn't exist in the live schema yet, so this will be a no-op
 * there until the WUSV branch lands).
 */
import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(url);

  // Check the column exists — bail early if it doesn't (already migrated)
  const colCheck = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'shows' AND column_name = 'members_entry_fee_pence'
    ) AS exists
  `;
  if (!colCheck[0]?.exists) {
    console.log('Column shows.members_entry_fee_pence does not exist — nothing to migrate.');
    await sql.end();
    return;
  }

  // Ensure show_discount_groups exists (the push may not have run yet — abort if missing)
  const tableCheck = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'show_discount_groups'
    ) AS exists
  `;
  if (!tableCheck[0]?.exists) {
    console.error(
      'Table show_discount_groups does not exist yet. Run drizzle-kit push to create it FIRST, then re-run this script before pushing again to drop the column.'
    );
    await sql.end();
    process.exit(1);
  }

  const candidates = await sql<{ id: string; name: string; members_entry_fee_pence: number }[]>`
    SELECT id, name, members_entry_fee_pence
    FROM shows
    WHERE members_entry_fee_pence IS NOT NULL
  `;

  console.log(`Found ${candidates.length} show(s) with a members_entry_fee_pence value.`);

  for (const show of candidates) {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM show_discount_groups
      WHERE show_id = ${show.id} AND label = 'Members'
      LIMIT 1
    `;
    if (existing.length > 0) {
      console.log(`  SKIP ${show.name} — already has Members group`);
      continue;
    }
    await sql`
      INSERT INTO show_discount_groups (show_id, label, first_entry_fee_pence, display_order)
      VALUES (${show.id}, 'Members', ${show.members_entry_fee_pence}, 0)
    `;
    console.log(`  ADDED ${show.name} (${show.members_entry_fee_pence}p)`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
