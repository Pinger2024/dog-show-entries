/**
 * CLI script to populate a show with test data.
 * Usage: npx tsx scripts/populate-show.ts <showId> [targetEntries]
 */
import 'dotenv/config';
import { populateShowWithTestData, clearShowTestData } from '@/server/services/test-data-generator';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const showId = args[0];
const targetEntries = args[1] ? parseInt(args[1], 10) || undefined : undefined;
const shouldClear = flags.includes('--clear');

if (!showId) {
  console.error('Usage: npx tsx scripts/populate-show.ts <showId> [targetEntries] [--clear]');
  process.exit(1);
}

async function main() {
  if (shouldClear) {
    console.log(`Clearing test data from show ${showId}...`);
    const clearResult = await clearShowTestData(showId);
    console.log(`Cleared: ${clearResult.entriesDeleted} entries, ${clearResult.dogsDeleted} dogs`);
  }

  console.log(`Populating show ${showId} with test data...`);
  if (targetEntries) console.log(`Target entries: ${targetEntries}`);

  const start = Date.now();
  const result = await populateShowWithTestData({ showId, targetEntries });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\nDone in ${elapsed}s:`);
  console.log(`  Dogs created: ${result.dogsCreated}`);
  console.log(`  Entries created: ${result.entriesCreated}`);
  console.log(`  Entry classes created: ${result.entryClassesCreated}`);
  console.log(`  Judges created: ${result.judgesCreated}`);
  console.log(`  Rings created: ${result.ringsCreated}`);
  console.log(`  Orders created: ${result.ordersCreated}`);
  console.log(`  Sponsors created: ${result.sponsorsCreated}`);
  console.log(`  Show config updated: ${result.showConfigUpdated}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
