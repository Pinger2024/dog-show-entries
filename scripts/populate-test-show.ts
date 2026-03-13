import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema/index.js';

async function main() {
  if (db === null) { console.log('No db'); return; }
  
  const showId = 'a6883cdf-abb0-4f46-a6f9-d63fb9b4523c';
  
  // 1. Update show with missing fields
  await db.update(schema.shows).set({
    showOpenTime: '09:30',
    kcLicenceNo: '2026/1234',
    secretaryName: 'Amanda McAteer',
    secretaryPhone: '07813 880000',
    secretaryAddress: '12 Strathaven Road, Lanark, ML11 9AB',
    onCallVet: 'Clyde Vet Group, Hyndford Road, New Lanark Market, Lanark ML11 9SZ',
    startTime: '10:00',
  }).where(eq(schema.shows.id, showId));
  
  console.log('Updated show fields');
  
  // 2. Get all classes and assign sequential class numbers
  const classes = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, showId),
    with: { classDefinition: true },
    orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
  });
  
  console.log(`Found ${classes.length} classes`);
  
  // Assign class numbers 1-22
  for (let i = 0; i < classes.length; i++) {
    await db.update(schema.showClasses).set({
      classNumber: i + 1,
    }).where(eq(schema.showClasses.id, classes[i].id));
    console.log(`Class ${i + 1}: ${classes[i].classDefinition?.name} (${classes[i].sex})`);
  }
  
  console.log('\nDone! All data populated.');
}
main();
