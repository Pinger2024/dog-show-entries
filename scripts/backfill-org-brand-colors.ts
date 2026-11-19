/**
 * Run node-vibrant over every organisation that has a logo_url but no
 * extracted brand colours yet, and write the results back to the
 * `organisations` table. Idempotent — re-runs skip orgs that have
 * already been processed (logo_color_primary IS NOT NULL OR
 * logo_monochrome = true).
 *
 *   npx tsx scripts/backfill-org-brand-colors.ts          # default DB (prod)
 *   DATABASE_URL=...remi_demo npx tsx scripts/backfill-org-brand-colors.ts
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';
import { extractBrandColors } from '../src/server/services/extract-brand-colors';

async function fetchLogo(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const dbUrl = process.env.DATABASE_URL!;
  const client = postgres(dbUrl, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  const orgs = await db.query.organisations.findMany({
    where: and(
      isNotNull(schema.organisations.logoUrl),
      or(
        isNull(schema.organisations.logoColorPrimary),
        eq(schema.organisations.logoMonochrome, false),
      ),
    ),
    columns: {
      id: true,
      name: true,
      logoUrl: true,
      logoColorPrimary: true,
      logoMonochrome: true,
    },
  });
  const todo = orgs.filter((o) => !o.logoColorPrimary && !o.logoMonochrome);
  console.log(`Found ${orgs.length} orgs with logos; ${todo.length} need extraction.\n`);

  for (const org of todo) {
    if (!org.logoUrl) continue;
    process.stdout.write(`  ${org.name} … `);
    try {
      const buf = await fetchLogo(org.logoUrl);
      const colors = await extractBrandColors(buf);
      await db
        .update(schema.organisations)
        .set({
          logoColorPrimary: colors.primary,
          logoColorSecondary: colors.secondary,
          logoMonochrome: colors.monochrome,
          updatedAt: new Date(),
        })
        .where(eq(schema.organisations.id, org.id));
      if (colors.monochrome) {
        console.log('monochrome (defaults will be used)');
      } else {
        console.log(`primary ${colors.primary}  secondary ${colors.secondary}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ ${msg}`);
    }
  }

  await client.end();
  console.log(`\n${todo.length} orgs processed. 🎨`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
