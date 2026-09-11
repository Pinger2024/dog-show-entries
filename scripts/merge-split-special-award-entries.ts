/**
 * Merge split Special Award Class entries so a dog holds ONE catalogue number.
 *
 * Mandy, 2026-07-27: "they should always keep the same catalogue number
 * throughout the show". On South Western, four dogs had TWO entry rows and so
 * two catalogue numbers, because the exhibitor came back later and bought a
 * Special Award Class as a separate purchase. The other twenty Special Award
 * dogs picked theirs at the same time as their main class, so those landed on
 * one entry row with two classes — the shape this script reproduces:
 *
 *     one entry · total_fee = sum of its class fees · one catalogue number
 *     · one entry_classes row per class, each carrying its own fee
 *
 * Per dog it moves the Special Award class onto the surviving entry, adds its
 * fee, repoints the payment so the money still ties to a live row, then
 * SOFT-deletes the absorbed entry (hard delete would cascade through
 * entry_classes / entry_audit_log / junior_handler_details).
 *
 * MONEY: a merge must never move a fee between settlement columns. LORNSTONE
 * SIJUR is the case in point — its main entry came through Remi but its
 * Special Award £3 was paid direct to the club, so merging would have Remi
 * owing the club £3 the club already holds. Michael's rule is that everything
 * reconciles to the penny, so cross-channel merges are REFUSED by default and
 * reported. Those dogs get their single catalogue number from dog-aware
 * numbering instead, which moves no money at all.
 *
 *   npx tsx scripts/merge-split-special-award-entries.ts           # dry run
 *   npx tsx scripts/merge-split-special-award-entries.ts --commit  # write
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, ilike, isNull, sql } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';

const COMMIT = process.argv.includes('--commit');
/**
 * A merge collapses two entries onto one order. Where those orders were paid
 * through different routes (Remi vs direct to the club) that silently moves the
 * absorbed fee between settlement columns, and the club's payout stops
 * reconciling to the penny. Refused by default — the numbering fix handles
 * those dogs instead, without touching money.
 */
const ALLOW_CHANNEL_CROSSING = process.argv.includes('--allow-channel-crossing');
const SHOW_NAME_LIKE = '%South Western%';
const SPECIAL_AWARD_PREFIX = 'Special Award';
/** Mandy McAteer — she asked for the merge. */
const REQUESTED_BY_USER_ID = '75e32446-9b97-4e70-9ed5-a6d8987af7af';

