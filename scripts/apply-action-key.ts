import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  await db.execute(sql`ALTER TABLE show_checklist_items ADD COLUMN IF NOT EXISTS action_key text`);
  console.log('action_key column ensured');

  const updates = [
    { pattern: '%RKC licence%apply%', actionKey: 'rkc_licence_apply' },
    { pattern: '%Send judge offer%', actionKey: 'judge_offers' },
    { pattern: '%Confirm venue%', actionKey: 'venue_confirm' },
    { pattern: '%insurance%', actionKey: 'insurance' },
    { pattern: '%acceptance%', actionKey: 'judge_acceptance' },
    { pattern: '%confirmation%', actionKey: 'judge_confirmation' },
    { pattern: '%licence number%', actionKey: 'rkc_licence_record' },
    { pattern: '%risk assessment%', actionKey: 'venue_risk' },
    { pattern: '%rosettes%', actionKey: 'rosettes' },
    { pattern: '%sponsors%', actionKey: 'sponsors' },
    { pattern: '%awards board%', actionKey: 'awards_board' },
    { pattern: '%classes%set%', actionKey: 'classes_setup' },
    { pattern: '%Publish%schedule%', actionKey: 'show_publish' },
    { pattern: '%Open entries%', actionKey: 'entries_open' },
    { pattern: '%vet cover%', actionKey: 'vet_cover' },
    { pattern: '%hotel%travel%', actionKey: 'judge_hotel' },
    { pattern: '%stewards%', actionKey: 'stewards_assign' },
    { pattern: '%challenge certificates%', actionKey: 'obtain_ccs' },
    { pattern: '%refreshments%', actionKey: 'refreshments' },
    { pattern: '%Close entries%', actionKey: 'entries_close' },
    { pattern: '%breeds%ring%', actionKey: 'judges_assign_breeds' },
    { pattern: '%ring plan%', actionKey: 'rings_finalise' },
    { pattern: '%catalogue%generate%', actionKey: 'catalogue_generate' },
    { pattern: '%entry passes%', actionKey: 'entry_passes' },
    { pattern: '%entry numbers%', actionKey: 'judge_entry_numbers' },
    { pattern: '%thank%you%', actionKey: 'judge_thankyou' },
    { pattern: '%entry analysis%', actionKey: 'rkc_analysis' },
    { pattern: '%marked catalogue%', actionKey: 'rkc_marked_catalogue' },
    { pattern: '%Archive%', actionKey: 'archive' },
  ];

  let backfilled = 0;
  for (const { pattern, actionKey } of updates) {
    const result = await db.execute(
      sql`UPDATE show_checklist_items SET action_key = ${actionKey} WHERE action_key IS NULL AND title ILIKE ${pattern}`
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`  ${actionKey}: ${result.rowCount} rows`);
      backfilled += result.rowCount;
    }
  }
  console.log(`Backfilled ${backfilled} items total`);
  process.exit(0);
}

main().catch(console.error);
