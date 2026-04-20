/**
 * One-shot idempotent SQL migrations applied at server startup.
 *
 * Why this pattern: Render's MCP doesn't expose DB credentials (by design),
 * so Claude can't run `drizzle-kit push` against production from outside.
 * Instead we bundle the migration into the server boot path — on the next
 * deploy the instrumentation hook runs it.
 *
 * Each migration MUST use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`
 * style guards so re-runs are no-ops. Log what actually changed so a
 * Render log tail shows whether work was done.
 *
 * Remove a migration once it has landed on all environments — the file
 * is not a historical ledger, just a pending queue.
 */
import { sql } from 'drizzle-orm';
import { db } from './index';

export async function runStartupMigrations() {
  if (!db) {
    console.warn('[startup-migrations] db client unavailable, skipping');
    return;
  }

  console.log('[startup-migrations] starting');
  const started = Date.now();

  // ── 2026-04-20: payout bank details + payouts ledger (merchant-of-
  // record pivot away from Stripe Connect) ──
  await db.execute(sql`
    ALTER TABLE organisations
      ADD COLUMN IF NOT EXISTS payout_account_name TEXT,
      ADD COLUMN IF NOT EXISTS payout_sort_code TEXT,
      ADD COLUMN IF NOT EXISTS payout_account_number TEXT;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id UUID NOT NULL REFERENCES organisations(id),
      show_id UUID REFERENCES shows(id),
      amount_pence INTEGER NOT NULL,
      bank_reference TEXT,
      notes TEXT,
      paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_by_user_id UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS payouts_organisation_id_idx ON payouts(organisation_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS payouts_show_id_idx ON payouts(show_id);
  `);

  console.log(`[startup-migrations] done in ${Date.now() - started}ms`);
}
