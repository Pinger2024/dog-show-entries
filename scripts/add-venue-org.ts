import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL as string, { ssl: 'require' });

async function run() {
  // Add column if it doesn't exist
  await sql`ALTER TABLE venues ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id)`;
  console.log('Column added (or already exists)');

  // Get all orgs
  const orgs = await sql`SELECT id, name FROM organisations`;
  console.log('Organisations:', orgs.map(o => `${o.name} (${o.id})`));

  if (orgs.length > 0) {
    // Assign first org to all venues without one
    const updated = await sql`
      UPDATE venues SET organisation_id = ${orgs[0].id}
      WHERE organisation_id IS NULL
      RETURNING id, name
    `;
    console.log(`Backfilled ${updated.length} venues with org: ${orgs[0].name}`);
  }

  await sql.end();
}

run().catch(e => { console.error(e); process.exit(1); });
