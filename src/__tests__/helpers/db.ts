import { sql } from 'drizzle-orm';
import { db } from '@/server/db';

export { db as testDb };

let cachedTables: string[] | null = null;

async function listAppTables(): Promise<string[]> {
  if (cachedTables) return cachedTables;
  const rows = await db.execute<{ tablename: string }>(sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'drizzle_%'
      AND tablename NOT LIKE '\\_\\_%'
  `);
  // postgres-js returns the rows array directly
  const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{
    tablename: string;
  }>;
  cachedTables = list.map((r) => r.tablename);
  return cachedTables;
}

/** Wipe every app table. Safe to call between tests — DB stays empty. */
export async function cleanDb() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(
      `cleanDb refused: DATABASE_URL must point at localhost. Got: ${url}`,
    );
  }
  const tables = await listAppTables();
  if (tables.length === 0) return;
  const quoted = tables.map((t) => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`));
}
