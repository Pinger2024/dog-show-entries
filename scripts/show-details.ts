import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema/index.js';

async function main() {
  if (db === null) { console.log('No db'); return; }
  
  // Check the show with schedule data
  const showId = 'a6883cdf-abb0-4f46-a6f9-d63fb9b4523c';
  
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true, venue: true },
  });
  
  console.log('=== SHOW ===');
  console.log(JSON.stringify(show, null, 2));
  
  // Check schedule data
  console.log('\n=== SCHEDULE DATA ===');
  console.log(JSON.stringify(show?.scheduleData, null, 2));
  
  // Check classes
  const classes = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, showId),
    with: { classDefinition: true, breed: true },
    orderBy: [asc(schema.showClasses.sortOrder)],
  });
  console.log('\n=== CLASSES ===');
  console.log('Count:', classes.length);
  for (const c of classes.slice(0, 5)) {
    console.log(JSON.stringify({ num: c.classNumber, name: c.classDefinition?.name, sex: c.sex, breed: c.breed?.name }));
  }
  
  // Check judges
  const judges = await db.query.judgeAssignments.findMany({
    where: eq(schema.judgeAssignments.showId, showId),
    with: { judge: true, breed: true },
  });
  console.log('\n=== JUDGES ===');
  for (const j of judges) {
    console.log(JSON.stringify({ judge: j.judge?.name, breed: j.breed?.name }));
  }
  
  // Check entries
  const entries = await db.query.entries.findMany({
    where: eq(schema.entries.showId, showId),
  });
  console.log('\n=== ENTRIES ===');
  console.log('Count:', entries.length);
  
  // Also check test show 5 (entries_closed) for comparison
  const show5Id = '4fb87a71-e762-4245-8352-eec2782cd0c0';
  const entries5 = await db.query.entries.findMany({
    where: eq(schema.entries.showId, show5Id),
  });
  console.log('\n=== TEST SHOW 5 ENTRIES ===');
  console.log('Count:', entries5.length);
  
  const classes5 = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, show5Id),
    with: { classDefinition: true, breed: true },
    orderBy: [asc(schema.showClasses.sortOrder)],
  });
  console.log('Classes:', classes5.length);
  for (const c of classes5.slice(0, 5)) {
    console.log(JSON.stringify({ num: c.classNumber, name: c.classDefinition?.name, sex: c.sex, breed: c.breed?.name }));
  }
}
main();
