import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL!;
  const isSsl = !/localhost|127/.test(url);
  const sql = postgres(url, { prepare: false, ssl: isSsl ? { rejectUnauthorized: false } : false });
  const rows = await sql`SELECT show_scope, COUNT(*) as count FROM shows GROUP BY show_scope`;
  for (const r of rows) console.log(r.show_scope ?? 'NULL', r.count);
  const nulls = await sql`SELECT COUNT(*) as n FROM shows WHERE show_scope IS NULL`;
  console.log('NULL showScope count:', nulls[0].n);
  await sql.end();
}
main().catch(console.error);
