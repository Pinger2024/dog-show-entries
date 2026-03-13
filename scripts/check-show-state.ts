import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, sql, asc } from 'drizzle-orm';
import * as s from '@/server/db/schema/index.js';

const SHOW_ID = process.argv[2] || '0021ef83-e25c-4dfa-9528-076becc95c69';

async function main() {
  const show = await db.query.shows.findFirst({
    where: eq(s.shows.id, SHOW_ID),
    with: { organisation: true, venue: true },
  });
  if (!show) {
    console.log('Show not found');
    process.exit(1);
  }
  console.log('Show:', show.name, '| Type:', show.showType, '| Scope:', show.showScope);
  console.log('Org:', show.organisation?.name, '| Venue:', show.venue?.name);
  console.log('Date:', show.startDate);

  const [entryCount, classCount, judgeCount, ringCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(s.entries).where(eq(s.entries.showId, SHOW_ID)),
    db.select({ count: sql<number>`count(*)` }).from(s.showClasses).where(eq(s.showClasses.showId, SHOW_ID)),
    db.select({ count: sql<number>`count(*)` }).from(s.judgeAssignments).where(eq(s.judgeAssignments.showId, SHOW_ID)),
    db.select({ count: sql<number>`count(*)` }).from(s.rings).where(eq(s.rings.showId, SHOW_ID)),
  ]);
  console.log('Entries:', entryCount[0].count, '| Classes:', classCount[0].count, '| Judges:', judgeCount[0].count, '| Rings:', ringCount[0].count);

  const groups = await db.query.breedGroups.findMany({ orderBy: [asc(s.breedGroups.sortOrder)] });
  console.log('Breed groups:', groups.length, '-', groups.map(g => g.name).join(', '));

  const breeds = await db.select({ count: sql<number>`count(*)` }).from(s.breeds);
  console.log('Total breeds:', breeds[0].count);

  const classDefs = await db.query.classDefinitions.findMany({ orderBy: [asc(s.classDefinitions.sortOrder)] });
  console.log('Class defs:', classDefs.length, '-', classDefs.map(c => `${c.name} (${c.id.slice(0, 8)})`).join(', '));

  const sampleBreeds = await db.query.breeds.findMany({ limit: 30, with: { group: true }, orderBy: [asc(s.breeds.name)] });
  console.log('Sample breeds:');
  for (const b of sampleBreeds) {
    console.log(`  ${b.name} [${b.group?.name}] (${b.id})`);
  }

  const showTypes = await db.execute(sql`SELECT DISTINCT show_type FROM shows`);
  console.log('Show types:', JSON.stringify(showTypes.rows));

  const showScopes = await db.execute(sql`SELECT DISTINCT show_scope FROM shows`);
  console.log('Show scopes:', JSON.stringify(showScopes.rows));

  const users = await db.query.users.findMany({ limit: 10 });
  console.log('Users:');
  for (const u of users) {
    console.log(`  ${u.name} (${u.id.slice(0, 8)}, ${u.role}, ${u.email})`);
  }

  // Check existing show classes
  const showClasses = await db.query.showClasses.findMany({
    where: eq(s.showClasses.showId, SHOW_ID),
    with: { classDefinition: true, breed: true },
    orderBy: [asc(s.showClasses.sortOrder), asc(s.showClasses.classNumber)],
  });
  console.log('\nExisting show classes:');
  for (const sc of showClasses) {
    console.log(`  #${sc.classNumber} ${sc.classDefinition?.name} (${sc.sex}) breed=${sc.breed?.name || 'all'}`);
  }

  // Check existing judges
  const judges = await db.query.judgeAssignments.findMany({
    where: eq(s.judgeAssignments.showId, SHOW_ID),
    with: { judge: true, breed: true },
  });
  console.log('\nExisting judges:');
  for (const j of judges) {
    console.log(`  ${j.judge?.name} -> ${j.breed?.name || 'all breeds'}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
