/**
 * Startup migration for the judge-offer terms columns on judge_contracts:
 * offer_terms (jsonb), already_agreed_elsewhere (boolean),
 * already_agreed_details (text). Prod and demo get them from
 * migrateJudgeOfferTerms, called by runStartupMigrations.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrateJudgeOfferTerms } from '@/server/db/startup-migrations';
import { testDb } from '../helpers/db';

const COLUMNS = ['already_agreed_details', 'already_agreed_elsewhere', 'offer_terms'];

async function columns() {
  const rows = await testDb.execute<{ column_name: string; data_type: string; is_nullable: string }>(sql`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_name = 'judge_contracts'
       AND column_name IN ('offer_terms', 'already_agreed_elsewhere', 'already_agreed_details')
     ORDER BY column_name`);
  return [...rows];
}

describe('migrateJudgeOfferTerms', () => {
  afterEach(async () => {
    await migrateJudgeOfferTerms(testDb); // leave the test DB with the columns
  });

  it('adds the three nullable columns to a table without them', async () => {
    await testDb.execute(sql`
      ALTER TABLE judge_contracts
        DROP COLUMN IF EXISTS offer_terms,
        DROP COLUMN IF EXISTS already_agreed_elsewhere,
        DROP COLUMN IF EXISTS already_agreed_details`);
    expect(await columns()).toEqual([]);

    await migrateJudgeOfferTerms(testDb);

    expect(await columns()).toEqual([
      { column_name: 'already_agreed_details', data_type: 'text', is_nullable: 'YES' },
      { column_name: 'already_agreed_elsewhere', data_type: 'boolean', is_nullable: 'YES' },
      { column_name: 'offer_terms', data_type: 'jsonb', is_nullable: 'YES' },
    ]);
  });

  it('a second run is a no-op', async () => {
    await migrateJudgeOfferTerms(testDb);
    const before = await columns();
    await expect(migrateJudgeOfferTerms(testDb)).resolves.not.toThrow();
    const after = await columns();
    expect(after).toEqual(before);
    expect(after.map((c) => c.column_name)).toEqual(COLUMNS);
  });
});
