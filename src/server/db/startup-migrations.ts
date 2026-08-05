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
  // already exists, so re-runs are no-ops. The user/org EXISTS guards keep
  // this prod-data-specific insert from FK-aborting the whole migration
  // chain on databases without those rows (it took the demo DB's migrations
  // down on 2026-07-31 — everything after this entry silently never ran).
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
    )
    AND EXISTS (SELECT 1 FROM users WHERE id = '72293d40-8ea5-4bf3-b0b8-f458deed8e0d'::uuid)
    AND EXISTS (SELECT 1 FROM organisations WHERE id = '6f3b14d4-c0b8-4bca-bce6-706b8fc38ba5'::uuid);
  `);

  // ── 2026-04-21: judge-contract PDF archive for RKC audit compliance.
  // Snapshots the agreed contract to R2 at judge-acceptance time.
  await db.execute(sql`
    ALTER TABLE judge_contracts
      ADD COLUMN IF NOT EXISTS contract_pdf_key TEXT,
      ADD COLUMN IF NOT EXISTS contract_pdf_generated_at TIMESTAMPTZ;
  `);

  // ── 2026-07-31: judge critique upload (Mandy) — one row per (show,
  // judge) critique document; a token-gated magic link lets the judge
  // submit without a login.
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE critique_doc_status AS ENUM ('invited', 'submitted', 'published');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS critique_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
      judge_id UUID NOT NULL REFERENCES judges(id),
      upload_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
      status critique_doc_status NOT NULL DEFAULT 'invited',
      invited_email TEXT,
      invited_at TIMESTAMPTZ,
      original_filename TEXT,
      storage_key TEXT,
      raw_text TEXT,
      parsed_json JSONB,
      overview_text TEXT,
      submitted_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      published_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS critique_documents_show_judge_uniq
      ON critique_documents(show_id, judge_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS critique_documents_upload_token_idx
      ON critique_documents(upload_token);
  `);

  // ── 2026-08-05: pre-paid parking pass (Mandy) — the cron stamps the
  // order once its week-before email has gone so ticks never double-send ──
  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS parking_pass_emailed_at TIMESTAMPTZ;
  `);

  // ── 2026-08-05: show_breeds — per-breed, per-show config (all-breed
  // groundwork, landed with the critique branch; demo was hand-patched,
  // this converges prod and any future env) ──
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS show_breeds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
      breed_id UUID NOT NULL REFERENCES breeds(id),
      cc_offered BOOLEAN NOT NULL DEFAULT FALSE,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT show_breeds_show_breed_key UNIQUE (show_id, breed_id)
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS show_breeds_show_id_idx ON show_breeds(show_id);
  `);

  console.log(`[startup-migrations] done in ${Date.now() - started}ms`);
}
