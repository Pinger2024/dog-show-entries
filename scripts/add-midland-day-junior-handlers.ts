/**
 * One-shot: add the two Junior Handlers entered ON THE DAY at the Midlands Region
 * GSD Group "Regional Show" (4 Oct 2026), with their placings, and Julia
 * Sobolewska's placing — Mandy asked for this on 6 Oct 2026.
 *
 *   "6-11 year class 2nd place was grace wottan … 12-16 years class Smilte
 *    jacunskyte. Both her and Julia were joint 1st … Number wise just give them
 *    the last 2 numbers"
 *
 * A script, not the UI: `secretary.createManualEntry` needs a dog and an open
 * show, and a Junior Handler entry has no dog (the parked gap in
 * project_jh_manual_entry_gap). Mirrors scripts/add-jh-entry-alexxa-cowan.ts.
 *
 * Nothing is invented. Both children are already on file from earlier shows,
 * under a parent's account:
 *  - Grace-Jane Wotton, born 2018-10-23, Sarah Hill's account (South Western,
 *    6-11). Sarah Hill also has a dog entered at this show (ring 214).
 *  - Smilte Jacunskyte, born 2009-12-27, Rasita Jacunskiene's account (BAGSD,
 *    12-16).
 * Junior Handling was free at this show, so each entry is £0 on a £0
 * "paid direct to the club" order — no money moves and the issued statement's
 * figures are unchanged.
 *
 * Ring numbers 219 and 220 follow the last printed number (218); the show's
 * numbers are locked, so nothing is re-sorted.
 *
 * Joint 1st: Remi's steward screen holds one handler per placing, so it can't
 * record a tie; written here directly. The public results page lists every
 * result, so both show as 1st.
 *
 *   npx tsx scripts/add-midland-day-junior-handlers.ts           # dry run
 *   npx tsx scripts/add-midland-day-junior-handlers.ts --commit  # write
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';

const COMMIT = process.argv.includes('--commit');

const SHOW_ID = '07e3287d-a6b9-4ee0-b0e4-2c2d07e2857f'; // Midlands Region GSD Group — Regional Show
/** Mandy McAteer — she asked for it, so the audit trail and results name her. */
const REQUESTED_BY_USER_ID = '75e32446-9b97-4e70-9ed5-a6d8987af7af';

const NEW_HANDLERS = [
  {
    handlerName: 'Grace-Jane Wotton',
    dateOfBirth: '2018-10-23',
    exhibitorEmail: 'sarahhill1971@outlook.com',
    className: 'Junior Handler (6-11)',
    catalogueNumber: '219',
    placement: 2,
  },
  {
    handlerName: 'Smilte Jacunskyte',
    dateOfBirth: '2009-12-27',
    exhibitorEmail: 'rasitaj85@gmail.com',
    className: 'Junior Handler (12-16)',
    catalogueNumber: '220',
    placement: 1,
  },
] as const;

