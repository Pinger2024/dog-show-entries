import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { classDefinitions } from '../src/server/db/schema/class-definitions';
import { ilike, or } from 'drizzle-orm';

async function main() {
  const url = process.env.DATABASE_URL!;
  const ssl = !/localhost|127/.test(url);
  const client = postgres(url, { prepare: false, ssl });
  const db = drizzle(client);
  const rows = await db.select({ id: classDefinitions.id, name: classDefinitions.name, type: classDefinitions.type, sortOrder: classDefinitions.sortOrder })
    .from(classDefinitions)
    .where(or(
      ilike(classDefinitions.name, '%AVNSC%'),
      ilike(classDefinitions.name, '%AVIBR%'),
      ilike(classDefinitions.name, '%Variety%'),
      ilike(classDefinitions.name, '%Rare Breed%'),
      ilike(classDefinitions.name, '%Imported%')
    ));
  console.log('Variety/AVNSC/AVIBR class definitions in DB:');
  for (const r of rows) console.log(' ', r.name, '|', r.type, '| sortOrder:', r.sortOrder);
  if (rows.length === 0) console.log('  (none found — need to seed)');
  await client.end();
}
main().catch(console.error);
