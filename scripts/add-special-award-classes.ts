/**
 * Special Award classes — ensure all 5 exist with the wording Amanda signed off
 * (2026-05-19). Adds Puppy + Veteran if missing; updates blank descriptions on
 * the three already in the DB (Junior, Post Graduate, Open).
 *
 * Wording follows the standard classification (Puppy, Junior, Post Graduate,
 * Open, Veteran) with the trailing line that SAC entries are not eligible for
 * Challenge Certificates.
 *
 * Usage: npx tsx scripts/add-special-award-classes.ts
 */
import 'dotenv/config';
import { db } from '@/server/db';
import { classDefinitions } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

const SAC_NOT_ELIGIBLE = 'They are not eligible for Challenge Certificates.';

const rows = [
  {
    name: 'Special Award Class - Puppy',
    sortOrder: 200,
    description: `For dogs of 6 and not exceeding 12 calendar months of age on the first day of the show. ${SAC_NOT_ELIGIBLE}`,
  },
  {
    name: 'Special Award Class - Junior',
    sortOrder: 210,
    description: `For dogs of 6 and not exceeding 18 calendar months of age on the first day of the show. ${SAC_NOT_ELIGIBLE}`,
  },
  {
    name: 'Special Award Class - Post Graduate',
    sortOrder: 220,
    description: `For dogs which have not won a CC or 5 or more first prizes at Championship Shows. ${SAC_NOT_ELIGIBLE}`,
  },
  {
    name: 'Special Award Class - Open',
    sortOrder: 230,
    description: `For all dogs of the breed eligible for entry at the show. No restrictions. ${SAC_NOT_ELIGIBLE}`,
  },
  {
    name: 'Special Award Class - Veteran',
    sortOrder: 240,
    description: `For dogs of not less than 7 years of age on the first day of the show. ${SAC_NOT_ELIGIBLE}`,
  },
];

async function main() {
  for (const row of rows) {
    const existing = await db.query.classDefinitions.findFirst({
      where: eq(classDefinitions.name, row.name),
      columns: { id: true },
    });

    if (existing) {
      await db
        .update(classDefinitions)
        .set({ description: row.description, sortOrder: row.sortOrder })
        .where(eq(classDefinitions.id, existing.id));
      console.log(`updated: ${row.name}`);
    } else {
      const [inserted] = await db
        .insert(classDefinitions)
        .values({
          name: row.name,
          type: 'special',
          sortOrder: row.sortOrder,
          description: row.description,
        })
        .returning({ id: classDefinitions.id });
      console.log(`inserted: ${row.name} (${inserted?.id})`);
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
