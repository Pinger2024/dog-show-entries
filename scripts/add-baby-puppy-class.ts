/**
 * Add "Baby Puppy" as a standard age class (type: 'age', sortOrder: 5).
 * Requested by Amanda 2026-05-14 — run at 11pm.
 *
 * Usage: npx tsx scripts/add-baby-puppy-class.ts
 */
import { db } from '@/server/db';
import { classDefinitions } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

const existing = await db.query.classDefinitions.findFirst({
  where: eq(classDefinitions.name, 'Baby Puppy'),
  columns: { id: true, type: true },
});

if (existing?.type === 'age') {
  console.log('Baby Puppy (age) already exists — nothing to do.');
  process.exit(0);
}

const [inserted] = await db
  .insert(classDefinitions)
  .values({
    name: 'Baby Puppy',
    type: 'age',
    sortOrder: 5,
    minAgeMonths: 4,
    maxAgeMonths: 6,
    description: 'For dogs of 4 and not exceeding 6 calendar months of age on the first day of the show.',
  })
  .returning();

console.log('Inserted:', inserted?.id, inserted?.name);
