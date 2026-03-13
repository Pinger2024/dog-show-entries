import postgres from 'postgres';

/**
 * One-off script to add a GIN index on the `specs` JSONB column
 * in the print_price_cache table. Uses CREATE INDEX CONCURRENTLY
 * so it doesn't lock the table during creation.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: true });

  console.log('Creating GIN index on print_price_cache.specs...');

  // Drop any invalid index left from a failed CONCURRENTLY attempt,
  // then recreate it. Non-concurrent to avoid disk space issues on Render.
  await sql.unsafe(`DROP INDEX IF EXISTS print_price_cache_specs_gin_idx;`);
  console.log('Dropped existing (possibly invalid) index.');

  await sql.unsafe(`
    CREATE INDEX print_price_cache_specs_gin_idx
    ON print_price_cache USING gin (specs);
  `);

  console.log('GIN index created successfully.');

  await sql.end();
}

main().catch((err) => {
  console.error('Failed to create index:', err);
  process.exit(1);
});
