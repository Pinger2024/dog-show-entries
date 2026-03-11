import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, isNull } from 'drizzle-orm';
import * as schema from '@/server/db/schema/index.js';
import { generateShowSlug } from '@/lib/slugify.js';

async function main() {
  if (!db) { console.log('No db'); return; }

  const shows = await db.query.shows.findMany({
    where: isNull(schema.shows.slug),
    columns: { id: true, name: true, startDate: true },
  });

  console.log(`Found ${shows.length} shows without slugs\n`);

  for (const show of shows) {
    const baseSlug = generateShowSlug(show.name, show.startDate);
    let slug = baseSlug;
    let suffix = 2;

    // Ensure uniqueness
    while (await db.query.shows.findFirst({ where: eq(schema.shows.slug, slug), columns: { id: true } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    await db.update(schema.shows).set({ slug }).where(eq(schema.shows.id, show.id));
    console.log(`  ${show.name} → ${slug}`);
  }

  console.log('\nDone!');
}

main().catch(console.error);