type Candidate = {
  dogName: string;
  survivorId: string;
  survivorFee: number;
  survivorOffline: boolean;
  survivorClasses: string[];
  absorbedId: string;
  absorbedFee: number;
  absorbedOffline: boolean;
  absorbedClasses: string[];
  absorbedCatalogueNumber: string | null;
};

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client, { schema });

  console.log(`DB: ${process.env.DATABASE_URL!.replace(/:\/\/[^:]+:[^@]+@/, '://***@')}`);
  console.log(COMMIT ? '*** COMMIT MODE — this will write ***\n' : 'DRY RUN (pass --commit to write)\n');

  const show = await db.query.shows.findFirst({
    where: ilike(schema.shows.name, SHOW_NAME_LIKE),
    columns: { id: true, name: true, catalogueNumbersLockedAt: true },
  });
  if (!show) throw new Error('show not found');
  if (show.catalogueNumbersLockedAt) {
    throw new Error('catalogue numbers are LOCKED — refusing to reshape entries');
  }
  console.log(`show: ${show.name}\n`);

  const rows = await db
    .select({
      entryId: schema.entries.id,
      dogId: schema.entries.dogId,
      dogName: schema.dogs.registeredName,
      totalFee: schema.entries.totalFee,
      catalogueNumber: schema.entries.catalogueNumber,
      className: schema.classDefinitions.name,
      offline: sql<boolean>`${schema.orders.stripePaymentIntentId} IS NULL`,
    })
    .from(schema.entries)
    .innerJoin(schema.dogs, eq(schema.dogs.id, schema.entries.dogId))
    .innerJoin(schema.orders, eq(schema.orders.id, schema.entries.orderId))
    .leftJoin(schema.entryClasses, eq(schema.entryClasses.entryId, schema.entries.id))
    .leftJoin(schema.showClasses, eq(schema.showClasses.id, schema.entryClasses.showClassId))
    .leftJoin(schema.classDefinitions, eq(schema.classDefinitions.id, schema.showClasses.classDefinitionId))
    .where(
      and(
        eq(schema.entries.showId, show.id),
        eq(schema.entries.status, 'confirmed'),
        isNull(schema.entries.deletedAt),
      ),
    );

  // Collapse the class join back into one record per entry.
  const byEntry = new Map<
    string,
    { dogId: string; dogName: string; fee: number; cat: string | null; offline: boolean; classes: string[] }
  >();
  for (const r of rows) {
    const e = byEntry.get(r.entryId) ?? {
      dogId: r.dogId!,
      dogName: r.dogName ?? '(unnamed)',
      fee: r.totalFee,
      cat: r.catalogueNumber,
      offline: r.offline,
      classes: [],
    };
    if (r.className) e.classes.push(r.className);
    byEntry.set(r.entryId, e);
  }

  const byDog = new Map<string, string[]>();
  for (const [entryId, e] of byEntry) {
    byDog.set(e.dogId, [...(byDog.get(e.dogId) ?? []), entryId]);
  }

  const isSac = (n: string) => n.startsWith(SPECIAL_AWARD_PREFIX);
  let candidates: Candidate[] = [];
  const skipped: string[] = [];

  for (const [, entryIds] of byDog) {
    if (entryIds.length < 2) continue;
    if (entryIds.length > 2) {
      skipped.push(`${byEntry.get(entryIds[0])!.dogName}: ${entryIds.length} entries — needs a human`);
      continue;
    }
    const [a, b] = entryIds.map((id) => ({ id, ...byEntry.get(id)! }));
    // The absorbed entry is the one whose classes are ALL Special Award.
    const aAllSac = a.classes.length > 0 && a.classes.every(isSac);
    const bAllSac = b.classes.length > 0 && b.classes.every(isSac);
    if (aAllSac === bAllSac) {
      skipped.push(`${a.dogName}: can't tell which entry is the Special Award one — needs a human`);
      continue;
    }
    const absorbed = aAllSac ? a : b;
    const survivor = aAllSac ? b : a;
    candidates.push({
      dogName: survivor.dogName,
      survivorId: survivor.id,
      survivorFee: survivor.fee,
      survivorOffline: survivor.offline,
      survivorClasses: survivor.classes,
      absorbedId: absorbed.id,
      absorbedFee: absorbed.fee,
      absorbedOffline: absorbed.offline,
      absorbedClasses: absorbed.classes,
      absorbedCatalogueNumber: absorbed.cat,
    });
  }

  candidates.sort((x, y) => x.dogName.localeCompare(y.dogName));

  // Hold back anything that would move money between settlement columns.
  const crossing = candidates.filter((c) => c.survivorOffline !== c.absorbedOffline);
  if (crossing.length > 0 && !ALLOW_CHANNEL_CROSSING) {
    for (const c of crossing) {
      const dir = c.absorbedOffline ? 'direct-to-club → Remi-collected' : 'Remi-collected → direct-to-club';
      skipped.push(
        `${c.dogName}: merging would move £${(c.absorbedFee / 100).toFixed(2)} ${dir} — ` +
          'held back so the payout still reconciles to the penny',
      );
    }
    candidates = candidates.filter((c) => c.survivorOffline === c.absorbedOffline);
  }

  if (skipped.length) {
    console.log('SKIPPED (not safe to merge automatically):');
    for (const s of skipped) console.log(`  ! ${s}`);
    console.log();
  }
  if (candidates.length === 0) {
    console.log('Nothing to merge — every dog already holds a single entry.');
    await client.end();
    return;
  }

  let crossings = 0;
  console.log(`${candidates.length} dog(s) to merge:\n`);
  for (const c of candidates) {
    const crosses = c.survivorOffline !== c.absorbedOffline;
    if (crosses) crossings++;
    console.log(`  ${c.dogName}`);
    console.log(`    keep    : ${c.survivorClasses.join(', ')} — £${(c.survivorFee / 100).toFixed(2)}`);
    console.log(`    absorb  : ${c.absorbedClasses.join(', ')} — £${(c.absorbedFee / 100).toFixed(2)} (cat #${c.absorbedCatalogueNumber ?? '—'})`);
    console.log(`    new fee : £${((c.survivorFee + c.absorbedFee) / 100).toFixed(2)}`);
    if (crosses) {
      const dir = c.absorbedOffline ? 'direct-to-club → Remi-collected' : 'Remi-collected → direct-to-club';
      console.log(`    ⚠ MONEY MOVES CHANNEL: £${(c.absorbedFee / 100).toFixed(2)} ${dir}`);
    }
    console.log();
  }

  if (crossings > 0) {
    console.log(`⚠ ${crossings} merge(s) shift money between settlement columns — see MONEY NOTE at the top.\n`);
  }

  // A dry run that doesn't touch the write path proves nothing — the first
  // --commit attempt died on an enum the dry run never exercised. So rehearse
  // the real transaction against real constraints, then roll it back.
  const ROLLBACK = Symbol('rehearsal');

  for (const c of candidates) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(schema.entryClasses)
          .set({ entryId: c.survivorId })
          .where(eq(schema.entryClasses.entryId, c.absorbedId));

        await tx
          .update(schema.entries)
          .set({ totalFee: c.survivorFee + c.absorbedFee, updatedAt: new Date() })
          .where(eq(schema.entries.id, c.survivorId));

        // Keep the payment attached to a live entry.
        await tx
          .update(schema.payments)
          .set({ entryId: c.survivorId })
          .where(eq(schema.payments.entryId, c.absorbedId));

        // Soft delete — hard delete would cascade the classes we just moved.
        // Number cleared so a stale one can never resurface in a render.
        await tx
          .update(schema.entries)
          .set({ deletedAt: new Date(), catalogueNumber: null, updatedAt: new Date() })
          .where(eq(schema.entries.id, c.absorbedId));

        await tx.insert(schema.entryAuditLog).values({
          entryId: c.survivorId,
          // The absorbed entry's class moves onto this one — that is precisely
          // a class transfer. ('updated' is not a member of the enum.)
          action: 'class_transferred',
          userId: REQUESTED_BY_USER_ID,
          changes: {
            merged: 'special_award_entry',
            absorbedEntryId: c.absorbedId,
            absorbedClasses: c.absorbedClasses,
            absorbedFeePence: c.absorbedFee,
            absorbedCatalogueNumber: c.absorbedCatalogueNumber,
            moneyChangedSettlementColumn: c.survivorOffline !== c.absorbedOffline,
          },
          reason:
            'Special Award Class bought separately was merged onto the main entry so the dog ' +
            'holds one catalogue number (Mandy, 2026-07-27).',
        });

        if (!COMMIT) throw ROLLBACK;
      });
      console.log(`merged: ${c.dogName}`);
    } catch (err) {
      if (err === ROLLBACK) {
        console.log(`rehearsed OK (rolled back): ${c.dogName}`);
        continue;
      }
      throw err;
    }
  }

  if (!COMMIT) {
    console.log('\nDry run — every write rehearsed against the real database, then rolled back.');
    console.log('Re-run with --commit to keep the changes.');
    await client.end();
    return;
  }

  const after = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.entries)
    .where(
      and(
        eq(schema.entries.showId, show.id),
        eq(schema.entries.status, 'confirmed'),
        isNull(schema.entries.deletedAt),
      ),
    );
  console.log(`\nconfirmed live entries now: ${after[0]!.n}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
