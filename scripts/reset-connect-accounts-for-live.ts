/**
 * Run ONCE before flipping STRIPE_SECRET_KEY from test → live.
 *
 * Every connected-account id in our organisations table refers to a
 * TEST-mode Stripe account. Test and live mode are fully isolated —
 * those ids don't exist in live mode, so leaving them in place would
 * make the first payment attempt fail at Stripe with a permission or
 * not-found error. Easier to wipe and have clubs re-onboard fresh.
 *
 * Usage:
 *   npx tsx scripts/reset-connect-accounts-for-live.ts --dry-run   # preview
 *   npx tsx scripts/reset-connect-accounts-for-live.ts --commit    # actually run
 *
 * The script is idempotent: running it twice is safe (second run is a
 * no-op since all orgs are already cleared).
 */
import 'dotenv/config';
import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../src/server/db';
import { organisations } from '../src/server/db/schema';

const isDryRun = process.argv.includes('--dry-run');
const isCommit = process.argv.includes('--commit');

if (!isDryRun && !isCommit) {
  console.error('Pass either --dry-run or --commit.');
  process.exit(1);
}

(async () => {
  const rows = await db.query.organisations.findMany({
    where: isNotNull(organisations.stripeAccountId),
    columns: {
      id: true,
      name: true,
      stripeAccountId: true,
      stripeAccountStatus: true,
      stripeChargesEnabled: true,
    },
  });

  console.log(`Found ${rows.length} org(s) with a Stripe Connect account attached:\n`);
  for (const r of rows) {
    console.log(
      `  • ${r.name.padEnd(40)} ${r.stripeAccountId}  status=${r.stripeAccountStatus}  charges=${r.stripeChargesEnabled}`
    );
  }

  if (rows.length === 0) {
    console.log('\nNothing to do. DB is already clean.');
    return;
  }

  if (isDryRun) {
    console.log('\n--dry-run: no changes made. Re-run with --commit to clear these fields.');
    return;
  }

  console.log(`\nClearing Connect fields for ${rows.length} org(s)…`);
  for (const r of rows) {
    await db
      .update(organisations)
      .set({
        stripeAccountId: null,
        stripeAccountStatus: 'not_started',
        stripeDetailsSubmitted: false,
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
        stripeOnboardingCompletedAt: null,
      })
      .where(eq(organisations.id, r.id));
    console.log(`  ✓ ${r.name}`);
  }

  console.log('\nDone. Every club will need to re-onboard via /secretary/payments in live mode.');
})().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
