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

  // ── 2026-04-20 evening: add Paula Ingham as active member of BAGSD so
  // Amanda can set up the Monday go-live show with Paula as secretary.
  // Idempotent: the inner SELECT returns no rows if the membership
  // already exists, so re-runs are no-ops.
  await db.execute(sql`
    INSERT INTO memberships (user_id, organisation_id, status)
    SELECT
      '72293d40-8ea5-4bf3-b0b8-f458deed8e0d'::uuid,
      '6f3b14d4-c0b8-4bca-bce6-706b8fc38ba5'::uuid,
      'active'
    WHERE NOT EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = '72293d40-8ea5-4bf3-b0b8-f458deed8e0d'::uuid
        AND organisation_id = '6f3b14d4-c0b8-4bca-bce6-706b8fc38ba5'::uuid
    );
  `);

  // ── 2026-04-21: judge-contract PDF archive for RKC audit compliance.
  // Snapshots the agreed contract to R2 at judge-acceptance time.
  await db.execute(sql`
    ALTER TABLE judge_contracts
      ADD COLUMN IF NOT EXISTS contract_pdf_key TEXT,
      ADD COLUMN IF NOT EXISTS contract_pdf_generated_at TIMESTAMPTZ;
  `);

  // ── 2026-04-21: Merge Paula Ingham's legacy org into the real BAGSD.
  // The Settings page wasn't passing the active-org id (fixed in dac1550),
  // so when Amanda impersonated Paula and edited Settings, the changes
  // landed on Paula's oldest membership — a leftover "Clyde Valley Gsd
  // Club" she created when signing up, since renamed to "BAGSD" with the
  // real contact details + logo. Copy those over to the real BAGSD org,
  // then drop the duplicate. Idempotent: if the legacy org is already
  // gone, the IF block exits early.
  await db.execute(sql`
    DO $$
    DECLARE
      legacy_id UUID := '1490501d-0080-4edf-8827-09fef56c88af';
      real_id   UUID := '6f3b14d4-c0b8-4bca-bce6-706b8fc38ba5';
      legacy_row organisations%ROWTYPE;
    BEGIN
      SELECT * INTO legacy_row FROM organisations WHERE id = legacy_id;
      IF NOT FOUND THEN RETURN; END IF;

      UPDATE organisations SET
        name = 'BAGSD',
        contact_email = legacy_row.contact_email,
        contact_phone = legacy_row.contact_phone,
        website = legacy_row.website,
        logo_url = legacy_row.logo_url,
        subscription_status = legacy_row.subscription_status,
        subscription_current_period_end = legacy_row.subscription_current_period_end
      WHERE id = real_id;

      DELETE FROM memberships WHERE organisation_id = legacy_id;
      DELETE FROM organisations WHERE id = legacy_id;
    END $$;
  `);

  console.log(`[startup-migrations] done in ${Date.now() - started}ms`);
}
