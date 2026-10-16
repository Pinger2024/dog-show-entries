/**
 * Repair `show_classes.sort_order` / `class_number` for SV/WUSV regional
 * shows whose classes were never put into the canonical bitch-before-dog /
 * long-coat-before-stock / SV_AGE_ORDER sequence.
 *
 * Background: the regional groups' 11 Aug 2026 convention (see
 * `canonicalSvClassOrder` / `SV_AGE_ORDER` in `src/lib/class-labels.ts`) is
 * "1a Baby Puppy Bitch Long, 1b Baby Puppy Bitch Short, 2a Baby Puppy Dog
 * Long, 2b Baby Puppy Dog Short, …". Shows CREATED after that date get this
 * order automatically. The Midlands Region GSD Group show was created 8 Aug
 * 2026 and missed the cutover — its stored order is all dog classes (1–14)
 * then all bitch classes (15–28), which every renderer honours literally
 * because `class_number`/`sort_order` is deliberately the single stable
 * ordering key for catalogue numbering and every sorted PDF (Mandy
 * 2026-09-04).
 *
 * This script does NOT change how any renderer sorts — it fixes the stored
 * order so the existing "honour class_number/sort_order" renderers get it
 * right for free.
 *
 * DRY RUN by default — prints a before/after table per show. Pass --apply to
 * write. Pass --show <uuid> to limit to one show; otherwise every
 * `show_ruleset = 'wusv'` show is checked. Idempotent: a show already in
 * canonical order reports "already canonical" and writes nothing.
 *
 *   DATABASE_URL=... npx tsx scripts/resort-sv-show-classes.ts                    # dry run, all wusv shows
 *   DATABASE_URL=... npx tsx scripts/resort-sv-show-classes.ts --show <uuid>       # dry run, one show
 *   DATABASE_URL=... npx tsx scripts/resort-sv-show-classes.ts --apply             # write, all wusv shows
 *   DATABASE_URL=... npx tsx scripts/resort-sv-show-classes.ts --show <uuid> --apply
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/server/db';
import { shows, showClasses } from '../src/server/db/schema';
import { canonicalSvClassOrder, isJuniorHandler } from '../src/lib/class-labels';
import { resortCatalogueNumbers } from '../src/server/services/catalogue-numbering';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const showIdFilter = argValue('--show');

  const targetShows = showIdFilter
    ? await db.query.shows.findMany({
        where: and(eq(shows.id, showIdFilter), eq(shows.showRuleset, 'wusv')),
        columns: { id: true, name: true },
      })
    : await db.query.shows.findMany({
        where: eq(shows.showRuleset, 'wusv'),
        columns: { id: true, name: true },
      });

  if (showIdFilter && targetShows.length === 0) {
    console.log(`No wusv show found with id ${showIdFilter} (either it doesn't exist or isn't a wusv show).`);
    return;
  }

  console.log(`Checking ${targetShows.length} wusv show(s).\n`);

  let touched = 0;

  for (const show of targetShows) {
    const rows = await db.query.showClasses.findMany({
      where: eq(showClasses.showId, show.id),
      with: { classDefinition: true },
      orderBy: (sc, { asc }) => [asc(sc.sortOrder), asc(sc.classNumber)],
    });

    if (rows.length === 0) {
      console.log(`── ${show.name} (${show.id}) — no classes, skipping.`);
      continue;
    }

    const canonical = canonicalSvClassOrder(rows);
    const alreadyCanonical = canonical.every((r, i) => r.id === rows[i].id);

    console.log(`── ${show.name} (${show.id}) — ${rows.length} class(es)`);
    if (alreadyCanonical) {
      console.log(`   already canonical — nothing to do.\n`);
      continue;
    }

    // Before/after table, keyed by the OLD sort position so it's easy to see
    // what moved.
    const label = (r: (typeof rows)[number]) =>
      `${r.classDefinition?.name ?? '?'} · ${r.sex ?? 'n/a'} · ${r.svCoatType ?? 'n/a'} (was #${r.classNumber ?? '—'}, sort ${r.sortOrder})`;
    console.log('   before                                                        →  after');
    const maxLen = Math.max(rows.length, canonical.length);
    for (let i = 0; i < maxLen; i++) {
      const before = rows[i] ? label(rows[i]) : '';
      const after = canonical[i] ? label(canonical[i]) : '';
      console.log(`   ${String(i).padStart(2, ' ')}. ${before.padEnd(58)} →  ${after}`);
    }
    console.log('');

    touched++;

    if (!apply) continue;

    // sort_order = position for EVERY row; class_number = position + 1 for
    // sexed breed classes only (JH keeps class_number = null, as today).
    for (let i = 0; i < canonical.length; i++) {
      const row = canonical[i];
      const isSexedBreedClass = !isJuniorHandler(row) && (row.sex === 'dog' || row.sex === 'bitch');
      await db
        .update(showClasses)
        .set({
          sortOrder: i,
          classNumber: isSexedBreedClass ? i + 1 : row.classNumber,
        })
        .where(eq(showClasses.id, row.id));
    }

    const { assigned } = await resortCatalogueNumbers(db, show.id);
    console.log(`   APPLIED — reordered ${canonical.length} class(es); resorted ${assigned} catalogue number(s).\n`);
  }

  if (!apply) {
    console.log(`DRY RUN — ${touched} show(s) would change. Re-run with --apply to write.`);
  } else {
    console.log(`APPLIED — ${touched} show(s) updated.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
