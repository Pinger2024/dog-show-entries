/**
 * Renumber a show's catalogue in class order, using the live numbering service
 * (so it gets dog-aware numbering: one number per dog — see
 * project_dog_one_catalogue_number).
 *
 * Refuses any show whose numbers are LOCKED for printing: a re-sort would shift
 * numbers a secretary has already sent to the printer. Unlocked shows are
 * PROVISIONAL by design, so re-sorting is the intended behaviour.
 *
 * Idempotent — running it twice on unchanged data produces the same numbers.
 *
 *   npx tsx scripts/renumber-show.ts "Clyde Valley"           # dry run
 *   npx tsx scripts/renumber-show.ts "Clyde Valley" --commit  # write
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, ilike, isNull, sql } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';
import { resortCatalogueNumbers } from '../src/server/services/catalogue-numbering';

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const pattern = args.find((a) => !a.startsWith('--'));

if (!pattern) {
  console.error('usage: renumber-show.ts "<show name fragment>" [--commit]');
  process.exit(1);
}

async function stateOf(db: ReturnType<typeof drizzle>, showId: string) {
  const rows = await db
    .select({
      id: schema.entries.id,
      dogId: schema.entries.dogId,
      catalogueNumber: schema.entries.catalogueNumber,
    })
    .from(schema.entries)
    .where(
      and(
        eq(schema.entries.showId, showId),
        eq(schema.entries.status, 'confirmed'),
        isNull(schema.entries.deletedAt),
      ),
    );
  const numbers = rows.map((r) => r.catalogueNumber).filter((n): n is string => n != null);
  const distinct = new Set(numbers);
  // A dog holding two entry rows SHOULD share one number, so count dogs whose
  // rows disagree rather than treating every repeat as a fault.
  const numbersByDog = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.dogId || r.catalogueNumber == null) continue;
    const s = numbersByDog.get(r.dogId) ?? new Set<string>();
    s.add(r.catalogueNumber);
    numbersByDog.set(r.dogId, s);
  }
  const dogsWithTwoNumbers = [...numbersByDog.values()].filter((s) => s.size > 1).length;
  return {
    entries: rows.length,
    numbered: numbers.length,
    unnumbered: rows.length - numbers.length,
    distinctNumbers: distinct.size,
    highest: numbers.reduce((m, n) => Math.max(m, Number(n) || 0), 0),
    dogsWithTwoNumbers,
  };
}

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client, { schema });

  console.log(`DB: ${process.env.DATABASE_URL!.replace(/:\/\/[^:]+:[^@]+@/, '://***@')}`);
  console.log(COMMIT ? '*** COMMIT MODE ***\n' : 'DRY RUN (pass --commit to write)\n');

  const shows = await db
    .select({
      id: schema.shows.id,
      name: schema.shows.name,
      status: schema.shows.status,
      lockedAt: schema.shows.catalogueNumbersLockedAt,
    })
    .from(schema.shows)
    .where(ilike(schema.shows.name, `%${pattern}%`));

  if (shows.length === 0) throw new Error(`no show matching "${pattern}"`);
  if (shows.length > 1) {
    console.log('Matches more than one show — be more specific:');
    for (const s of shows) console.log(`  - ${s.name}`);
    await client.end();
    process.exit(1);
  }

  const show = shows[0]!;
  console.log(`show   : ${show.name} (${show.status})`);
  if (show.lockedAt) {
    console.log(`\nREFUSING — catalogue numbers were LOCKED at ${show.lockedAt.toISOString()}.`);
    console.log('Re-sorting would shift numbers that may already be printed.');
    console.log('Unlock deliberately first if that is really what you want.');
    await client.end();
    process.exit(1);
  }

  const before = await stateOf(db, show.id);
  console.log(`before : ${before.entries} entries · ${before.numbered} numbered · ${before.unnumbered} blank`);
  console.log(`         ${before.distinctNumbers} distinct numbers, highest ${before.highest}`);
  if (before.dogsWithTwoNumbers > 0) {
    console.log(`         ⚠ ${before.dogsWithTwoNumbers} dog(s) holding more than one number`);
  }

  if (!COMMIT) {
    console.log('\nWould re-sort every confirmed entry into class order');
    console.log('(breed classes → Junior Handlers → NFC), one number per dog.');
    console.log('Re-run with --commit.');
    await client.end();
    return;
  }

  const result = await resortCatalogueNumbers(db as never, show.id);
  const after = await stateOf(db, show.id);

  console.log(`\nrenumbered ${result.assigned} entries`);
  console.log(`after  : ${after.entries} entries · ${after.numbered} numbered · ${after.unnumbered} blank`);
  console.log(`         ${after.distinctNumbers} distinct numbers, highest ${after.highest}`);
  console.log(`         ${after.dogsWithTwoNumbers} dog(s) holding more than one number`);

  const problems: string[] = [];
  if (after.unnumbered !== 0) problems.push(`${after.unnumbered} entries still blank`);
  if (after.dogsWithTwoNumbers !== 0) problems.push(`${after.dogsWithTwoNumbers} dogs hold two numbers`);
  // Numbers run 1..distinct with no gaps, so the highest equals the count.
  if (after.highest !== after.distinctNumbers) {
    problems.push(`highest number ${after.highest} != ${after.distinctNumbers} distinct — gap or duplicate`);
  }
  console.log(problems.length === 0 ? '\n✓ clean: 1..N, no gaps, one number per dog' : `\n✗ ${problems.join('; ')}`);

  await client.end();
  if (problems.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
