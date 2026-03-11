import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema/index.js';

async function main() {
  if (db === null) { console.log('No db'); return; }
  const showId = '112d5104-f0fc-463c-8bfd-2942337b6fb4';

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    columns: { name: true, status: true, entryCloseDate: true, description: true, startTime: true },
  });
  console.log('Show:', show?.name, '| Status:', show?.status);
  console.log('Close date:', show?.entryCloseDate?.toISOString());
  console.log('Start time:', show?.startTime);
  console.log('Description:', (show?.description ?? '').substring(0, 80) + '...');

  const sponsors = await db.query.showSponsors.findMany({
    where: eq(schema.showSponsors.showId, showId),
    with: {
      sponsor: true,
      classSponsorships: { with: { showClass: { with: { classDefinition: true } } } },
    },
    orderBy: [asc(schema.showSponsors.displayOrder)],
  });

  console.log('\nSponsors assigned:', sponsors.length);
  for (const ss of sponsors) {
    const hasLogo = ss.sponsor.logoUrl ? 'YES' : 'NO';
    console.log(`  ${ss.tier.toUpperCase()}: ${ss.sponsor.name} (${ss.customTitle ?? 'no title'}) | logo: ${hasLogo}`);
    for (const cs of ss.classSponsorships) {
      console.log(`    → ${cs.showClass?.classDefinition?.name}: ${cs.trophyName ?? 'no trophy'}`);
    }
  }
}
main();
