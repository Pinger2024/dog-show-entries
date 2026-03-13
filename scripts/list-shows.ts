import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { desc } from 'drizzle-orm';
import * as schema from '@/server/db/schema/index.js';

async function main() {
  if (db === null) { console.log('No db'); return; }
  const shows = await db.query.shows.findMany({
    with: { organisation: true, venue: true },
    orderBy: [desc(schema.shows.createdAt)],
  });
  
  for (const s of shows) {
    console.log(JSON.stringify({
      id: s.id,
      name: s.name,
      showType: s.showType,
      showScope: s.showScope,
      startDate: s.startDate,
      org: s.organisation?.name,
      venue: s.venue?.name,
      status: s.status,
      hasSchedule: s.scheduleData ? true : false,
      kcLicenceNo: s.kcLicenceNo,
    }));
  }
}
main();