/** Julia was already entered online (ring 218) but had no placing recorded. */
const JULIA_ENTRY_CLASS_ID = 'd6f2bd1b-d962-42d9-bd52-4cdc946abb1e';
const JULIA_PLACEMENT = 1;

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const db = drizzle(client, { schema });
  console.log(`DB: ${process.env.DATABASE_URL!.replace(/:\/\/[^:]+:[^@]+@/, '://***@')}`);
  console.log(COMMIT ? '*** COMMIT MODE — this will write ***\n' : 'DRY RUN (pass --commit to write)\n');

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, SHOW_ID),
    columns: { id: true, name: true, status: true, catalogueNumbersLockedAt: true },
  });
  if (!show) throw new Error('show not found');
  console.log(`show: ${show.name} (${show.status}), numbers ${show.catalogueNumbersLockedAt ? 'LOCKED' : 'unlocked'}`);

  const showClasses = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, show.id),
    with: { classDefinition: true },
  });

  const existing = await db
    .select({
      id: schema.entries.id,
      handler: schema.juniorHandlerDetails.handlerName,
      catalogueNumber: schema.entries.catalogueNumber,
    })
    .from(schema.entries)
    .innerJoin(schema.juniorHandlerDetails, eq(schema.juniorHandlerDetails.entryId, schema.entries.id))
    .where(and(eq(schema.entries.showId, show.id), isNull(schema.entries.deletedAt)));
  console.log(`junior handlers already on this show: ${existing.map((e) => `${e.handler} (#${e.catalogueNumber})`).join(', ')}\n`);

  const plans: Array<
    (typeof NEW_HANDLERS)[number] & { exhibitorId: string; exhibitorName: string | null; showClassId: string; fee: number }
  > = [];
  for (const h of NEW_HANDLERS) {
    if (existing.some((e) => e.handler.trim().toLowerCase() === h.handlerName.toLowerCase())) {
      throw new Error(`${h.handlerName} is already entered — nothing should be added twice`);
    }
    const numberTaken = await db.query.entries.findFirst({
      where: and(eq(schema.entries.showId, show.id), eq(schema.entries.catalogueNumber, h.catalogueNumber)),
      columns: { id: true },
    });
    if (numberTaken) throw new Error(`ring number ${h.catalogueNumber} is already used on this show`);
    const exhibitor = await db.query.users.findFirst({
      where: eq(schema.users.email, h.exhibitorEmail),
      columns: { id: true, name: true },
    });
    if (!exhibitor) throw new Error(`no account ${h.exhibitorEmail}`);
    const jhClass = showClasses.find((sc) => sc.classDefinition?.name === h.className);
    if (!jhClass || jhClass.classDefinition?.type !== 'junior_handler') throw new Error(`no class "${h.className}"`);
    plans.push({ ...h, exhibitorId: exhibitor.id, exhibitorName: exhibitor.name, showClassId: jhClass.id, fee: jhClass.entryFee });
    console.log(
      `ADD  #${h.catalogueNumber} ${h.handlerName} (born ${h.dateOfBirth}) → ${h.className}, placed ${h.placement}, ` +
        `under ${exhibitor.name}, fee £${(jhClass.entryFee / 100).toFixed(2)}`,
    );
  }
  if (plans.some((p) => p.fee !== 0)) throw new Error('expected free Junior Handling — stop and ask');

  const julia = await db.query.results.findFirst({
    where: eq(schema.results.entryClassId, JULIA_ENTRY_CLASS_ID),
    columns: { id: true, placement: true },
  });
  if (julia) throw new Error(`Julia already has a result (placement ${julia.placement}) — stop and ask`);
  console.log(`SET  #218 Julia Sobolewska → placed ${JULIA_PLACEMENT} (joint 1st with Smilte)\n`);

  if (!COMMIT) {
    console.log('Dry run — nothing written.');
    await client.end();
    return;
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const p of plans) {
      // No Stripe PaymentIntent — "paid direct to the club"; £0, so no money moves.
      const [order] = await tx
        .insert(schema.orders)
        .values({ showId: show.id, exhibitorId: p.exhibitorId, status: 'paid', totalAmount: 0, platformFeePence: 0 })
        .returning();
      const [entry] = await tx
        .insert(schema.entries)
        .values({
          showId: show.id,
          dogId: null, // a Junior Handler entry has no dog
          exhibitorId: p.exhibitorId,
          orderId: order!.id,
          entryType: 'junior_handler',
          status: 'confirmed',
          totalFee: 0,
          isNfc: false,
          catalogueNumber: p.catalogueNumber,
        })
        .returning();
      const [ec] = await tx
        .insert(schema.entryClasses)
        .values({ entryId: entry!.id, showClassId: p.showClassId, fee: 0 })
        .returning();
      await tx.insert(schema.juniorHandlerDetails).values({
        entryId: entry!.id,
        handlerName: p.handlerName,
        dateOfBirth: p.dateOfBirth,
        kcNumber: null,
      });
      await tx.insert(schema.results).values({
        entryClassId: ec!.id,
        placement: p.placement,
        recordedBy: REQUESTED_BY_USER_ID,
        recordedAt: now,
        publishedAt: now,
      });
      await tx.insert(schema.entryAuditLog).values({
        entryId: entry!.id,
        action: 'created',
        userId: REQUESTED_BY_USER_ID,
        changes: {
          source: 'secretary',
          paymentMethod: 'cash',
          exhibitorEmail: p.exhibitorEmail,
          handlerName: p.handlerName,
          handlerDob: p.dateOfBirth,
          catalogueNumber: p.catalogueNumber,
          placement: p.placement,
        },
        reason:
          "Junior Handler entered on the day at the Midland Regional (4 Oct 2026), added on Mandy's request " +
          '(6 Oct). Created by script because createManualEntry needs a dog and an open show.',
      });
    }
    await tx.insert(schema.results).values({
      entryClassId: JULIA_ENTRY_CLASS_ID,
      placement: JULIA_PLACEMENT,
      recordedBy: REQUESTED_BY_USER_ID,
      recordedAt: now,
      publishedAt: now,
    });
  });
  console.log('WRITTEN.\n');

  const check = await db
    .select({
      number: schema.entries.catalogueNumber,
      handler: schema.juniorHandlerDetails.handlerName,
      placement: schema.results.placement,
      published: schema.results.publishedAt,
    })
    .from(schema.entries)
    .innerJoin(schema.juniorHandlerDetails, eq(schema.juniorHandlerDetails.entryId, schema.entries.id))
    .innerJoin(schema.entryClasses, eq(schema.entryClasses.entryId, schema.entries.id))
    .leftJoin(schema.results, eq(schema.results.entryClassId, schema.entryClasses.id))
    .where(and(eq(schema.entries.showId, show.id), isNull(schema.entries.deletedAt)));
  for (const c of check) console.log(`  #${c.number} ${c.handler}: placed ${c.placement ?? '—'}${c.published ? ', published' : ''}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
