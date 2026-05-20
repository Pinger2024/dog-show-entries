import 'dotenv/config';
import { db } from '@/server/db/index.js';
import * as s from '@/server/db/schema/index.js';
import { eq, desc } from 'drizzle-orm';

async function main() {
  if (!db) throw new Error('no db');
  const show = await db.query.shows.findFirst({
    where: eq(s.shows.name, 'Hundark GSD E2E Test Show'),
    orderBy: [desc(s.shows.createdAt)],
    with: {
      showClasses: {
        with: { classDefinition: true },
      },
    },
  });
  if (!show) return console.log('no show');
  for (const sc of show.showClasses.slice(0, 6)) {
    console.log(`${sc.classDefinition?.name}:`);
    console.log(`  ${sc.classDefinition?.description}`);
  }
  process.exit(0);
}
main();
